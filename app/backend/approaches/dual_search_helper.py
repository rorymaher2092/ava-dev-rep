"""
Dual Search Helper Module

Contains utilities for combining and reranking results from multiple search sources
(Confluence and Azure AI Search) using FAISS vector similarity.
"""

import logging
from typing import List, Dict, Any
import asyncio

logger = logging.getLogger(__name__)


class DualSearchHelper:
    """Helper class for dual search operations"""
    
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
        weight_confluence: float,
        weight_azure: float
    ) -> List[Dict]:
        """
        Combine results from both sources and rerank using unified FAISS index
        
        Args:
            confluence_results: Results from Confluence search
            azure_results: Results from Azure AI Search
            query: Original user query
            top: Number of top results to return
            weight_confluence: Weight for Confluence results (0-1)
            weight_azure: Weight for Azure results (0-1)
            
        Returns:
            List of reranked results with metadata
        """
        try:
            import faiss
            import numpy as np
            
            # Combine all results
            all_results = []
            all_results.extend(confluence_results)
            all_results.extend(azure_results)
            
            if not all_results:
                return []
            
            logger.warning(f"   📊 Creating unified embeddings for {len(all_results)} results using {self.embedding_model}...")
            
            # Generate embeddings for all results
            embeddings = []
            valid_results = []
            
            for result in all_results:
                # Create embedding text based on source type
                if result["source_type"] == "confluence":
                    title = result.get("title", "")
                    content = result.get("content", result.get("summary", ""))
                    embedding_text = f"{title}\n\n{content}"[:8000]
                else:  # Azure
                    title = result.get("title", result.get("sourcepage", ""))
                    content = result.get("content", result.get("summary", ""))
                    embedding_text = f"{title}\n\n{content}"[:8000]
                
                try:
                    # Generate embedding with proper model configuration
                    embedding_params = {
                        "model": self.embedding_model,
                        "input": embedding_text
                    }
                    
                    # Add dimensions parameter for text-embedding-3 models
                    if self.embedding_model in ["text-embedding-3-small", "text-embedding-3-large"]:
                        embedding_params["dimensions"] = self.embedding_dimensions
                    
                    embedding_response = await self.openai_client.embeddings.create(**embedding_params)
                    embedding = embedding_response.data[0].embedding
                    embeddings.append(embedding)
                    valid_results.append(result)
                    
                except Exception as e:
                    logger.warning(f"Failed to generate embedding for result: {e}")
                    continue
            
            if not embeddings:
                logger.warning("   ⚠️ No embeddings generated, returning original results")
                return all_results[:top]
            
            # Get query embedding with same model configuration
            query_embedding_params = {
                "model": self.embedding_model,
                "input": query
            }
            
            # Add dimensions parameter for text-embedding-3 models
            if self.embedding_model in ["text-embedding-3-small", "text-embedding-3-large"]:
                query_embedding_params["dimensions"] = self.embedding_dimensions
            
            query_embedding_response = await self.openai_client.embeddings.create(**query_embedding_params)
            query_embedding = np.array(query_embedding_response.data[0].embedding).astype('float32')
            
            # Build FAISS index
            logger.warning(f"   🎯 Building unified FAISS index with {len(embeddings)} embeddings...")
            dimension = len(embeddings[0])
            index = faiss.IndexFlatIP(dimension)  # Inner product (cosine similarity)
            
            # Normalize embeddings
            embeddings_array = np.array(embeddings).astype('float32')
            faiss.normalize_L2(embeddings_array)
            index.add(embeddings_array)
            
            # Normalize query
            query_embedding = query_embedding.reshape(1, -1)
            faiss.normalize_L2(query_embedding)
            
            # Search
            k = min(len(embeddings), top * 2)  # Get more results for final filtering
            similarities, indices = index.search(query_embedding, k=k)
            
            # Apply source-specific weights and create final ranking
            ranked_results = []
            for i, (similarity, idx) in enumerate(zip(similarities[0], indices[0])):
                result = valid_results[idx].copy()
                
                # Apply source-specific weight
                if result["source_type"] == "confluence":
                    weighted_score = float(similarity) * weight_confluence
                    source_boost = 1.1  # Slight boost for Confluence as it's more specific
                else:
                    weighted_score = float(similarity) * weight_azure
                    source_boost = 1.0
                
                result["faiss_score"] = float(similarity)
                result["weighted_score"] = weighted_score * source_boost
                result["unified_rank"] = i + 1
                
                ranked_results.append(result)
            
            # Sort by weighted score
            ranked_results.sort(key=lambda x: x["weighted_score"], reverse=True)
            
            # Add final rank
            for i, result in enumerate(ranked_results, 1):
                result["final_rank"] = i
            
            logger.warning(f"   ✅ Unified reranking complete, returning top {top} results")
            
            return ranked_results[:top]
            
        except ImportError:
            logger.warning("   ⚠️ FAISS not available, using simple combination")
            # Simple fallback: interleave results
            combined = []
            for i in range(max(len(confluence_results), len(azure_results))):
                if i < len(confluence_results):
                    combined.append(confluence_results[i])
                if i < len(azure_results) and len(combined) < top:
                    combined.append(azure_results[i])
                if len(combined) >= top:
                    break
            return combined
            
        except Exception as e:
            logger.error(f"   ❌ Error in unified reranking: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Fallback: return confluence results first, then azure
            return (confluence_results + azure_results)[:top]
    
    @staticmethod
    def serialize_dual_result(result: Dict) -> Dict:
        """Serialize dual search result for thoughts/logging"""
        return {
            "title": result.get("title", "Untitled"),
            "url": result.get("url", ""),
            "source_type": result.get("source_type", "unknown"),
            "faiss_score": result.get("faiss_score", 0),
            "weighted_score": result.get("weighted_score", 0),
            "unified_rank": result.get("unified_rank", 0),
            "final_rank": result.get("final_rank", 0),
            "has_content": len(result.get("content", "")) > 100
        }
    
    @staticmethod
    def log_dual_search_analysis(
        combined_results: List[Dict],
        confluence_results: List[Dict], 
        azure_results: List[Dict]
    ) -> None:
        """Log analysis of dual search results"""
        if not combined_results:
            logger.warning("⚠️ No combined results to analyze")
            return
        
        # Source distribution in final results
        confluence_in_final = sum(1 for r in combined_results if r.get("source_type") == "confluence")
        azure_in_final = sum(1 for r in combined_results if r.get("source_type") == "azure")
        
        logger.warning(f"📊 Dual Search Analysis:")
        logger.warning(f"   📚 Original results: {len(confluence_results)} Confluence, {len(azure_results)} Azure")
        logger.warning(f"   🎯 Final distribution: {confluence_in_final} Confluence, {azure_in_final} Azure")
        logger.warning(f"   📈 Total combined results: {len(combined_results)}")
        
        # Top results breakdown
        logger.warning(f"📋 Top 5 Combined Results:")
        for i, result in enumerate(combined_results[:5], 1):
            title = result.get("title", "No title")[:50]
            source = result.get("source_type", "unknown")
            faiss_score = result.get("faiss_score", 0)
            weighted_score = result.get("weighted_score", 0)
            source_emoji = "📚" if source == "confluence" else "🔷"
            
            logger.warning(f"   {i}. {source_emoji} {title}")
            logger.warning(f"      Source: {source} | FAISS: {faiss_score:.3f} | Weighted: {weighted_score:.3f}")