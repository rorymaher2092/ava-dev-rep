"""
Dual Search Helper Module - CORRECTED VERSION WITH FAISS FALLBACK

MAJOR CHANGES:
- NO MORE re-embedding Azure results!
- Direct score comparison between sources
- FALLBACK: When FAISS fails, ensures equal representation from both sources
"""

import logging
from typing import List, Dict, Any
import time

logger = logging.getLogger(__name__)


class DualSearchHelper:
    """
    CORRECTED: Helper class with direct score comparison - no re-embedding!
    """
    
    def __init__(self, openai_client, embedding_model="text-embedding-3-small", embedding_dimensions=1536):
        self.openai_client = openai_client
        self.embedding_model = embedding_model
        self.embedding_dimensions = embedding_dimensions
    
    async def combine_and_rerank_dual_results(
        self,
        confluence_results: List[Dict],
        azure_results: List[Dict],
        query: str,
        top: int,
        weight_confluence: float = 0.5,
        weight_azure: float = 0.5
    ) -> List[Dict]:
        """
        CORRECTED: Direct score comparison - no re-embedding needed!
        WITH FALLBACK: Equal representation when FAISS fails
        """
        
        logger.warning("🔍 USING CORRECTED DUAL SEARCH - NO RE-EMBEDDING!")
        
        try:
            if not confluence_results and not azure_results:
                return []
            
            logger.warning(f"   📊 DIRECT score comparison: {len(confluence_results)} Confluence + {len(azure_results)} Azure results...")
            
            # STEP 1: Process Confluence results (already have FAISS scores)
            processed_confluence = []
            confluence_has_vectors = False
            
            for result in confluence_results:
                result_copy = result.copy()
                result_copy["source_type"] = "confluence"
                
                # Check if we have valid vector scores
                vector_score = result.get("vector_score", result.get("faiss_score", 0.0))
                if vector_score > 0:
                    confluence_has_vectors = True
                    
                lexical_score = result.get("lexical_score", 1.0 / (result.get("rank", 1) + 1))
                
                result_copy["vector_score"] = vector_score
                result_copy["lexical_score"] = lexical_score
                result_copy["original_rank"] = result.get("rank", 0)
                
                processed_confluence.append(result_copy)
            
            logger.warning(f"   📚 Confluence: {len(processed_confluence)} results processed (has vectors: {confluence_has_vectors})")
            
            # STEP 2: Process Azure results
            processed_azure = []
            azure_has_vectors = False
            
            for result in azure_results:
                result_copy = result.copy()
                result_copy["source_type"] = "azure"
                
                # Extract vector score from Azure's actual response structure
                vector_score = self._extract_azure_vector_score(result)
                if vector_score > 0:
                    azure_has_vectors = True
                    
                lexical_score = self._extract_azure_lexical_score(result)
                
                result_copy["vector_score"] = vector_score
                result_copy["lexical_score"] = lexical_score
                result_copy["original_rank"] = result.get("rank", result.get("@search.rank", 0))
                
                processed_azure.append(result_copy)
            
            logger.warning(f"   🔷 Azure: {len(processed_azure)} results processed (has vectors: {azure_has_vectors})")
            
            # CRITICAL DECISION POINT: Check if FAISS failed (Confluence has no vectors)
            if not confluence_has_vectors and azure_has_vectors:
                logger.warning("   ⚠️ FAISS FAILURE DETECTED - Using fallback strategy!")
                return self._equal_representation_fallback(
                    processed_confluence, 
                    processed_azure, 
                    top
                )
            
            # NORMAL PATH: Both sources have scores, proceed with score-based ranking
            self._log_extracted_scores(processed_confluence, processed_azure)
            
            # Combine all results
            all_results = processed_confluence + processed_azure
            
            if not all_results:
                return []
            
            # Normalize scores across both sources
            self._normalize_scores(all_results)
            
            # Calculate final weighted scores
            for result in all_results:
                normalized_lexical = result["normalized_lexical_score"]
                normalized_vector = result["normalized_vector_score"]
                
                # Combine lexical + vector (30% lexical, 70% vector)
                combined_score = (0.3 * normalized_lexical + 0.7 * normalized_vector)
                
                # Apply source-specific weights
                if result["source_type"] == "confluence":
                    source_weight = weight_confluence
                    source_boost = 1.1  # Slight boost for Confluence specificity
                else:
                    source_weight = weight_azure
                    source_boost = 1.0
                
                final_score = combined_score * source_weight * source_boost
                
                result["combined_score"] = combined_score
                result["final_weighted_score"] = final_score
            
            # Sort by final weighted score
            all_results.sort(key=lambda x: x["final_weighted_score"], reverse=True)
            
            # Add final rankings
            for i, result in enumerate(all_results, 1):
                result["final_rank"] = i
            
            logger.warning(f"   ✅ Direct score comparison complete, returning top {top}")
            
            return all_results[:top]
            
        except Exception as e:
            logger.error(f"   ❌ Error in direct score comparison: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return self._equal_representation_fallback(
                confluence_results[:top//2 + 1], 
                azure_results[:top//2 + 1], 
                top*2
            )
    
    def _equal_representation_fallback(
        self, 
        confluence_results: List[Dict], 
        azure_results: List[Dict], 
        top: int
    ) -> List[Dict]:
        """
        FALLBACK STRATEGY: Ensure equal representation from both sources
        when FAISS fails and Confluence has no vector scores
        """
        logger.warning("🚨 USING EQUAL REPRESENTATION FALLBACK")
        
        # Calculate how many from each source
        confluence_count = min(len(confluence_results), (top + 1) // 2)  # Half (rounded up)
        azure_count = min(len(azure_results), top - confluence_count)    # Remaining slots
        
        # If one source has fewer results, give extra slots to the other
        if confluence_count < (top + 1) // 2 and len(azure_results) > azure_count:
            azure_count = min(len(azure_results), top - confluence_count)
        elif azure_count < top // 2 and len(confluence_results) > confluence_count:
            confluence_count = min(len(confluence_results), top - azure_count)
        
        logger.warning(f"   📊 Taking top {confluence_count} from Confluence, top {azure_count} from Azure")
        
        # Take top results from each source
        final_results = []
        
        # Add Confluence results (already sorted by their original ranking)
        for i, result in enumerate(confluence_results[:confluence_count]):
            result["final_rank"] = i * 2 + 1  # Odd ranks: 1, 3, 5...
            result["fallback_mode"] = True
            final_results.append(result)
        
        # Add Azure results (already sorted by their original ranking)
        for i, result in enumerate(azure_results[:azure_count]):
            result["final_rank"] = i * 2 + 2  # Even ranks: 2, 4, 6...
            result["fallback_mode"] = True
            final_results.append(result)
        
        # Sort by final rank to interleave results
        final_results.sort(key=lambda x: x["final_rank"])
        
        # Renumber final ranks to be sequential
        for i, result in enumerate(final_results, 1):
            result["final_rank"] = i
        
        logger.warning(f"   ✅ Fallback complete: {len(final_results)} results")
        logger.warning(f"   📋 Final distribution: {confluence_count} Confluence, {azure_count} Azure")
        
        return final_results[:top]
    
    def _extract_azure_vector_score(self, result: Dict) -> float:
        """
        Extract vector similarity score from Azure AI Search result
        """
        # Try various score fields in order of preference
        
        # Method 1: Look for explicit vector_score field
        if "vector_score" in result:
            return float(result["vector_score"])
        
        # Method 2: Look for semantic reranker score
        reranker_score = result.get("@search.reranker_score", result.get("reranker_score"))
        if reranker_score is not None:
            # Reranker scores are typically 0-4, normalize to 0-1
            return float(reranker_score) / 4.0
        
        # Method 3: Look for overall search score
        search_score = result.get("@search.score", result.get("score"))
        if search_score is not None:
            # Search scores vary, but usually 0-10+, normalize
            return min(float(search_score) / 10.0, 1.0)
        
        # Method 4: Rank-based fallback
        rank = result.get("@search.rank", result.get("rank", 1))
        return 1.0 / (rank + 1)
    
    def _extract_azure_lexical_score(self, result: Dict) -> float:
        """Extract lexical/keyword matching score from Azure result"""
        
        # Method 1: Explicit lexical_score field
        if "lexical_score" in result:
            return float(result["lexical_score"])
        
        # Method 2: If we have BM25 or text score specifically
        if "@search.text_score" in result:
            return float(result["@search.text_score"])
        
        # Method 3: Use a portion of the overall search score as lexical
        search_score = result.get("@search.score", result.get("score"))
        if search_score is not None:
            # Assume lexical is about 40% of total search score
            return min(float(search_score) * 0.4 / 10.0, 1.0)
        
        # Method 4: Rank-based fallback
        rank = result.get("@search.rank", result.get("rank", 1))
        return 1.0 / (rank + 1)
    
    def _log_extracted_scores(self, confluence_results: List[Dict], azure_results: List[Dict]):
        """DEBUG: Log the actual scores we extracted to verify they look correct"""
        logger.warning("🔍 EXTRACTED SCORES DEBUG:")
        
        # Log Confluence scores
        if confluence_results:
            conf_vector_scores = [r.get("vector_score", 0) for r in confluence_results[:3]]
            logger.warning(f"   📚 Confluence vector scores (top 3): {conf_vector_scores}")
        
        # Log Azure scores  
        if azure_results:
            azure_vector_scores = [r.get("vector_score", 0) for r in azure_results[:3]]
            logger.warning(f"   🔷 Azure vector scores (top 3): {azure_vector_scores}")
            
            # Also log the raw Azure fields we found
            if azure_results:
                sample_azure = azure_results[0]
                azure_fields = {k: v for k, v in sample_azure.items() 
                              if k.startswith("@search") or "score" in k.lower() or k == "reranker_score"}
                logger.warning(f"   🔍 Sample Azure score fields: {azure_fields}")
    
    def _normalize_scores(self, all_results: List[Dict]):
        """Normalize vector and lexical scores across both sources to 0-1 range"""
        
        # Get all scores
        vector_scores = [r["vector_score"] for r in all_results if r.get("vector_score") is not None]
        lexical_scores = [r["lexical_score"] for r in all_results if r.get("lexical_score") is not None]
        
        # Normalize vector scores
        if vector_scores:
            max_vector = max(vector_scores)
            min_vector = min(vector_scores)
            vector_range = max_vector - min_vector if max_vector > min_vector else 1.0
        else:
            max_vector = min_vector = vector_range = 1.0
        
        # Normalize lexical scores  
        if lexical_scores:
            max_lexical = max(lexical_scores)
            min_lexical = min(lexical_scores)
            lexical_range = max_lexical - min_lexical if max_lexical > min_lexical else 1.0
        else:
            max_lexical = min_lexical = lexical_range = 1.0
        
        for result in all_results:
            # Normalize to 0-1 range
            vector_score = result.get("vector_score", 0)
            lexical_score = result.get("lexical_score", 0)
            
            if vector_range > 0:
                result["normalized_vector_score"] = (vector_score - min_vector) / vector_range
            else:
                result["normalized_vector_score"] = vector_score
                
            if lexical_range > 0:
                result["normalized_lexical_score"] = (lexical_score - min_lexical) / lexical_range
            else:
                result["normalized_lexical_score"] = lexical_score
    
    @staticmethod
    def serialize_dual_result(result: Dict) -> Dict:
        """Serialize dual search result with vector_score instead of faiss_score"""
        serialized = {
            "title": result.get("title", "Untitled"),
            "url": result.get("url", ""),
            "source_type": result.get("source_type", "unknown"),
            "vector_score": result.get("vector_score", 0),
            "lexical_score": result.get("lexical_score", 0),
            "normalized_vector_score": result.get("normalized_vector_score", 0),
            "normalized_lexical_score": result.get("normalized_lexical_score", 0),
            "combined_score": result.get("combined_score", 0),
            "final_weighted_score": result.get("final_weighted_score", 0),
            "final_rank": result.get("final_rank", 0),
            "original_rank": result.get("original_rank", 0),
            "has_content": len(result.get("content", "")) > 100,
            "content_length": len(result.get("content", ""))
        }
        
        # Add fallback indicator if present
        if result.get("fallback_mode"):
            serialized["fallback_mode"] = True
            
        return serialized
    
    @staticmethod
    def log_dual_search_analysis(
        combined_results: List[Dict],
        confluence_results: List[Dict], 
        azure_results: List[Dict]
    ) -> None:
        """Enhanced logging for direct score comparison analysis"""
        if not combined_results:
            logger.warning("⚠️ No combined results to analyze")
            return
        
        # Check if we're in fallback mode
        fallback_mode = any(r.get("fallback_mode") for r in combined_results)
        
        # Source distribution
        confluence_in_final = sum(1 for r in combined_results if r.get("source_type") == "confluence")
        azure_in_final = sum(1 for r in combined_results if r.get("source_type") == "azure")
        
        # Score analysis
        confluence_final = [r for r in combined_results if r.get("source_type") == "confluence"]
        azure_final = [r for r in combined_results if r.get("source_type") == "azure"]
        
        avg_confluence_vector = sum(r.get("vector_score", 0) for r in confluence_final) / max(len(confluence_final), 1)
        avg_azure_vector = sum(r.get("vector_score", 0) for r in azure_final) / max(len(azure_final), 1)
        
        logger.warning(f"📊 CORRECTED Dual Search Analysis:")
        logger.warning(f"   📚 Original: {len(confluence_results)} Confluence, {len(azure_results)} Azure")
        logger.warning(f"   🎯 Final: {confluence_in_final} Confluence, {azure_in_final} Azure")
        logger.warning(f"   📈 Avg vector scores: Confluence {avg_confluence_vector:.3f}, Azure {avg_azure_vector:.3f}")
        
        if fallback_mode:
            logger.warning(f"   🚨 FALLBACK MODE: Equal representation enforced (FAISS failure)")
        else:
            logger.warning(f"   ✅ Using direct score comparison (NO re-embedding!)")
        
        # Enhanced top results
        logger.warning(f"📋 Top 5 Results:")
        for i, result in enumerate(combined_results[:5], 1):
            title = result.get("title", "No title")[:50]
            source = result.get("source_type", "unknown")
            vector_score = result.get("vector_score", 0)
            final_score = result.get("final_weighted_score", 0)
            original_rank = result.get("original_rank", 0)
            source_emoji = "📚" if source == "confluence" else "🔷"
            fallback_indicator = " [FALLBACK]" if result.get("fallback_mode") else ""
            
            logger.warning(f"   {i}. {source_emoji} {title}{fallback_indicator}")
            logger.warning(f"      Vector: {vector_score:.3f} | Final: {final_score:.3f} | Orig Rank: {original_rank}")