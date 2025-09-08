from collections.abc import Awaitable
from typing import Any, Optional, Union, cast

from azure.search.documents.agent.aio import KnowledgeAgentRetrievalClient
from azure.search.documents.aio import SearchClient
from azure.search.documents.models import VectorQuery
from openai import AsyncOpenAI, AsyncStream
from quart import current_app
from openai.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionMessageParam,
    ChatCompletionToolParam,
)

from approaches.approach import DataPoints, ExtraInfo, ThoughtStep
from approaches.chatapproach import ChatApproach
from approaches.promptmanager import PromptManager
from core.authentication import AuthenticationHelper

from bot_profiles import DEFAULT_BOT_ID, BOTS

import logging
import time
import asyncio

# Add this import at the top of your chatreadretrieveredread.py file
from approaches.confluence_search import confluence_service
from approaches.dual_search_helper import DualSearchHelper
from approaches.confluence_search import SearchConfig


# Add these helper functions to convert dictionary results


def confluence_result_to_text_source(result: dict) -> str:
    """Convert Confluence search result to text source with URL and title"""
    title = result.get("title", "Untitled")
    summary = result.get("summary", "")
    content = result.get("content", "")
    url = result.get("url", "")
    author = result.get("author", "")
    last_modified = result.get("last_modified", "")
    content_source = result.get("content_source", "")
    file_type = result.get("file_type", "")
    
    # Create special Confluence citation marker
    if url and title:
        citation_marker = f"CONFLUENCE_LINK|||{url}|||{title}"
    elif url:
        citation_marker = f"CONFLUENCE_LINK|||{url}|||Confluence Page"
    else:
        citation_marker = title  # Fallback to original behavior
    
    # Build the text source with citation marker at the beginning
    text_source = f"{citation_marker}\n\n"
    
    # Add metadata header
    text_source += f"**{title}**\n"
    
    if author:
        text_source += f"Author: {author}\n"
    if last_modified:
        text_source += f"Last Modified: {last_modified}\n"
    if file_type:
        text_source += f"File Type: {file_type}\n"
    if content_source:
        text_source += f"Content Type: {content_source}\n"
    
    text_source += "\n"  # Separator
    
    # Add content
    if content and len(content.strip()) > len(summary.strip()):
        text_source += f"**Full Content:**\n{content}\n"
        if summary and summary != content[:len(summary)]:
            text_source += f"\n**Summary:**\n{summary}\n"
    elif summary:
        text_source += f"**Summary:**\n{summary}\n"
    else:
        text_source += "**Content:** [No content available]\n"
    
    return text_source.strip()

def confluence_result_serialize_for_results(result: dict) -> dict:
    """Convert Confluence search result to serialized format for thoughts/logging with enhanced info"""
    return {
        "title": result.get("title", "Untitled"),
        "url": result.get("url", ""),
        "summary": result.get("summary", "")[:200] + "..." if len(result.get("summary", "")) > 200 else result.get("summary", ""),
        "content_length": len(result.get("content", "")),
        "has_full_content": len(result.get("content", "")) > 200,
        "content_enhanced": result.get("content_enhanced", False),
        "rank": result.get("rank", 0),
        "relevance_score": result.get("relevance_score", 0),
        "source": result.get("content_source", "confluence"),
        "author": result.get("author", ""),
        "file_type": result.get("file_type", ""),
        "last_modified": result.get("last_modified", "")
    }


class ChatReadRetrieveReadApproach(ChatApproach):
    """
    A multi-step approach that first uses OpenAI to turn the user's question into a search query,
    then uses Azure AI Search to retrieve relevant documents, and then sends the conversation history,
    original user question, and search results to OpenAI to generate a response.
    """

    def __init__(
        self,
        *,
        search_client: SearchClient,
        search_index_name: str,
        agent_model: Optional[str],
        agent_deployment: Optional[str],
        agent_client: KnowledgeAgentRetrievalClient,
        auth_helper: AuthenticationHelper,
        openai_client: AsyncOpenAI,
        chatgpt_model: str,
        chatgpt_deployment: Optional[str],  # Not needed for non-Azure OpenAI
        embedding_deployment: Optional[str],  # Not needed for non-Azure OpenAI or for retrieval_mode="text"
        embedding_model: str,
        embedding_dimensions: int,
        embedding_field: str,
        sourcepage_field: str,
        content_field: str,
        query_language: str,
        query_speller: str,
        prompt_manager: PromptManager,
        reasoning_effort: Optional[str] = None,
        confluence_token: str = "",
        confluence_email: str = "",
        search_clients: dict[str, SearchClient] = None,  # Dictionary of all search clients
        default_search_index: str = None,   
        standard_openai_client: AsyncOpenAI,  # Add explicit standard client
        reasoning_openai_client: AsyncOpenAI,  # Add explicit reasoning client
    ):
        self.search_client = search_client
        self.search_index_name = search_index_name
        self.agent_model = agent_model
        self.agent_deployment = agent_deployment
        self.agent_client = agent_client
        self.openai_client = openai_client
        self.auth_helper = auth_helper
        self.chatgpt_model = chatgpt_model
        self.chatgpt_deployment = chatgpt_deployment
        self.embedding_deployment = embedding_deployment
        self.embedding_model = embedding_model
        self.embedding_dimensions = embedding_dimensions
        self.embedding_field = embedding_field
        self.sourcepage_field = sourcepage_field
        self.content_field = content_field
        self.query_language = query_language
        self.query_speller = query_speller
        self.prompt_manager = prompt_manager
        self.query_rewrite_prompt = self.prompt_manager.load_prompt("chat_query_rewrite.prompty")
        self.query_rewrite_tools = self.prompt_manager.load_tools("chat_query_rewrite_tools.json")
        self.answer_prompt = self.prompt_manager.load_prompt("chat_answer_question.prompty")
        self.reasoning_effort = reasoning_effort
        self.include_token_usage = True
        self.confluence_token = confluence_token
        self.confluence_email = confluence_email
        self.search_clients = search_clients or {search_index_name: search_client}
        self.default_search_index = default_search_index or search_index_name
        self.standard_openai_client = standard_openai_client
        self.reasoning_openai_client = reasoning_openai_client
    
    def get_openai_client_for_model(self, model: str) -> AsyncOpenAI:
        """
        Returns the appropriate OpenAI client based on the model type.
        Uses reasoning client for reasoning models, standard client for others.
        """
        reasoning_model_support = self.GPT_REASONING_MODELS.get(model)
        
        if reasoning_model_support:
            logging.info(f"Using reasoning client for model: {model}")
            return self.reasoning_openai_client
        else:
            logging.info(f"Using standard client for model: {model}")
            return self.standard_openai_client


    async def run_until_final_call(
        self,
        messages: list[ChatCompletionMessageParam],
        overrides: dict[str, Any],
        auth_claims: dict[str, Any],
        should_stream: bool = False,
    ) -> tuple[ExtraInfo, Union[Awaitable[ChatCompletion], Awaitable[AsyncStream[ChatCompletionChunk]]]]:
        use_agentic_retrieval = True if overrides.get("use_agentic_retrieval") else False
        
        original_user_query = messages[-1]["content"]

        # Retrieve the bot_id from overrides (default to "ava" if not provided)
        bot_id = overrides.get("bot_id", DEFAULT_BOT_ID)
        profile = BOTS.get(bot_id, BOTS[DEFAULT_BOT_ID])

        # Validate artifact_type using helper method
        artifact_type = overrides.get("artifact_type")
        validated_artifact_type = profile.validate_artifact(artifact_type)

        if artifact_type and not validated_artifact_type:
            logging.warning(f"⚠️ Artifact '{artifact_type}' is not valid for bot '{bot_id}'. Valid artifacts: {profile.valid_artifacts}")
        elif validated_artifact_type:
            logging.info(f"✅ Using artifact '{validated_artifact_type}' for bot '{bot_id}'")
        
        
        # Set model override
        overrides["model_override"] = profile.model
        if hasattr(profile, 'deployment') and profile.deployment:  # Add deployment override
            overrides["deployment_override"] = profile.deployment

        # Get the model and deployment to use
        model_to_use = overrides.get("model_override", self.chatgpt_model)
        deployment_to_use = overrides.get("deployment_override", self.chatgpt_deployment)

        client_to_use = self.get_openai_client_for_model(model_to_use)

        reasoning_model_support = self.GPT_REASONING_MODELS.get(model_to_use)
        if reasoning_model_support and (not reasoning_model_support.streaming and should_stream):
            raise Exception(
                f"{model_to_use} does not support streaming. Please use a different model or disable streaming."
            )

        logging.info(f"Bot ID: {bot_id}, Profile: {profile.label}, Model: {profile.model}")

            # Handle bots with RAG disabled (like Tender Wizard)
        if profile.disable_rag:
            logging.info(f"RAG disabled for bot {bot_id} - using direct chat completion")
            extra_info = ExtraInfo(
                DataPoints(text=[]),  # No search results
                thoughts=[
                    ThoughtStep(
                        f"Direct chat completion for {profile.label}",
                        original_user_query,
                        {
                            "bot_id": bot_id,
                            "model": profile.model,
                            "rag_disabled": True,
                            "reason": "Bot configured for direct AI interaction without retrieval"
                        }
                    )
                ]
            )
        else:

            # Get search strategy from bot profile
            use_dual_search =  profile.dual_search
            use_confluence_search = profile.use_confluence_search  # THIS WAS MISSING!
            use_agentic_retrieval = True if overrides.get("use_agentic_retrieval") else False
            # Set search client for RAG-enabled bots
            self.search_client, self.search_index_name = self.get_search_client_for_bot(profile)
            logging.info(f"Using search index: {self.search_index_name}")
           
            logging.info(f"Search strategy - Confluence: {use_confluence_search}, Dual: {use_dual_search}, Agentic: {use_agentic_retrieval}")

            # Run the appropriate search approach
            if use_dual_search:
                logging.info("Using dual search approach")
                extra_info = await self.run_dual_search_approach(messages, overrides, auth_claims)
            elif use_confluence_search:
                logging.info("Using Confluence search approach")
                extra_info = await self.run_confluence_search_approach(messages, overrides, auth_claims)
            elif use_agentic_retrieval:
                logging.info("Using agentic retrieval approach")
                extra_info = await self.run_agentic_retrieval_approach(messages, overrides, auth_claims)
            else:
                logging.info("Using standard search approach")  
                extra_info = await self.run_search_approach(messages, overrides, auth_claims)
        
        prompt_template = profile.custom_prompt_template or "chat_answer_question.prompty"

        # Load the appropriate prompt template
        if profile.custom_prompt_template:
            # Load custom prompt template for this bot
            try:
                answer_prompt = self.prompt_manager.load_prompt(profile.custom_prompt_template)
                logging.info(f"Using custom prompt template: {prompt_template}")
            except Exception as e:
                logging.warning(f"Failed to load custom prompt {prompt_template}, falling back to default: {e}")
                answer_prompt = self.answer_prompt
        else:
            # Use default prompt template
            answer_prompt = self.answer_prompt

        attachment_sources = overrides.get("attachment_sources", [])

        messages = self.prompt_manager.render_prompt(
            answer_prompt,
            self.get_system_prompt_variables(overrides.get("prompt_template"))
            | {
                "include_follow_up_questions": bool(overrides.get("suggest_followup_questions")),
                "artifact_type": validated_artifact_type,
                "past_messages": messages[:-1],
                "user_query": original_user_query,
                "text_sources": extra_info.data_points.text,
                "attachment_sources": attachment_sources,
            },
        )

        # Ensure model_override is used when creating the chat completion
        model_to_use = overrides.get("model_override", self.chatgpt_model)  # Use
        deployment_to_use = overrides.get("deployment_override", self.chatgpt_deployment)

        original_client = self.openai_client
        self.openai_client = client_to_use

        try:
            chat_coroutine = cast(
                Union[Awaitable[ChatCompletion], Awaitable[AsyncStream[ChatCompletionChunk]]],
                self.create_chat_completion(
                    deployment_to_use,
                    model_to_use,
                    messages,
                    overrides,
                    self.get_response_token_limit(model_to_use, 1024),
                    should_stream,
                ),
            )

        finally:
            # Always restore the original client
            self.openai_client = original_client

        extra_info.thoughts.append(
            self.format_thought_step_for_chatcompletion(
                title="Prompt to generate answer",
                messages=messages,
                overrides=overrides,
                model=model_to_use,
                deployment=deployment_to_use,
                usage=None,
            )
        )
        return (extra_info, chat_coroutine)
    
    
    # Add this method to your ChatReadRetrieveReadApproach class in chatreadretrieveredread.py

    def get_search_client_for_bot(self, bot_profile) -> tuple[SearchClient, str]:
        """
        Returns the appropriate search client and index name for the given bot profile.
        Uses pre-loaded search clients for better performance.
        """
        index_name = bot_profile.primary_search_index or self.default_search_index
        
        if index_name not in self.search_clients:
            logging.warning(f"Search index '{index_name}' not found in pre-loaded clients. Using default.")
            index_name = self.default_search_index
        
        search_client = self.search_clients[index_name]
        logging.info(f"Bot '{bot_profile.id}' using search index: {index_name}")
        
        return search_client, index_name

    async def run_dual_search_approach(
        self, 
        messages: list[ChatCompletionMessageParam], 
        overrides: dict[str, Any], 
        auth_claims: dict[str, Any]
    ) -> ExtraInfo:
        """
        Dual search approach that combines results from both Confluence and Azure AI Search,
        then reranks them using FAISS to return the best results regardless of source.
        """
        logging.warning("🔍 Starting DUAL SEARCH approach (Confluence + Azure AI Search)")
        
        # Get the user query
        original_user_query = messages[-1]["content"]
        if not isinstance(original_user_query, str):
            raise ValueError("The most recent message content must be a string.")
        
        # Get user info for logging
        user_name = auth_claims.get("name", "Unknown")
        user_email = auth_claims.get("username", "Unknown")
        logging.warning(f"👤 Dual search requested by: {user_name} ({user_email})")
        
        # Get settings
        top = overrides.get("top", 20)
        dual_search_weight_confluence = overrides.get("dual_search_weight_confluence", 0.5)
        dual_search_weight_azure = overrides.get("dual_search_weight_azure", 0.5)
        
        # Store original top value and temporarily increase for better reranking
        original_top = overrides.get("top", 20)
        overrides["top"] = top * 2  # Get more results for better reranking
        
        # Initialize tasks for parallel execution
        tasks = []
        
        # Task 1: Confluence Search (reuse existing method)
        confluence_graph_token = overrides.get("graph_token")
        if confluence_graph_token:
            logging.warning("   📚 Creating Confluence search task...")
            confluence_task = self.run_confluence_search_approach(messages, overrides, auth_claims)
            tasks.append(("confluence", confluence_task))
        else:
            logging.warning("   ⚠️ No Confluence Graph token available, skipping Confluence search")
        
        # Task 2: Azure AI Search (reuse existing method)
        logging.warning("   🔷 Creating Azure AI Search task...")
        azure_task = self.run_search_approach(messages, overrides, auth_claims)
        tasks.append(("azure", azure_task))
        
        # Execute searches in parallel
        logging.warning("   ⚡ Executing searches in parallel...")
        search_start_time = time.time()
        
        confluence_extra_info = None
        azure_extra_info = None
        
        if tasks:
            results = await asyncio.gather(*[task[1] for task in tasks], return_exceptions=True)
            
            for i, (source, _) in enumerate(tasks):
                if isinstance(results[i], Exception):
                    logging.error(f"   ❌ {source} search failed: {results[i]}")
                else:
                    if source == "confluence":
                        confluence_extra_info = results[i]
                        logging.warning(f"   ✅ Confluence returned {len(confluence_extra_info.data_points.text or [])} results")
                    else:
                        azure_extra_info = results[i]
                        logging.warning(f"   ✅ Azure AI Search returned {len(azure_extra_info.data_points.text or [])} results")
        
        search_time = time.time() - search_start_time
        logging.warning(f"   ⏱️ Parallel search completed in {search_time:.2f}s")
        
        # Restore original top value
        overrides["top"] = original_top
        
        # Extract results and text sources from ExtraInfo objects
        confluence_results = []
        confluence_text_sources = []
        azure_results = []
        azure_text_sources = []
        
        if confluence_extra_info:
            # Get the already formatted text sources
            confluence_text_sources = confluence_extra_info.data_points.text or []
            # Extract raw results from thoughts for reranking
            for thought in confluence_extra_info.thoughts or []:
                if thought.title == "Enhanced Confluence search results with full content":
                    confluence_results = thought.description or []
                    break
        
        if azure_extra_info:
            # Get the already formatted text sources
            azure_text_sources = azure_extra_info.data_points.text or []
            # Extract raw results from thoughts for reranking
            for thought in azure_extra_info.thoughts or []:
                if thought.title == "Search results":
                    azure_results = thought.description or []
                    break
        
        # Combine and rerank results using FAISS
        all_results = []
        final_text_sources = []
        
        if confluence_results or azure_results:
            logging.warning("   🔄 Starting unified FAISS reranking...")
            rerank_start_time = time.time()
            
            # Add source type and original index to results
            for i, result in enumerate(confluence_results):
                result["source_type"] = "confluence"
                result["original_index"] = i
            for i, result in enumerate(azure_results):
                result["source_type"] = "azure"
                result["original_index"] = i
            
            # Initialize dual search helper
            
            dual_helper = DualSearchHelper(
                self.openai_client,             
                embedding_model=SearchConfig.EMBEDDING_MODEL,
                embedding_dimensions=SearchConfig.EMBEDDING_DIMENSIONS)
            
            # Combine results with source tracking
            all_results = await dual_helper.combine_and_rerank_dual_results(
                confluence_results,
                azure_results,
                original_user_query,
                original_top,  # Use original top value for final results
                dual_search_weight_confluence,
                dual_search_weight_azure
            )
            
            rerank_time = time.time() - rerank_start_time
            logging.warning(f"   ⏱️ FAISS reranking completed in {rerank_time:.2f}s")
            
            # Map reranked results back to their original text sources
            for result in all_results:
                if result["source_type"] == "confluence":
                    # Use the pre-formatted text source from Confluence
                    idx = result["original_index"]
                    if idx < len(confluence_text_sources):
                        final_text_sources.append(confluence_text_sources[idx])
                else:  # azure
                    # Use the pre-formatted text source from Azure
                    idx = result["original_index"]
                    if idx < len(azure_text_sources):
                        final_text_sources.append(azure_text_sources[idx])
        
        # Create combined ExtraInfo with comprehensive metadata
        extra_info = ExtraInfo(
            DataPoints(text=final_text_sources),
            thoughts=[
                ThoughtStep(
                    "Dual search using Confluence and Azure AI Search",
                    original_user_query,
                    {
                        "top": original_top,
                        "confluence_results": len(confluence_results),
                        "azure_results": len(azure_results),
                        "combined_results": len(all_results),
                        "search_time": f"{search_time:.2f}s",
                        "rerank_time": f"{rerank_time:.2f}s",
                        "weights": {
                            "confluence": dual_search_weight_confluence,
                            "azure": dual_search_weight_azure
                        }
                    }
                ),
                ThoughtStep(
                    "Combined search results after FAISS reranking",
                    [DualSearchHelper.serialize_dual_result(result) for result in all_results]
                )
            ]
        )
        
        # Log analysis
        DualSearchHelper.log_dual_search_analysis(all_results, confluence_results, azure_results)
        
        return extra_info

    # Also update your main search method to use the enhanced logging
    async def run_confluence_search_approach(
        self, 
        messages: list, 
        overrides: dict[str, Any], 
        auth_claims: dict[str, Any],
    ) -> ExtraInfo:
        """
        Enhanced Confluence search with better results and full content.
        ALWAYS uses standard client - never reasoning client for Confluence search.
        """
        logging.warning("Starting ENHANCED Confluence search approach")
        
        # Get the user query
        original_user_query = messages[-1]["content"]
        if not isinstance(original_user_query, str):
            raise ValueError("The most recent message content must be a string.")
        
        # Get user info for logging
        user_name = auth_claims.get("name", "Unknown")
        user_email = auth_claims.get("username", "Unknown")
        logging.warning(f"👤 Enhanced Confluence search requested by: {user_name} ({user_email})")

        # Get Confluence Graph token from auth_claims
        confluence_graph_token = overrides.get("graph_token")

        if not confluence_graph_token:
            logging.warning("❌ No Confluence Graph token available in overrides")
            return ExtraInfo(DataPoints(text=[]))
        
        logging.warning("✅ Confluence Graph token found in auth_claims")
            
        try:
            # ENHANCED: Use improved search with better query processing and full content
            top = overrides.get("top", 20)
            logging.warning(f"🔍 Starting enhanced search for: '{original_user_query}' (top {top})")
            
            # IMPORTANT: Always use standard client for Confluence search, never reasoning client
            logging.info("🔧 Using STANDARD client for Confluence search (never reasoning client)")
            
            confluence_results = await confluence_service.search_with_microsoft_graph(
                query=original_user_query,
                user_graph_token=confluence_graph_token,
                top=top,
                openai_client=self.standard_openai_client  # Always use standard client
            )
                
            if not confluence_results:
                logging.warning(f"⚠️ No enhanced results found for query: '{original_user_query}'")
                return ExtraInfo(DataPoints(text=[]))
            
            # ENHANCED: Use improved helper functions
            text_sources = [confluence_result_to_text_source(result) for result in confluence_results]

            # Create ExtraInfo with enhanced metadata
            extra_info = ExtraInfo(
                DataPoints(text=text_sources),
                thoughts=[
                    ThoughtStep(
                        "Enhanced Confluence search using signed-in user's Microsoft Graph token",
                        original_user_query,
                        {
                            "top": top,
                            "results_count": len(confluence_results),
                            "search_type": "enhanced_confluence_user_token",
                            "user": user_email,
                            "results_with_content": sum(1 for r in confluence_results if len(r.get("content", "")) > 200),
                            "enhanced_results": sum(1 for r in confluence_results if r.get("content_enhanced", False)),
                            "avg_content_length": sum(len(r.get("content", "")) for r in confluence_results) // len(confluence_results)
                        }
                    ),
                    ThoughtStep(
                        "Enhanced Confluence search results with full content",
                        [confluence_result_serialize_for_results(result) for result in confluence_results]
                    )
                ]
            )
                  
            return extra_info
            
        except Exception as e:
            logging.warning(f"❌ Error in enhanced Confluence search for {user_email}: {e}")
            import traceback
            logging.warning(f"Traceback: {traceback.format_exc()}")
            return ExtraInfo(DataPoints(text=[]))

    async def run_search_approach(
        self, messages: list[ChatCompletionMessageParam], overrides: dict[str, Any], auth_claims: dict[str, Any]
    ):
        use_text_search = overrides.get("retrieval_mode") in ["text", "hybrid", None]
        use_vector_search = overrides.get("retrieval_mode") in ["vectors", "hybrid", None]
        use_semantic_ranker = True if overrides.get("semantic_ranker") else False
        use_semantic_captions = True if overrides.get("semantic_captions") else False
        use_query_rewriting = True if overrides.get("query_rewriting") else False
        top = overrides.get("top", 3)
        minimum_search_score = overrides.get("minimum_search_score", 0.0)
        minimum_reranker_score = overrides.get("minimum_reranker_score", 0.0)
        search_index_filter = self.build_filter(overrides, auth_claims)

        original_user_query = messages[-1]["content"]
        if not isinstance(original_user_query, str):
            raise ValueError("The most recent message content must be a string.")

        query_messages = self.prompt_manager.render_prompt(
            self.query_rewrite_prompt, {"user_query": original_user_query, "past_messages": messages[:-1]}
        )
        tools: list[ChatCompletionToolParam] = self.query_rewrite_tools

        model_to_use = overrides.get("model_override", self.chatgpt_model)
        deployment_to_use = overrides.get("deployment_override", self.chatgpt_deployment)

        # CRITICAL: Temporarily swap the client for the appropriate model
        original_client = self.openai_client
        self.openai_client = self.get_openai_client_for_model(model_to_use)
        
        logging.info(f"Search approach using model: {model_to_use}, client type: {'reasoning' if self.openai_client == self.reasoning_openai_client else 'standard'}")

        try:
            # STEP 1: Generate an optimized keyword search query based on the chat history and the last question
            # The create_chat_completion method already handles reasoning vs standard models
            chat_completion = cast(
                ChatCompletion,
                await self.create_chat_completion(
                    deployment_to_use,
                    model_to_use,
                    messages=query_messages,
                    overrides=overrides,
                    response_token_limit=self.get_response_token_limit(
                        model_to_use, 100
                    ),
                    temperature=0.0,
                    tools=tools,
                    reasoning_effort="high",
                ),
            )
        finally:
            # Always restore the original client
            self.openai_client = original_client

        query_text = self.get_search_query(chat_completion, original_user_query)

        # STEP 2: Retrieve relevant documents from the search index with the GPT optimized query
        # If retrieval mode includes vectors, compute an embedding for the query
        vectors: list[VectorQuery] = []
        if use_vector_search:
            vectors.append(await self.compute_text_embedding(query_text))

        results = await self.search(
            top,
            query_text,
            search_index_filter,
            vectors,
            use_text_search,
            use_vector_search,
            use_semantic_ranker,
            use_semantic_captions,
            minimum_search_score,
            minimum_reranker_score,
            use_query_rewriting,
        )

        # STEP 3: Generate a contextual and content specific answer using the search results and chat history
        text_sources = self.get_sources_content(results, use_semantic_captions, use_image_citation=False)

        extra_info = ExtraInfo(
            DataPoints(text=text_sources),
            thoughts=[
                self.format_thought_step_for_chatcompletion(
                    title="Prompt to generate search query",
                    messages=query_messages,
                    overrides=overrides,
                    model=model_to_use,
                    deployment=deployment_to_use,
                    usage=chat_completion.usage,
                    reasoning_effort="high",
                ),
                ThoughtStep(
                    "Search using generated search query",
                    query_text,
                    {
                        "use_semantic_captions": use_semantic_captions,
                        "use_semantic_ranker": use_semantic_ranker,
                        "use_query_rewriting": use_query_rewriting,
                        "top": top,
                        "filter": search_index_filter,
                        "use_vector_search": use_vector_search,
                        "use_text_search": use_text_search
                    },
                ),
                ThoughtStep(
                    "Search results",
                    [result.serialize_for_results() for result in results],
                ),
            ],
        )
        return extra_info

    async def run_agentic_retrieval_approach(
        self,
        messages: list[ChatCompletionMessageParam],
        overrides: dict[str, Any],
        auth_claims: dict[str, Any],
    ):
        minimum_reranker_score = overrides.get("minimum_reranker_score", 0)
        search_index_filter = self.build_filter(overrides, auth_claims)
        top = overrides.get("top", 3)
        max_subqueries = overrides.get("max_subqueries", 10)
        results_merge_strategy = overrides.get("results_merge_strategy", "interleaved")
        # 50 is the amount of documents that the reranker can process per query
        max_docs_for_reranker = max_subqueries * 50

        response, results = await self.run_agentic_retrieval(
            messages=messages,
            agent_client=self.agent_client,
            search_index_name=self.search_index_name,
            top=top,
            filter_add_on=search_index_filter,
            minimum_reranker_score=minimum_reranker_score,
            max_docs_for_reranker=max_docs_for_reranker,
            results_merge_strategy=results_merge_strategy,
        )

        text_sources = self.get_sources_content(results, use_semantic_captions=False, use_image_citation=False)

        extra_info = ExtraInfo(
            DataPoints(text=text_sources),
            thoughts=[
                ThoughtStep(
                    "Use agentic retrieval",
                    messages,
                    {
                        "reranker_threshold": minimum_reranker_score,
                        "max_docs_for_reranker": max_docs_for_reranker,
                        "results_merge_strategy": results_merge_strategy,
                        "filter": search_index_filter,
                    },
                ),
                ThoughtStep(
                    f"Agentic retrieval results (top {top})",
                    [result.serialize_for_results() for result in results],
                    {
                        "query_plan": (
                            [activity.as_dict() for activity in response.activity] if response.activity else None
                        ),
                        "model": self.agent_model,
                        "deployment": self.agent_deployment,
                    },
                ),
            ],
        )
        return extra_info

