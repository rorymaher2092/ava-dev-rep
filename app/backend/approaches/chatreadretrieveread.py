from collections.abc import Awaitable
from typing import Any, Optional, Union, cast

from azure.search.documents.agent.aio import KnowledgeAgentRetrievalClient
from azure.search.documents.aio import SearchClient
from azure.search.documents.models import VectorQuery
from openai import AsyncOpenAI, AsyncStream
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

# Add this import at the top of your chatreadretrieveredread.py file
from approaches.confluence_search import confluence_service


# Add these helper functions to convert dictionary results

def confluence_result_to_text_source(result: dict) -> str:
    """Convert Confluence search result dictionary to text source for RAG"""
    title = result.get("title", "Untitled")
    summary = result.get("summary", "")
    url = result.get("url", "")
    
    # Format as text source that the LLM can use
    text_source = f"**{title}**\n"
    if url:
        text_source += f"Source: {url}\n"
    if summary:
        text_source += f"{summary}\n"
    
    return text_source.strip()

def confluence_result_serialize_for_results(result: dict) -> dict:
    """Convert Confluence search result to serialized format for thoughts/logging"""
    return {
        "title": result.get("title", "Untitled"),
        "url": result.get("url", ""),
        "summary": result.get("summary", "")[:200] + "..." if len(result.get("summary", "")) > 200 else result.get("summary", ""),
        "rank": result.get("rank", 0),
        "source": "confluence"
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

    async def run_until_final_call(
        self,
        messages: list[ChatCompletionMessageParam],
        overrides: dict[str, Any],
        auth_claims: dict[str, Any],
        should_stream: bool = False,
    ) -> tuple[ExtraInfo, Union[Awaitable[ChatCompletion], Awaitable[AsyncStream[ChatCompletionChunk]]]]:
        use_agentic_retrieval = True if overrides.get("use_agentic_retrieval") else False
        
        original_user_query = messages[-1]["content"]

        reasoning_model_support = self.GPT_REASONING_MODELS.get(self.chatgpt_model)
        if reasoning_model_support and (not reasoning_model_support.streaming and should_stream):
            raise Exception(
                f"{self.chatgpt_model} does not support streaming. Please use a different model or disable streaming."
            )

        # Retrieve the bot_id from overrides (default to "ava" if not provided)
        bot_id = overrides.get("bot_id", DEFAULT_BOT_ID)
        profile = BOTS.get(bot_id, BOTS[DEFAULT_BOT_ID])  # Default to 'ava' if bot_id is not found

        # Log the bot profile for debugging
        logging.info(f"Bot ID: {bot_id}, Bot Profile: {profile.label}")

        # Access the profile's properties and set overrides
        overrides.setdefault("model_override", profile.model)
        overrides.setdefault("examples", profile.examples)
        overrides.setdefault("prompt_template", profile.system_prompt)

        # Get search strategy from bot profile
        use_confluence_search = profile.use_confluence_search  # THIS WAS MISSING!
        use_agentic_retrieval = True if overrides.get("use_agentic_retrieval") else False

        logging.warning(f"Use Confluence search: {use_confluence_search}")
        logging.warning(f"Use agentic retrieval: {use_agentic_retrieval}")

        # Run the appropriate search approach (ONLY ONE!)
        if use_confluence_search:
            # Use Confluence search (configured in bot profile)
            logging.info("Using Confluence search approach (from bot profile)")
            extra_info = await self.run_confluence_search_approach(
                messages, overrides, auth_claims
            )
        elif use_agentic_retrieval:
            # Use agentic retrieval for Azure AI Search
            logging.info("Using agentic retrieval approach")
            extra_info = await self.run_agentic_retrieval_approach(messages, overrides, auth_claims)
        else:
            # Use standard Azure AI Search
            logging.info("Using standard search approach")  
            extra_info = await self.run_search_approach(messages, overrides, auth_claims)

        messages = self.prompt_manager.render_prompt(
            self.answer_prompt,
            self.get_system_prompt_variables(overrides.get("prompt_template"))
            | {
                "include_follow_up_questions": bool(overrides.get("suggest_followup_questions")),
                "past_messages": messages[:-1],
                "user_query": original_user_query,
                "text_sources": extra_info.data_points.text,
            },
        )

        # Ensure model_override is used when creating the chat completion
        model_to_use = overrides.get("model_override", self.chatgpt_model)  # Use

        chat_coroutine = cast(
            Union[Awaitable[ChatCompletion], Awaitable[AsyncStream[ChatCompletionChunk]]],
            self.create_chat_completion(
                self.chatgpt_deployment,
                model_to_use,
                messages,
                overrides,
                self.get_response_token_limit(self.chatgpt_model, 1024),
                should_stream,
            ),
        )
        extra_info.thoughts.append(
            self.format_thought_step_for_chatcompletion(
                title="Prompt to generate answer",
                messages=messages,
                overrides=overrides,
                model=self.chatgpt_model,
                deployment=self.chatgpt_deployment,
                usage=None,
            )
        )
        return (extra_info, chat_coroutine)
    
    # Add this method to your ChatReadRetrieveReadApproach class:

    async def run_confluence_search_approach(
        self, 
        messages: list, 
        overrides: dict[str, Any], 
        auth_claims: dict[str, Any],
    ) -> ExtraInfo:
        """
        Search Confluence content using Microsoft Graph with signed-in user's token
        """
        logging.warning("Starting Confluence search approach")
        
        # Get the user query
        original_user_query = messages[-1]["content"]
        if not isinstance(original_user_query, str):
            raise ValueError("The most recent message content must be a string.")
        
        # Get user info for logging
        user_name = auth_claims.get("name", "Unknown")
        user_email = auth_claims.get("username", "Unknown")
        logging.warning(f"👤 Confluence search requested by: {user_name} ({user_email})")

        # Get Confluence Graph token from auth_claims (this comes from the OBO flow)
        confluence_graph_token = auth_claims.get("graph_token")

        if not confluence_graph_token:
            logging.warning("❌ No Confluence Graph token available in auth_claims")
            logging.warning("   Check CONFLUENCE_GRAPH_CLIENT_ID and CONFLUENCE_GRAPH_CLIENT_SECRET")
            return ExtraInfo(DataPoints(text=[]))
        
        logging.warning("✅ Confluence Graph token found in auth_claims")
            
        try:
            # Search Confluence using the USER'S token (not app token)
            top = overrides.get("top", 20)
            logging.warning(f"🔍 Searching for: '{original_user_query}' (top {top})")
            
            # FIXED: Pass the user's Graph token to the service
            confluence_results = await confluence_service.search_all_microsoft_graph(
                query=original_user_query,
                user_graph_token=confluence_graph_token,  # User's token from OBO flow
                top=top
            )
            
            if not confluence_results:
                logging.warning(f"⚠️ No Confluence results found for query: '{original_user_query}'")
                return ExtraInfo(DataPoints(text=[]))
            
            # Convert results to text sources for RAG
            text_sources = [confluence_result_to_text_source(result) for result in confluence_results]

            # Initialize extra_info properly
            extra_info = ExtraInfo(
                DataPoints(text=text_sources)
            )
            
            # Initialize thoughts as empty list if None
            if extra_info.thoughts is None:
                extra_info.thoughts = []

            # Create ExtraInfo in the same format as your existing search
            extra_info = ExtraInfo(
                DataPoints(text=text_sources),
                thoughts=[
                    ThoughtStep(
                        "Search Confluence using signed-in user's Microsoft Graph token",
                        original_user_query,
                        {
                            "top": top,
                            "results_count": len(confluence_results),
                            "search_type": "confluence_user_token",
                            "user": user_email,
                            "connector_auto_discovered": True
                        }
                    ),
                    ThoughtStep(
                        "Confluence search results",
                        [confluence_result_serialize_for_results(result) for result in confluence_results]
                    )
                ]
            )
            
            logging.warning(f"✅ Confluence search completed - found {len(confluence_results)} results for {user_email}")
            
            # Log first few results for debugging
            for i, result in enumerate(confluence_results[:3], 1):
                logging.warning(f"   {i}. {result.title}")
            
            return extra_info
            
        except Exception as e:
            logging.warning(f"❌ Error in Confluence search for {user_email}: {e}")
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

        # STEP 1: Generate an optimized keyword search query based on the chat history and the last question

        chat_completion = cast(
            ChatCompletion,
            await self.create_chat_completion(
                self.chatgpt_deployment,
                self.chatgpt_model,
                messages=query_messages,
                overrides=overrides,
                response_token_limit=self.get_response_token_limit(
                    self.chatgpt_model, 100
                ),  # Setting too low risks malformed JSON, setting too high may affect performance
                temperature=0.0,  # Minimize creativity for search query generation
                tools=tools,
                reasoning_effort="low",  # Minimize reasoning for search query generation
            ),
        )

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
                    model=self.chatgpt_model,
                    deployment=self.chatgpt_deployment,
                    usage=chat_completion.usage,
                    reasoning_effort="low",
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
                        "use_text_search": use_text_search,
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

