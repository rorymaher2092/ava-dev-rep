import asyncio
import aiohttp
import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import sys
import time
import hashlib
from quart import current_app
from langchain_openai import AzureChatOpenAI


###
#  Toggles. These control how the code works
###



# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

if not any(isinstance(handler, logging.StreamHandler) for handler in logger.handlers):
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

class ConfluenceSearchService:
    """Enhanced service with pipelined embedding generation and FAISS vector similarity"""
    
    def __init__(self, openai_client=None):
        self.openai_client = openai_client
        self.embedding_cache = {}  # Cache to avoid re-computing same content
        self.embedding_queue = asyncio.Queue()  # Queue for embedding tasks
        self.embedding_results = {}  # Store completed embeddings
        
    async def search_confluence_connector(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20,
        openai_client=None,
        use_faiss_reranking: bool = True
    ) -> List[Any]:
        """
        MAIN SEARCH METHOD: Enhanced Confluence search with FAISS vector similarity
        
        Flow:
        1. Generate search keywords using OpenAI
        2. Start background embedding worker
        3. Search Graph API with each keyword (lexical search)
        4. Pipeline: Queue results for embedding as soon as they're found
        5. Wait for all embeddings to complete
        6. Calculate FAISS similarity scores between results and query
        7. Rerank using combined lexical + vector scores
        8. Return top results
        """
        logger.warning(f"🔗 Starting ENHANCED Confluence search for: '{query}' (top {top})")
        start_time = time.time()
        
        # Use the provided client or fall back to the instance client
        client = openai_client or self.openai_client
        
        # Step 1: Generate search keywords using OpenAI
        keywords = await self.generate_search_keywords(query, client)
        logger.warning(f"   Generated {len(keywords)} keywords: {keywords}")
        
        # Step 2: Start background embedding worker if FAISS reranking is enabled
        embedding_task = None
        if use_faiss_reranking and client:
            embedding_task = asyncio.create_task(self._embedding_worker(client))
            logger.warning("   🧠 Started background embedding worker")
        
        all_results = []
        
        # Step 3: Search with each keyword and pipeline embeddings
        for i, keyword in enumerate(keywords):
            logger.warning(f"   🎯 Searching with keyword {i+1}/{len(keywords)}: '{keyword}'")
            
            # Search Confluence via Graph API (lexical search)
            keyword_results = await self._search_confluence_with_keyword(
                keyword, user_graph_token, top
            )
            
            if keyword_results:
                logger.warning(f"   ✅ Found {len(keyword_results)} results with keyword '{keyword}'")
                all_results.extend(keyword_results)
                
                # PIPELINE OPTIMIZATION: Queue these results for embedding immediately
                # While we search the next keyword, embeddings are being generated
                if use_faiss_reranking and client:
                    await self._queue_results_for_embedding(keyword_results, f"batch_{i}")
            else:
                logger.warning(f"   ❌ No results with keyword '{keyword}'")
        
        # Step 4: Signal embedding worker to finish and wait for completion
        if embedding_task:
            await self.embedding_queue.put(None)  # Sentinel to stop worker
            await embedding_task  # Wait for all embeddings to complete
            logger.warning("   ✅ All embeddings completed")
        
        # Step 5: Remove duplicates (same URL/title combinations)
        unique_results = self._deduplicate_confluence_results(all_results)
        logger.warning(f"   📋 After deduplication: {len(unique_results)} unique results")
        
        # Step 6: Add FAISS similarity scores and rerank
        if use_faiss_reranking and client:
            enhanced_results = await self._add_faiss_scores_and_rerank(unique_results, query, client)
        else:
            enhanced_results = unique_results
            # Add default scores for non-FAISS mode
            for result in enhanced_results:
                result["faiss_score"] = 0.0
                result["combined_score"] = result.get("rank", 0)
        
        # Step 7: Final ranking and limiting
        final_results = self._rank_and_limit_results(enhanced_results, query, top)
        
        total_time = time.time() - start_time
        logger.warning(f"✅ Enhanced Confluence search completed in {total_time:.2f}s: {len(final_results)} documents")
        self._log_confluence_content_analysis(final_results)
        
        return final_results

    async def generate_search_keywords(self, query: str, openai_client=None) -> list:
        """Generate optimized search keywords using OpenAI"""
        if not openai_client:
            logger.warning("No OpenAI client available for keyword generation, using original query")
            return [query]
        
        try:
            prompt = f"Generate 3-5 concise search keywords/phrases for Microsoft Graph search. Focus on core concepts. Query: '{query}'"

            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0
            )

            keywords_text = response.choices[0].message.content.strip()
            
            # Parse keywords flexibly
            if ',' in keywords_text:
                keywords = [kw.strip() for kw in keywords_text.split(",")]
            elif '\n' in keywords_text:
                keywords = [kw.strip().lstrip('- ').lstrip('• ') for kw in keywords_text.split("\n")]
            else:
                keywords = [keywords_text]
            
            # Clean and limit keywords
            keywords = [kw.strip() for kw in keywords if kw.strip()][:5]
            keywords = keywords if keywords else [query]
            
            logger.warning(f"Generated keywords for '{query}': {keywords}")
            return keywords

        except Exception as e:
            logger.error(f"Error generating keywords with OpenAI: {e}")
            return [query]

    async def _search_confluence_with_keyword(
        self, 
        keyword: str, 
        user_graph_token: str, 
        top: int
    ) -> List[Any]:
        """Search Confluence connector with a specific keyword via Microsoft Graph"""
        # Request comprehensive fields from Graph Connectors
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
                "query": {
                    "queryString": keyword,
                    "trimDuplicates": True
                },
                "from": 0,
                "size": min(top, 25),
                "fields": fields,
                "sortProperties": [{
                    "name": "lastModifiedDateTime", 
                    "isDescending": True
                }]
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
                        
                        # Extract title and URL
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
                        
                        # Extract all possible content fields
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
                        
                        # Combine content intelligently
                        combined_content = self._combine_content_parts(content_parts)
                        
                        # Build result object
                        result = {
                            "hit_id": hit_id,
                            "title": title,
                            "url": url,
                            "content": combined_content,
                            "summary": summary,
                            "rank": rank,
                            "last_modified": properties.get("lastModifiedDateTime"),
                            "created": properties.get("createdDateTime"),
                            "content_source": "confluence_connector",
                            "author": properties.get("author", ""),
                            "space_key": properties.get("spaceKey", ""),
                            "space_title": properties.get("spaceTitle", ""),
                            "page_type": properties.get("pageType", ""),
                            "labels": properties.get("labels", ""),
                            "content_length": len(combined_content)
                        }
                        
                        # Only include results with meaningful content
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
        
        # Remove duplicates while preserving order
        unique_parts = []
        seen_content = set()
        
        for part in content_parts:
            normalized = part.lower().strip()
            
            if normalized not in seen_content and len(normalized) > 10:
                unique_parts.append(part)
                seen_content.add(normalized)
        
        combined = "\n\n".join(unique_parts)
        
        # Limit length to prevent token overflow
        if len(combined) > 10000:
            combined = combined[:10000] + "... [content truncated]"
        
        return combined

    async def _queue_results_for_embedding(self, results: List[Dict], batch_id: str):
        """Queue search results for immediate embedding generation"""
        for i, result in enumerate(results):
            content = result.get("content", "")
            title = result.get("title", "")
            
            if len(content.strip()) > 20:  # Only embed meaningful content
                # Create text for embedding (title + content)
                full_text = f"{title}\n\n{content}"[:8000]  # Limit to 8k chars
                content_hash = hashlib.md5(full_text.encode()).hexdigest()
                
                # Check if we already have this embedding cached
                if content_hash not in self.embedding_cache:
                    embedding_task = {
                        "text": full_text,
                        "content_hash": content_hash,
                        "result_id": f"{batch_id}_{i}",
                        "original_result": result
                    }
                    await self.embedding_queue.put(embedding_task)

    async def _embedding_worker(self, openai_client):
        """Background worker that generates embeddings concurrently"""
        logger.warning("     🧠 Embedding worker started...")
        
        embedding_count = 0
        batch_tasks = []
        
        while True:
            try:
                # Get embedding task from queue
                task = await self.embedding_queue.get()
                
                if task is None:  # Sentinel value to stop
                    # Process any remaining batch
                    if batch_tasks:
                        await self._process_embedding_batch(batch_tasks, openai_client)
                        embedding_count += len(batch_tasks)
                    break
                
                batch_tasks.append(task)
                
                # Process in batches of 5 for efficiency
                if len(batch_tasks) >= 5:
                    await self._process_embedding_batch(batch_tasks, openai_client)
                    embedding_count += len(batch_tasks)
                    logger.warning(f"     📊 Embedded {embedding_count} documents so far...")
                    batch_tasks = []
                
            except Exception as e:
                logger.warning(f"     ⚠️ Embedding worker error: {e}")
                continue
        
        logger.warning(f"     ✅ Embedding worker completed: {embedding_count} total embeddings")

    async def _process_embedding_batch(self, batch_tasks: List[Dict], openai_client):
        """Process a batch of embedding tasks concurrently"""
        if not batch_tasks:
            return
        
        # Create concurrent embedding tasks
        embedding_coroutines = []
        for task in batch_tasks:
            if task["content_hash"] not in self.embedding_cache:
                embedding_coroutines.append(
                    self._generate_single_embedding(task, openai_client)
                )
        
        # Execute all embeddings concurrently
        if embedding_coroutines:
            await asyncio.gather(*embedding_coroutines, return_exceptions=True)

    async def _generate_single_embedding(self, task: Dict, openai_client):
        """Generate a single embedding and cache it"""
        try:
            embedding_response = await openai_client.embeddings.create(
                model="text-embedding-ada-002",
                input=task["text"]
            )
            
            embedding = embedding_response.data[0].embedding
            self.embedding_cache[task["content_hash"]] = embedding
            
            logger.debug(f"     ✅ Generated embedding for {task['result_id']}")
            
        except Exception as e:
            logger.warning(f"     ⚠️ Failed to embed {task['result_id']}: {e}")
            # Use zero vector as fallback
            self.embedding_cache[task["content_hash"]] = [0.0] * 1536

    async def _add_faiss_scores_and_rerank(self, results: List[Dict], query: str, openai_client) -> List[Dict]:
        """
        Add FAISS similarity scores to results and rerank them
        
        This is the key reranking step that combines:
        - Original lexical search rank from Graph API
        - Vector similarity score from FAISS
        """
        logger.warning(f"   📊 Adding FAISS scores to {len(results)} results...")
        
        if not results:
            return results
        
        try:
            # Import FAISS and numpy
            import faiss
            import numpy as np
            
            # Step 1: Get query embedding
            query_embedding_response = await openai_client.embeddings.create(
                model="text-embedding-ada-002",
                input=query
            )
            query_embedding = np.array(query_embedding_response.data[0].embedding).astype('float32')
            
            # Step 2: Collect cached embeddings for results
            embeddings = []
            embedded_results = []
            
            for result in results:
                content = result.get("content", "")
                title = result.get("title", "")
                full_text = f"{title}\n\n{content}"[:8000]
                content_hash = hashlib.md5(full_text.encode()).hexdigest()
                
                if content_hash in self.embedding_cache:
                    embedding = self.embedding_cache[content_hash]
                    embeddings.append(embedding)
                    embedded_results.append(result)
                    result["has_embedding"] = True
                else:
                    # No embedding available
                    result["has_embedding"] = False
                    result["faiss_score"] = 0.0
            
            # Step 3: Calculate FAISS similarity scores
            if embeddings and embedded_results:
                logger.warning(f"   🎯 Calculating FAISS scores for {len(embeddings)} embedded results...")
                
                # Build FAISS index
                dimension = len(embeddings[0])
                index = faiss.IndexFlatIP(dimension)  # Inner product (cosine similarity)
                
                # Normalize embeddings for cosine similarity
                embeddings_array = np.array(embeddings).astype('float32')
                faiss.normalize_L2(embeddings_array)
                index.add(embeddings_array)
                
                # Normalize query embedding
                query_embedding = query_embedding.reshape(1, -1)
                faiss.normalize_L2(query_embedding)
                
                # Calculate similarities
                similarities, indices = index.search(query_embedding, k=len(embeddings))
                
                # Add FAISS scores to results
                for i, similarity_score in enumerate(similarities[0]):
                    result_idx = indices[0][i]
                    embedded_results[result_idx]["faiss_score"] = float(similarity_score)
                    embedded_results[result_idx]["faiss_rank"] = i + 1
            
            # Step 4: Calculate combined scores (lexical + vector)
            for result in results:
                lexical_score = 1.0 / (result.get("rank", 1) + 1)  # Higher rank = lower score
                vector_score = result.get("faiss_score", 0.0)
                
                # Weighted combination (you can adjust these weights)
                combined_score = (0.3 * lexical_score) + (0.7 * vector_score)
                result["combined_score"] = combined_score
            
            logger.warning(f"   ✅ FAISS scoring completed for {len(results)} results")
            return results
            
        except ImportError:
            logger.warning("   ⚠️ FAISS not available, skipping vector similarity")
            # Add default scores
            for result in results:
                result["faiss_score"] = 0.0
                result["combined_score"] = 1.0 / (result.get("rank", 1) + 1)
            return results
            
        except Exception as e:
            logger.warning(f"   ⚠️ FAISS scoring failed: {e}")
            # Add default scores
            for result in results:
                result["faiss_score"] = 0.0
                result["combined_score"] = 1.0 / (result.get("rank", 1) + 1)
            return results

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
        # Sort by combined score (highest first)
        sorted_results = sorted(results, key=lambda x: x.get("combined_score", 0), reverse=True)
        
        # Add final ranking info
        for i, result in enumerate(sorted_results, 1):
            result["final_rank"] = i
        
        return sorted_results[:top]

    def _log_confluence_content_analysis(self, results: List[dict]) -> None:
        """Log detailed analysis of search results and scores"""
        if not results:
            logger.warning("⚠️ No results to analyze")
            return
        
        # Content quality analysis
        substantial_content = sum(1 for r in results if len(r.get("content", "")) > 1000)
        good_content = sum(1 for r in results if 500 < len(r.get("content", "")) <= 1000)
        limited_content = sum(1 for r in results if 100 < len(r.get("content", "")) <= 500)
        minimal_content = sum(1 for r in results if len(r.get("content", "")) <= 100)
        
        embedded_results = sum(1 for r in results if r.get("has_embedding", False))
        
        logger.warning(f"📊 Content Analysis:")
        logger.warning(f"   📚 Substantial content (>1000 chars): {substantial_content}/{len(results)}")
        logger.warning(f"   📄 Good content (500-1000 chars): {good_content}/{len(results)}")
        logger.warning(f"   📝 Limited content (100-500 chars): {limited_content}/{len(results)}")
        logger.warning(f"   ⚠️ Minimal content (<100 chars): {minimal_content}/{len(results)}")
        logger.warning(f"   🧠 Results with embeddings: {embedded_results}/{len(results)}")
        
        # Show top results with scores
        logger.warning(f"📋 Top Results with Scores:")
        for i, result in enumerate(results[:5], 1):
            title = result.get("title", "No title")[:50]
            content_length = len(result.get("content", ""))
            faiss_score = result.get("faiss_score", 0)
            combined_score = result.get("combined_score", 0)
            original_rank = result.get("rank", 0)
            
            logger.warning(f"   {i}. {title}")
            logger.warning(f"      📊 Content: {content_length} chars | Original rank: {original_rank}")
            logger.warning(f"      🎯 FAISS: {faiss_score:.3f} | Combined: {combined_score:.3f}")

# Create service instance
confluence_service = ConfluenceSearchService()