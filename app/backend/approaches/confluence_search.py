"""
This code implements a comprehensive Confluence search service using a combination of lexical search 
and FAISS-based vector search for enhanced ranking and retrieval. It integrates with Microsoft Graph 
for accessing Confluence data and uses OpenAI for generating search keywords. The service is designed 
to work in both FAISS-enabled and FAISS-disabled modes, providing graceful fallbacks.

Key Features:
1. **FAISS Integration**: Enables vector-based search ranking when FAISS is available.
2. **Microsoft Graph API**: Fetches Confluence data using the Microsoft Graph connector.
3. **Concurrent Search**: Supports parallel keyword searches to reduce latency.
4. **OpenAI Keyword Generation**: Uses OpenAI to generate optimized search keywords from user queries.
5. **Result Enhancement**: Fetches detailed content for search results using the Confluence API.
6. **Error Handling and Diagnostics**: Includes a diagnostic function for troubleshooting FAISS installation issues.

Configuration Options:
- **FAISS and Lexical Weighting**: Configurable weighting between lexical and FAISS-based rankings.
- **Keyword Generation**: Control over whether to use exact query search or dynamically generated keywords.
- **API Limits**: Max number of concurrent API calls, searches, and embeddings.
- **Confluence API Authentication**: Secure authentication for fetching Confluence data.

Steps Followed:
1. **Check FAISS Availability**: 
   - Attempts to import `faiss_manager`. If unavailable, it logs a warning and uses lexical search only.

2. **Initialize ConfluenceSearchService**:
   - Creates the `ConfluenceSearchService` class. Initializes FAISS manager if available, otherwise falls back to lexical search.

3. **Search with Microsoft Graph**:
   - The main search method, which sends the query to Microsoft Graph and fetches results from Confluence.
   - Keywords are generated either from the exact query or using OpenAI for optimization.

4. **Parallel Keyword Search**:
   - Executes searches for each keyword in parallel, improving efficiency and reducing latency.

5. **FAISS Ranking and Embedding Generation**:
   - If FAISS is available, generates embeddings for results and ranks them based on vector similarity.
   - If FAISS is not available, uses lexical search for ranking.

6. **Progressive Ranking**:
   - Optionally, performs early ranking once a sufficient number of results are gathered, cancelling remaining searches.

7. **Final Ranking**:
   - Final ranking of results based on lexical and FAISS scores. Deduplicates results and limits to the top results.

8. **Confluence Content Enhancement**:
    - Fetches additional content / page content from the Confluence API for each result to provide detailed information.

9. **Return Final Results**:
    - Returns the final ranked results with all relevant metadata and content.
"""

import asyncio
import aiohttp
import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import sys
import time
import hashlib
import re
import base64, os
from bs4 import BeautifulSoup
from quart import current_app
from langchain_openai import AzureChatOpenAI

# GRACEFUL FAISS IMPORT - Won't crash if FAISS not available
try:
    from faiss_manager import FAISSManager
    FAISS_AVAILABLE = True
    logging.info("✅ FAISS available - vector search enabled")
except ImportError:
    logging.warning("⚠️ FAISS not available - falling back to lexical search only")
    FAISS_AVAILABLE = False
    FAISSManager = None

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

if not any(isinstance(handler, logging.StreamHandler) for handler in logger.handlers):
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)


import sys
import os
import subprocess
import importlib.util
from pathlib import Path
import logging

###
#  Configuration Toggles
###
class SearchConfig:
    # Search strategy toggles
    USE_EXACT_QUERY_SEARCH = False
    MAX_KEYWORDS = 2
    MAX_RETURNED_ITEMS = 3
    
    # Confluence connector configuration
    CONFLUENCE_CONNECTOR_ID = "ConfluenceCloud4"
    
    # Confluence API toggles
    USE_CONFLUENCE_API = True
    CONFLUENCE_API_TIMEOUT = 8
    
    # Embedding model configuration
    EMBEDDING_MODEL = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS = 1536
    
    # FAISS configuration
    FAISS_WEIGHT_LEXICAL = 0.3
    FAISS_WEIGHT_VECTOR = 0.7
    
    # Pipeline optimization
    MAX_CONCURRENT_SEARCHES = 5
    MAX_CONCURRENT_API_CALLS = 15
    MAX_CONCURRENT_EMBEDDINGS = 8
    PROGRESSIVE_RANKING_ENABLED = True
    
    # Confluence API setup
    CONFLUENCE_BASE_URL = "https://vocus.atlassian.net/wiki/rest/api"
    CONFLUENCE_EMAIL = os.environ.get("CONFLUENCE_EMAIL", "")
    CONFLUENCE_TOKEN = os.environ.get("CONFLUENCE_TOKEN", "")
    
    @staticmethod
    def get_confluence_auth():
        return "Basic " + base64.b64encode(
            f"{SearchConfig.CONFLUENCE_EMAIL}:{SearchConfig.CONFLUENCE_TOKEN}".encode()
        ).decode()


class ConfluenceSearchService:
    """
    SAFE VERSION: Confluence search with graceful FAISS fallback
    
    - Works with or without FAISS installed
    - Automatically disables vector search if FAISS unavailable
    - Maintains full functionality with lexical search
    """
    
    def __init__(self, openai_client=None, faiss_manager: Optional[Any] = None):
        self.openai_client = openai_client

        logger.warning("🔍 DEBUG: Starting ConfluenceSearchService init...")
        
        # Initialize FAISS manager only if available
        if FAISS_AVAILABLE and FAISSManager:
            try:
                self.faiss_manager = faiss_manager or FAISSManager(
                    embedding_dimensions=SearchConfig.EMBEDDING_DIMENSIONS,
                    lexical_weight=SearchConfig.FAISS_WEIGHT_LEXICAL,
                    vector_weight=SearchConfig.FAISS_WEIGHT_VECTOR
                )
                self.vector_search_enabled = True
                logger.info("✅ FAISS manager initialized - vector search enabled")
            except Exception as e:
                logger.warning(f"⚠️ FAISS manager initialization failed: {e}")
                self.faiss_manager = None
                self.vector_search_enabled = False
        else:
            self.faiss_manager = None
            self.vector_search_enabled = False
            logger.warning(f"📝 FAISS disabled - FAISS_AVAILABLE: {FAISS_AVAILABLE}, FAISSManager: {FAISSManager}")
        
        # Semaphores for rate limiting
        self.search_semaphore = asyncio.Semaphore(SearchConfig.MAX_CONCURRENT_SEARCHES)
        self.confluence_api_semaphore = asyncio.Semaphore(SearchConfig.MAX_CONCURRENT_API_CALLS)
        
    async def search_with_microsoft_graph(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20,
        openai_client=None,
        use_exact_query: Optional[bool] = None
    ) -> List[Any]:
        """
        MAIN SEARCH METHOD: Works with or without FAISS
        """
        use_exact = use_exact_query if use_exact_query is not None else SearchConfig.USE_EXACT_QUERY_SEARCH
        
        client = openai_client or self.openai_client
        
        return await self.search_confluence_connector(
            query=query,
            user_graph_token=user_graph_token,
            top=top,
            openai_client=client,
            use_faiss_reranking=self.vector_search_enabled,  # Automatically disable if FAISS unavailable
            use_exact_query=use_exact
        )
        
    async def search_confluence_connector(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20,
        openai_client=None,
        use_faiss_reranking: bool = True,
        use_exact_query: bool = False
    ) -> List[Any]:
        """
        SAFE VERSION: Confluence search with automatic FAISS fallback
        """
        search_mode = "PARALLEL+FAISS" if (use_faiss_reranking and self.vector_search_enabled) else "PARALLEL"
        logger.warning(f"🚀 Starting {search_mode} Confluence search for: '{query}' (top {top})")
        start_time = time.time()
        
        client = openai_client or self.openai_client
        if not client:
            logger.error("No OpenAI client available!")
            return []
        
        # Step 1: Generate search keywords or use exact query
        if use_exact_query:
            keywords = [query]
            logger.warning(f"   Using exact query search: '{query}'")
        else:
            keywords = await self.generate_search_keywords(query, client)
            logger.warning(f"   Generated {len(keywords)} keywords: {keywords}")
        
        # Step 2: Launch ALL keyword searches in parallel
        logger.warning("   🎯 Launching ALL keyword searches in parallel...")
        search_tasks = []
        
        for i, keyword in enumerate(keywords):
            task = self._search_and_process_keyword(
                keyword, user_graph_token, query, client, 
                use_faiss_reranking and self.vector_search_enabled,  # Auto-disable if FAISS unavailable
                f"batch_{i}"
            )
            search_tasks.append(task)
        
        # Step 3: Collect results as they complete
        all_results = []
        completed_count = 0
        
        for task_future in asyncio.as_completed(search_tasks):
            try:
                keyword_results = await task_future
                if keyword_results:
                    all_results.extend(keyword_results)
                    completed_count += 1
                    logger.warning(f"   ✅ Completed search {completed_count}/{len(keywords)} - {len(keyword_results)} results")
                    
                    # Progressive ranking (only if we have vector search)
                    if (SearchConfig.PROGRESSIVE_RANKING_ENABLED and 
                        self.vector_search_enabled and 
                        len(all_results) >= top * 2):
                        
                        logger.warning(f"   🏃 Early ranking with {len(all_results)} results...")
                        early_results = await self._rank_and_finalize_results(
                            all_results, query, top, client, use_faiss_reranking and self.vector_search_enabled
                        )
                        if len(early_results) >= top:
                            # Cancel remaining searches
                            for remaining_task in search_tasks:
                                if not remaining_task.done():
                                    remaining_task.cancel()
                            
                            total_time = time.time() - start_time
                            logger.warning(f"🏁 EARLY COMPLETION in {total_time:.2f}s: {len(early_results)} documents")
                            return early_results
                            
            except Exception as e:
                logger.warning(f"   ⚠️ Keyword search failed: {e}")
                completed_count += 1
        
        # Step 4: Final ranking of all results
        final_results = await self._rank_and_finalize_results(
            all_results, query, top, client, use_faiss_reranking and self.vector_search_enabled
        )
        
        total_time = time.time() - start_time
        logger.warning(f"✅ {search_mode} Confluence search completed in {total_time:.2f}s: {len(final_results)} documents")
        self._log_confluence_content_analysis(final_results)
        
        return final_results

    async def _search_and_process_keyword(
        self,
        keyword: str,
        user_graph_token: str,
        original_query: str,
        openai_client,
        use_faiss_reranking: bool,
        batch_id: str
    ) -> List[Dict]:
        """Process a single keyword completely in parallel"""
        async with self.search_semaphore:
            logger.warning(f"   🔍 Processing keyword: '{keyword}'")
            
            try:
                # Step 1: Search with keyword
                results = await self._search_confluence_with_keyword(
                    keyword, user_graph_token, SearchConfig.MAX_RETURNED_ITEMS
                )
                
                if not results:
                    logger.warning(f"   ❌ No results for keyword '{keyword}'")
                    return []
                
                logger.warning(f"   📄 Found {len(results)} results for '{keyword}'")
                
                # Step 2: Enhance content in parallel
                await self._enhance_results_with_content_parallel(results)
                
                # Step 3: Generate embeddings only if FAISS is available
                if use_faiss_reranking and self.vector_search_enabled and openai_client:
                    await self._generate_embeddings_parallel(results, openai_client, original_query)
                else:
                    # Add default scores for non-FAISS mode
                    for result in results:
                        result["has_embedding"] = False
                        result["in_faiss"] = False
                
                return results
                
            except Exception as e:
                logger.warning(f"   ⚠️ Failed to process keyword '{keyword}': {e}")
                return []

    async def _enhance_results_with_content_parallel(self, results: List[Dict]):
        """Enhance all results in parallel"""
        if SearchConfig.USE_CONFLUENCE_API:
            enhancement_tasks = []
            for result in results:
                if result.get("url"):
                    task = self._fetch_single_confluence_content(result)
                    enhancement_tasks.append(task)
            
            if enhancement_tasks:
                logger.warning(f"     🔄 Enhancing {len(enhancement_tasks)} results in parallel...")
                await asyncio.gather(*enhancement_tasks, return_exceptions=True)
        else:
            await self._use_summary_as_content(results)

    async def _generate_embeddings_parallel(self, results: List[Dict], openai_client, query: str):
        """Generate embeddings only if FAISS is available"""
        if not self.vector_search_enabled:
            return
        
        embedding_tasks = []
        
        for result in results:
            content = result.get("content", "")
            title = result.get("title", "")
            
            if len(content.strip()) > 20:
                full_text = f"{title}\n\n{content}"[:8000]
                doc_id = result.get("hit_id", result.get("url", ""))
                
                # Check if we already have this in FAISS
                if doc_id not in self.faiss_manager.document_metadata:
                    task = self._generate_single_embedding_and_add(
                        result, full_text, doc_id, openai_client
                    )
                    embedding_tasks.append(task)
                else:
                    result["has_embedding"] = True
                    result["in_faiss"] = True
        
        if embedding_tasks:
            logger.warning(f"     🧠 Generating {len(embedding_tasks)} embeddings in parallel...")
            await asyncio.gather(*embedding_tasks, return_exceptions=True)

    async def _generate_single_embedding_and_add(self, result: Dict, text: str, doc_id: str, openai_client):
        """Generate embedding and add to FAISS (only if available)"""
        if not self.vector_search_enabled:
            result["has_embedding"] = False
            result["in_faiss"] = False
            return
        
        try:
            documents = [{
                "id": doc_id,
                "text": text,
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "space": result.get("space_title", ""),
                "author": result.get("author", "")
            }]
            
            added_count = await self.faiss_manager.add_documents(
                documents=documents,
                openai_client=openai_client,
                model_name=self._get_embedding_model_name(),
                dimensions=SearchConfig.EMBEDDING_DIMENSIONS if "text-embedding-3" in SearchConfig.EMBEDDING_MODEL else None,
                metadata_fields=["title", "url", "space", "author"]
            )
            
            if added_count > 0:
                result["has_embedding"] = True
                result["in_faiss"] = True
                logger.debug(f"     ✅ Added to FAISS: {result.get('title', 'Unknown')}")
            else:
                result["has_embedding"] = False
                result["in_faiss"] = False
                
        except Exception as e:
            logger.warning(f"     ⚠️ Failed to generate embedding for {doc_id}: {e}")
            result["has_embedding"] = False
            result["in_faiss"] = False

    async def _rank_and_finalize_results(
        self,
        all_results: List[Dict],
        query: str,
        top: int,
        openai_client,
        use_faiss_reranking: bool
    ) -> List[Dict]:
        """Ranking with graceful FAISS fallback"""
        logger.warning(f"   📊 Ranking {len(all_results)} total results...")
        
        # Remove duplicates
        unique_results = self._deduplicate_confluence_results(all_results)
        logger.warning(f"   📋 After deduplication: {len(unique_results)} unique results")
        
        if use_faiss_reranking and self.vector_search_enabled and openai_client:
            try:
                # Use FAISS manager for vector search
                vector_results = await self.faiss_manager.search(
                    query_text=query,
                    openai_client=openai_client,
                    model_name=self._get_embedding_model_name(),
                    dimensions=SearchConfig.EMBEDDING_DIMENSIONS if "text-embedding-3" in SearchConfig.EMBEDDING_MODEL else None,
                    top_k=min(100, len(unique_results) * 2)
                )
                
                # Map FAISS scores back to results
                faiss_scores = {}
                for doc_id, similarity, metadata in vector_results:
                    faiss_scores[doc_id] = similarity
                
                # Add FAISS scores to results
                for result in unique_results:
                    doc_id = result.get("hit_id", result.get("url", ""))
                    if doc_id in faiss_scores:
                        result["faiss_score"] = faiss_scores[doc_id]
                        result["has_embedding"] = True
                    else:
                        result["faiss_score"] = 0.0
                        result["has_embedding"] = False
                
                # Use FAISS manager to combine scores
                enhanced_results = self.faiss_manager.combine_scores(
                    unique_results,
                    id_field="hit_id",
                    lexical_score_field="lexical_score",
                    vector_score_field="faiss_score"
                )
                
                logger.warning("   ✅ FAISS ranking completed")
                
            except Exception as e:
                logger.warning(f"   ⚠️ FAISS ranking failed, using lexical ranking: {e}")
                enhanced_results = self._apply_lexical_ranking(unique_results)
        else:
            # Pure lexical ranking
            enhanced_results = self._apply_lexical_ranking(unique_results)
            logger.warning("   📝 Using lexical ranking only")
        
        # Final ranking and limiting
        final_results = self._rank_and_limit_results(enhanced_results, query, top)
        
        # Save FAISS data if available
        if self.vector_search_enabled:
            self.faiss_manager.save()
        
        return final_results

    def _apply_lexical_ranking(self, results: List[Dict]) -> List[Dict]:
        """Apply simple lexical ranking when FAISS is not available"""
        for result in results:
            result["faiss_score"] = 0.0
            result["has_embedding"] = False
            result["combined_score"] = 1.0 / (result.get("rank", 1) + 1)
        return results

    def _get_embedding_model_name(self) -> str:
        """Get the correct model/deployment name for embeddings"""
        azure_deployment = os.environ.get('AZURE_OPENAI_EMBEDDING_DEPLOYMENT')
        if azure_deployment:
            return azure_deployment
        return SearchConfig.EMBEDDING_MODEL

    # [Include all the other methods from the original file - they remain the same]
    # generate_search_keywords, _search_confluence_with_keyword, _parse_confluence_search_results,
    # _combine_content_parts, _use_summary_as_content, _fetch_single_confluence_content,
    # _extract_page_id_from_url, _deduplicate_confluence_results, _rank_and_limit_results,
    # _log_confluence_content_analysis

    async def generate_search_keywords(self, query: str, openai_client=None) -> list:
        """Generate optimized search keywords using OpenAI"""
        if not openai_client:
            logger.warning("No OpenAI client available for keyword generation, using original query")
            return [query]
        
        try:
            prompt = f"""Generate {SearchConfig.MAX_KEYWORDS} concise search keywords/phrases for Microsoft Graph search. 
            Focus on core concepts and terms that would match document content.
            Query: '{query}'

            Return keywords as a comma-separated list."""

            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0
            )

            keywords_text = response.choices[0].message.content.strip()
            keywords = [kw.strip() for kw in keywords_text.split(",")]
            keywords = [kw for kw in keywords if kw][:SearchConfig.MAX_KEYWORDS]
            keywords = keywords if keywords else [query]
            
            logger.warning(f"Generated keywords for '{query}': {keywords}")
            return keywords

        except Exception as e:
            logger.error(f"Error generating keywords with OpenAI: {e}")
            return [query]

    async def _search_confluence_with_keyword(self, keyword: str, user_graph_token: str, top: int) -> List[Any]:
        """Search Confluence connector with a specific keyword via Microsoft Graph"""
        fields = [
            "title", "url", "summary", "lastModifiedDateTime", "createdDateTime",
            "content", "body", "excerpt", "description", 
            "fullContent", "indexedContent", "searchableText",
            "highlightedSummary", "snippet",
            "spaceKey", "spaceTitle", "pageType", "author", "labels"
        ]
        
        search_request = {
            "requests": [{
                "entityTypes": ["externalItem"],
                "contentSources": [f"/external/connections/{SearchConfig.CONFLUENCE_CONNECTOR_ID}"],
                "query": {
                    "queryString": keyword
                },
                "from": 0,
                "size": SearchConfig.MAX_RETURNED_ITEMS,
                "fields": fields,
            }]
        }
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://graph.microsoft.com/v1.0/search/query",
                    headers=headers,
                    json=search_request
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        results = self._parse_confluence_search_results(data)
                        return results
                    else:
                        error_text = await response.text()
                        logger.warning(f"Graph API search failed for '{keyword}': {response.status}")
                        return []
                        
        except Exception as e:
            logger.warning(f"Exception searching with '{keyword}': {e}")
            return []

    def _parse_confluence_search_results(self, search_data: dict) -> List[Any]:
        """Parse Graph API search results and extract content"""
        results = []
        
        try:
            for search_response in search_data.get("value", []):
                for container in search_response.get("hitsContainers", []):
                    for hit in container.get("hits", []):
                        
                        hit_id = hit.get("hitId", "")
                        rank = hit.get("rank", 0)
                        summary = hit.get("summary", "")
                        
                        resource = hit.get("resource", {})
                        properties = resource.get("properties", {})
                        
                        title = (
                            properties.get("title") or 
                            properties.get("name") or 
                            "Untitled"
                        )
                        
                        url = (
                            properties.get("url") or 
                            properties.get("webUrl") or 
                            ""
                        )
                        
                        # Extract content
                        content_parts = []
                        content_fields = [
                            "content", "body", "fullContent", "indexedContent", 
                            "searchableText", "excerpt", "description", "snippet"
                        ]
                        
                        for field in content_fields:
                            value = properties.get(field)
                            if value and isinstance(value, str) and len(value.strip()) > 10:
                                content_parts.append(value.strip())
                        
                        if summary and len(summary.strip()) > 10:
                            content_parts.append(summary.strip())
                        
                        combined_content = self._combine_content_parts(content_parts)
                        
                        # Calculate lexical score
                        lexical_score = 1.0 / (rank + 1)
                        
                        result = {
                            "hit_id": hit_id,
                            "title": title,
                            "url": url,
                            "content": combined_content,
                            "summary": summary,
                            "rank": rank,
                            "lexical_score": lexical_score,
                            "last_modified": properties.get("lastModifiedDateTime"),
                            "created": properties.get("createdDateTime"),
                            "content_source": "confluence_connector",
                            "author": properties.get("author", ""),
                            "space_key": properties.get("spaceKey", ""),
                            "space_title": properties.get("spaceTitle", ""),
                            "page_type": properties.get("pageType", ""),
                            "labels": properties.get("labels", ""),
                            "content_length": len(combined_content),
                            "content_enhanced": False
                        }
                        
                        if title != "Untitled" or len(combined_content) > 50:
                            results.append(result)
            
            return results
            
        except Exception as e:
            logger.error(f"Error parsing search results: {e}")
            return []

    def _combine_content_parts(self, content_parts: List[str]) -> str:
        """Intelligently combine content parts, removing duplicates"""
        if not content_parts:
            return ""
        
        unique_parts = []
        seen_content = set()
        
        for part in content_parts:
            normalized = part.lower().strip()
            
            if normalized not in seen_content and len(normalized) > 10:
                unique_parts.append(part)
                seen_content.add(normalized)
        
        combined = "\n\n".join(unique_parts)
        
        if len(combined) > 10000:
            combined = combined[:10000] + "... [content truncated]"
        
        return combined

    async def _use_summary_as_content(self, results: List[Dict]):
        """Use summary as content when Confluence API is not available"""
        logger.warning("   📝 Using summary as content (Confluence API not available)")
        
        for result in results:
            if not result.get("content") or len(result.get("content", "")) < 100:
                summary = result.get("summary", "")
                if summary:
                    enhanced_content = f"""
Document: {result.get('title', 'Untitled')}
URL: {result.get('url', '')}
Author: {result.get('author', 'Unknown')}
Space: {result.get('space_title', 'Unknown')}
Last Modified: {result.get('last_modified', 'Unknown')}

Summary:
{summary}

[Note: This is a summary. Full content will be available when Confluence API is integrated.]
"""
                    result["content"] = enhanced_content
                    result["content_enhanced"] = True
                    result["content_length"] = len(enhanced_content)

    async def _fetch_single_confluence_content(self, result: Dict):
        """Fetch content for a single page from Confluence API"""
        async with self.confluence_api_semaphore:
            try: 
                page_id = self._extract_page_id_from_url(result.get("url", ""))
                if not page_id:
                    return

                api_url = (f"{SearchConfig.CONFLUENCE_BASE_URL}/content/{page_id}"
                        "?expand=body.storage")
                headers = {
                    "Authorization": SearchConfig.get_confluence_auth(),
                    "Accept": "application/json"
                }

                timeout = aiohttp.ClientTimeout(total=SearchConfig.CONFLUENCE_API_TIMEOUT)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(api_url, headers=headers) as resp:
                        if resp.status != 200:
                            logger.warning(f"Confluence API {resp.status} for {page_id}")
                            return
                        data = await resp.json()

                storage_html = data.get("body", {}).get("storage", {}).get("value", "")
                text = BeautifulSoup(storage_html, "html.parser").get_text(separator="\n")

                result["content"] = text.strip()
                result["content_enhanced"] = True
                result["content_length"] = len(text)

            except Exception as e:
                logger.warning(f"Failed Confluence fetch for {result.get('title')}: {e}")
    
    def _extract_page_id_from_url(self, url: str) -> Optional[str]:
        """Extract page ID from Confluence URL"""
        if not url:
            return None
        m = re.search(r"[?&]pageId=(\d+)", url)
        if m:
            return m.group(1)
        m = re.search(r"/pages/(\d+)(/|$)", url)
        if m:
            return m.group(1)
        return None

    def _deduplicate_confluence_results(self, results: List[dict]) -> List[dict]:
        """Remove duplicate results based on URL and title"""
        seen_items = set()
        unique_results = []
        
        for result in results:
            identifier = (result.get("url", ""), result.get("title", ""))
            
            if identifier not in seen_items:
                seen_items.add(identifier)
                unique_results.append(result)
        
        return unique_results

    def _rank_and_limit_results(self, results: List[dict], query: str, top: int) -> List[dict]:
        """Final ranking using combined scores and limit to top N"""
        sorted_results = sorted(results, key=lambda x: x.get("combined_score", 0), reverse=True)
        
        for i, result in enumerate(sorted_results, 1):
            result["final_rank"] = i
        
        return sorted_results[:top]

    def _log_confluence_content_analysis(self, results: List[dict]) -> None:
        """Log detailed analysis of search results and scores"""
        if not results:
            logger.warning("⚠️ No results to analyze")
            return
        
        substantial_content = sum(1 for r in results if len(r.get("content", "")) > 1000)
        good_content = sum(1 for r in results if 500 < len(r.get("content", "")) <= 1000)
        limited_content = sum(1 for r in results if 100 < len(r.get("content", "")) <= 500)
        minimal_content = sum(1 for r in results if len(r.get("content", "")) <= 100)
        
        embedded_results = sum(1 for r in results if r.get("has_embedding", False))
        enhanced_results = sum(1 for r in results if r.get("content_enhanced", False))
        
        logger.warning(f"📊 Content Analysis:")
        logger.warning(f"   📚 Substantial content (>1000 chars): {substantial_content}/{len(results)}")
        logger.warning(f"   📄 Good content (500-1000 chars): {good_content}/{len(results)}")
        logger.warning(f"   📝 Limited content (100-500 chars): {limited_content}/{len(results)}")
        logger.warning(f"   ⚠️ Minimal content (<100 chars): {minimal_content}/{len(results)}")
        logger.warning(f"   🧠 Results with embeddings: {embedded_results}/{len(results)}")
        logger.warning(f"   🔧 Results enhanced: {enhanced_results}/{len(results)}")
        
        logger.warning(f"📋 Top Results with Scores:")
        for i, result in enumerate(results[:5], 1):
            title = result.get("title", "No title")[:50]
            content_length = len(result.get("content", ""))
            faiss_score = result.get("faiss_score", 0)
            combined_score = result.get("combined_score", 0)
            original_rank = result.get("rank", 0)
            enhanced = "✓" if result.get("content_enhanced", False) else "✗"
            has_embedding = "✓" if result.get("has_embedding", False) else "✗"
            
            logger.warning(f"   {i}. {title}")
            logger.warning(f"      📊 Content: {content_length} chars | Enhanced: {enhanced} | Has embedding: {has_embedding}")
            logger.warning(f"      🎯 Original rank: {original_rank} | FAISS: {faiss_score:.3f} | Combined: {combined_score:.3f}")
        
        # FAISS index status (only if available)
        if self.vector_search_enabled:
            faiss_stats = self.faiss_manager.get_stats()
            logger.warning(f"📈 FAISS Index Status:")
            logger.warning(f"   Total vectors in index: {faiss_stats['index_size']}")
            logger.warning(f"   Total documents tracked: {faiss_stats['documents_tracked']}")
            logger.warning(f"   Cache size: {faiss_stats['cache_size']} embeddings")
        else:
            logger.warning(f"📝 Running in lexical-only mode (FAISS disabled)")


# Create service instance - SAFE VERSION
confluence_service = ConfluenceSearchService()