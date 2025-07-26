import asyncio
import logging
import time
import hashlib
import pickle
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)


class FAISSConfig:
    """Configuration for FAISS vector store"""
    # Persistence paths
    DEFAULT_INDEX_PATH = "faiss_index.bin"
    DEFAULT_METADATA_PATH = "faiss_metadata.pkl"
    
    # Cache settings
    EMBEDDING_CACHE_EXPIRY_HOURS = 24
    MAX_CACHE_SIZE = 10000
    CACHE_CLEANUP_RATIO = 0.1  # Remove 10% when cache is full
    
    # Search weights
    DEFAULT_LEXICAL_WEIGHT = 0.3
    DEFAULT_VECTOR_WEIGHT = 0.7
    
    # Concurrency - OPTIMIZED FOR PERFORMANCE
    MAX_CONCURRENT_EMBEDDINGS = 8  # Increased for better throughput
    EMBEDDING_RETRY_ATTEMPTS = 2  # Reduced for faster failure recovery
    EMBEDDING_RETRY_DELAY = 0.5  # Reduced delay
    
    # Batch processing
    EMBEDDING_BATCH_SIZE = 10  # Process embeddings in batches
    INDEX_UPDATE_BATCH_SIZE = 50  # Batch index updates


class FAISSManager:
    """
    Manages FAISS vector index with persistence, caching, and optimized embedding generation
    
    MAJOR OPTIMIZATIONS:
    1. Reduced index locking (batch updates)
    2. Intelligent duplicate detection
    3. Async cache operations
    4. Batch embedding generation
    """
    
    def __init__(
        self,
        embedding_dimensions: int,
        index_path: Optional[str] = None,
        metadata_path: Optional[str] = None,
        lexical_weight: float = FAISSConfig.DEFAULT_LEXICAL_WEIGHT,
        vector_weight: float = FAISSConfig.DEFAULT_VECTOR_WEIGHT
    ):
        """
        Initialize FAISS manager with optimized settings
        """
        self.embedding_dimensions = embedding_dimensions
        self.index_path = index_path or FAISSConfig.DEFAULT_INDEX_PATH
        self.metadata_path = metadata_path or FAISSConfig.DEFAULT_METADATA_PATH
        self.lexical_weight = lexical_weight
        self.vector_weight = vector_weight
        
        # Core components
        self.faiss_index = None
        self.document_metadata = {}  # doc_id -> metadata
        self.embedding_cache = {}    # text_hash -> embedding
        self.cache_timestamps = {}   # text_hash -> timestamp
        
        # OPTIMIZATION: Tracking for intelligent updates
        self.pending_additions = []  # Documents waiting to be added to index
        self.last_index_update = time.time()
        
        # Concurrency control - OPTIMIZED
        self.embedding_semaphore = asyncio.Semaphore(FAISSConfig.MAX_CONCURRENT_EMBEDDINGS)
        self._index_lock = asyncio.Lock()  # Only for actual index operations
        self._cache_lock = asyncio.Lock()  # Separate lock for cache operations
        
        # Try to load existing index
        self.load()
    
    def load(self) -> bool:
        """Load FAISS index and metadata from disk"""
        try:
            # Load FAISS index
            if Path(self.index_path).exists():
                import faiss
                self.faiss_index = faiss.read_index(self.index_path)
                logger.info(f"Loaded FAISS index with {self.faiss_index.ntotal} vectors from {self.index_path}")
            else:
                self._initialize_empty_index()
                return False
            
            # Load metadata and cache
            if Path(self.metadata_path).exists():
                with open(self.metadata_path, 'rb') as f:
                    data = pickle.load(f)
                    self.document_metadata = data.get('metadata', {})
                    self.embedding_cache = data.get('cache', {})
                    self.cache_timestamps = data.get('timestamps', {})
                
                # Clean expired cache entries
                self._clean_expired_cache()
                
                logger.info(
                    f"Loaded metadata: {len(self.document_metadata)} documents, "
                    f"{len(self.embedding_cache)} cached embeddings"
                )
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to load FAISS data: {e}")
            self._initialize_empty_index()
            return False
    
    def save(self) -> bool:
        """Save FAISS index and metadata to disk"""
        try:
            # OPTIMIZATION: Flush any pending additions before saving
            if self.pending_additions:
                asyncio.create_task(self._flush_pending_additions())
            
            # Save FAISS index
            if self.faiss_index and self.faiss_index.ntotal > 0:
                import faiss
                faiss.write_index(self.faiss_index, self.index_path)
                logger.info(f"Saved FAISS index with {self.faiss_index.ntotal} vectors to {self.index_path}")
            
            # Save metadata and cache
            with open(self.metadata_path, 'wb') as f:
                pickle.dump({
                    'metadata': self.document_metadata,
                    'cache': self.embedding_cache,
                    'timestamps': self.cache_timestamps
                }, f)
            
            logger.debug(f"Saved metadata and cache to {self.metadata_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save FAISS data: {e}")
            return False
    
    def _initialize_empty_index(self):
        """Initialize an empty FAISS index with detailed debugging"""
        try:
            logger.warning("🔍 DEBUG: Starting _initialize_empty_index...")
            
            import faiss
            logger.warning(f"🔍 DEBUG: FAISS imported successfully in _initialize_empty_index")
            logger.warning(f"🔍 DEBUG: Creating IndexFlatIP with {self.embedding_dimensions} dimensions")
            
            self.faiss_index = faiss.IndexFlatIP(self.embedding_dimensions)
            logger.warning(f"🔍 DEBUG: IndexFlatIP created successfully")
            
            self.document_metadata = {}
            self.embedding_cache = {}
            self.cache_timestamps = {}
            self.pending_additions = []
            
            logger.warning(f"✅ DEBUG: Initialized empty FAISS index with {self.embedding_dimensions} dimensions")
            
        except ImportError as ie:
            logger.error(f"❌ DEBUG: FAISS ImportError in _initialize_empty_index: {ie}")
            logger.error("FAISS not installed! Install with: pip install faiss-cpu")
            self.faiss_index = None
            
        except Exception as e:
            logger.error(f"❌ DEBUG: Unexpected error in _initialize_empty_index: {e}")
            logger.error(f"❌ DEBUG: Error type: {type(e).__name__}")
            import traceback
            logger.error(f"❌ DEBUG: Full traceback:\n{traceback.format_exc()}")
            self.faiss_index = None
    
    def _clean_expired_cache(self):
        """Remove expired embeddings from cache"""
        current_time = time.time()
        expiry_seconds = FAISSConfig.EMBEDDING_CACHE_EXPIRY_HOURS * 3600
        
        expired_keys = [
            key for key, timestamp in self.cache_timestamps.items()
            if current_time - timestamp > expiry_seconds
        ]
        
        for key in expired_keys:
            del self.embedding_cache[key]
            del self.cache_timestamps[key]
        
        if expired_keys:
            logger.info(f"Cleaned {len(expired_keys)} expired cache entries")
    
    async def _clean_old_cache_entries(self):
        """OPTIMIZATION: Async cache cleanup to avoid blocking"""
        async with self._cache_lock:
            entries_to_remove = int(FAISSConfig.MAX_CACHE_SIZE * FAISSConfig.CACHE_CLEANUP_RATIO)
            oldest_keys = sorted(
                self.cache_timestamps.keys(),
                key=lambda k: self.cache_timestamps[k]
            )[:entries_to_remove]
            
            for key in oldest_keys:
                del self.embedding_cache[key]
                del self.cache_timestamps[key]
            
            logger.debug(f"Cleaned {len(oldest_keys)} old cache entries")
    
    def _get_text_hash(self, text: str) -> str:
        """Generate hash for text (for caching)"""
        return hashlib.md5(text.encode()).hexdigest()
    
    def _is_document_in_index(self, doc_id: str, text: str) -> bool:
        """
        OPTIMIZATION: Check if document already exists in index
        Uses both metadata and content hash for intelligent duplicate detection
        """
        # Check metadata first (fastest)
        if doc_id in self.document_metadata:
            return True
        
        # Check if content hash is cached (indicates we've seen this content)
        text_hash = self._get_text_hash(text[:8000])
        if text_hash in self.embedding_cache:
            # Content exists but maybe with different ID - add to metadata
            self.document_metadata[doc_id] = {
                "id": doc_id,
                "added_at": time.time(),
                "content_hash": text_hash
            }
            return True
        
        return False
    
    async def get_embedding(
        self,
        text: str,
        openai_client: Any,
        model_name: str,
        dimensions: Optional[int] = None
    ) -> Optional[np.ndarray]:
        """
        Get embedding for text, using cache if available
        OPTIMIZATION: Better error handling and retry logic
        """
        if not text or not openai_client:
            return None
        
        # Check cache first
        text_hash = self._get_text_hash(text[:8000])
        
        async with self._cache_lock:
            if text_hash in self.embedding_cache:
                timestamp = self.cache_timestamps.get(text_hash, 0)
                if time.time() - timestamp < (FAISSConfig.EMBEDDING_CACHE_EXPIRY_HOURS * 3600):
                    return np.array(self.embedding_cache[text_hash])
        
        # Generate new embedding with optimized retry logic
        async with self.embedding_semaphore:
            for attempt in range(FAISSConfig.EMBEDDING_RETRY_ATTEMPTS):
                try:
                    # Prepare parameters
                    params = {
                        "model": model_name,
                        "input": text[:8000]
                    }
                    
                    # Add dimensions for text-embedding-3 models
                    if dimensions and "text-embedding-3" in model_name:
                        params["dimensions"] = dimensions
                    
                    # Create embedding
                    response = await openai_client.embeddings.create(**params)
                    embedding = response.data[0].embedding
                    
                    # Cache it with async lock
                    async with self._cache_lock:
                        self.embedding_cache[text_hash] = embedding
                        self.cache_timestamps[text_hash] = time.time()
                        
                        # Clean cache if needed (async)
                        if len(self.embedding_cache) > FAISSConfig.MAX_CACHE_SIZE:
                            asyncio.create_task(self._clean_old_cache_entries())
                    
                    return np.array(embedding)
                    
                except Exception as e:
                    logger.warning(f"Embedding attempt {attempt + 1} failed: {e}")
                    if attempt < FAISSConfig.EMBEDDING_RETRY_ATTEMPTS - 1:
                        await asyncio.sleep(FAISSConfig.EMBEDDING_RETRY_DELAY * (2 ** attempt))
                    else:
                        logger.error(f"Failed to generate embedding after {FAISSConfig.EMBEDDING_RETRY_ATTEMPTS} attempts")
                        return None
    
    async def add_documents(
        self,
        documents: List[Dict[str, Any]],
        openai_client: Any,
        model_name: str,
        dimensions: Optional[int] = None,
        id_field: str = "id",
        text_field: str = "text",
        metadata_fields: Optional[List[str]] = None
    ) -> int:
        """
        Add documents to the FAISS index with optimizations
        
        MAJOR OPTIMIZATIONS:
        1. Intelligent duplicate detection
        2. Batch embedding generation
        3. Deferred index updates
        """
        if not self.faiss_index:
            logger.error("FAISS index not initialized")
            return 0
        
        # Filter out documents that already exist
        new_documents = []
        for doc in documents:
            doc_id = doc.get(id_field)
            text = doc.get(text_field)
            
            if not doc_id or not text:
                continue
            
            # OPTIMIZATION: Intelligent duplicate detection
            if not self._is_document_in_index(doc_id, text):
                new_documents.append(doc)
        
        if not new_documents:
            logger.debug("No new documents to add (all already in index)")
            return 0
        
        logger.info(f"Adding {len(new_documents)} new documents to FAISS index")
        
        # OPTIMIZATION: Batch process embeddings
        added_count = 0
        for i in range(0, len(new_documents), FAISSConfig.EMBEDDING_BATCH_SIZE):
            batch = new_documents[i:i + FAISSConfig.EMBEDDING_BATCH_SIZE]
            batch_added = await self._process_document_batch(
                batch, openai_client, model_name, dimensions, 
                id_field, text_field, metadata_fields
            )
            added_count += batch_added
        
        # OPTIMIZATION: Deferred index update for better performance
        if added_count > 0:
            logger.info(f"Queued {added_count} documents for index update")
            # Flush immediately if batch is large enough, otherwise defer
            if len(self.pending_additions) >= FAISSConfig.INDEX_UPDATE_BATCH_SIZE:
                await self._flush_pending_additions()
        
        return added_count
    
    async def _process_document_batch(
        self,
        documents: List[Dict[str, Any]],
        openai_client: Any,
        model_name: str,
        dimensions: Optional[int],
        id_field: str,
        text_field: str,
        metadata_fields: Optional[List[str]]
    ) -> int:
        """Process a batch of documents concurrently"""
        
        # Create embedding tasks for the batch
        embedding_tasks = []
        doc_infos = []
        
        for doc in documents:
            doc_id = doc.get(id_field)
            text = doc.get(text_field)
            
            task = self.get_embedding(text, openai_client, model_name, dimensions)
            embedding_tasks.append(task)
            doc_infos.append((doc_id, text, doc))
        
        # Execute all embeddings in parallel
        embeddings = await asyncio.gather(*embedding_tasks, return_exceptions=True)
        
        # Process results
        added_count = 0
        for (doc_id, text, doc), embedding in zip(doc_infos, embeddings):
            if isinstance(embedding, Exception):
                logger.warning(f"Failed to embed document {doc_id}: {embedding}")
                continue
            
            if embedding is not None:
                # Prepare metadata
                metadata = {"id": doc_id, "added_at": time.time()}
                if metadata_fields:
                    for field in metadata_fields:
                        if field in doc:
                            metadata[field] = doc[field]
                
                # Add to pending additions (will be flushed to index later)
                self.pending_additions.append({
                    "embedding": embedding,
                    "doc_id": doc_id,
                    "metadata": metadata
                })
                
                added_count += 1
        
        return added_count
    
    async def _flush_pending_additions(self):
        """
        OPTIMIZATION: Batch update the FAISS index to reduce locking
        """
        if not self.pending_additions:
            return
        
        import faiss
        
        async with self._index_lock:
            try:
                # Prepare batch data
                embeddings_to_add = []
                metadata_to_add = {}
                
                for item in self.pending_additions:
                    embeddings_to_add.append(item["embedding"])
                    metadata_to_add[item["doc_id"]] = item["metadata"]
                
                if embeddings_to_add:
                    # Convert to numpy array and normalize
                    embeddings_array = np.array(embeddings_to_add).astype('float32')
                    faiss.normalize_L2(embeddings_array)
                    
                    # Add to index in one operation
                    self.faiss_index.add(embeddings_array)
                    
                    # Update metadata
                    self.document_metadata.update(metadata_to_add)
                    
                    logger.info(f"Flushed {len(embeddings_to_add)} documents to FAISS index (total: {self.faiss_index.ntotal})")
                
                # Clear pending additions
                self.pending_additions.clear()
                self.last_index_update = time.time()
                
            except Exception as e:
                logger.error(f"Failed to flush pending additions: {e}")
    
    async def search(
        self,
        query_embedding: Optional[np.ndarray] = None,
        query_text: Optional[str] = None,
        openai_client: Optional[Any] = None,
        model_name: Optional[str] = None,
        dimensions: Optional[int] = None,
        top_k: int = 10,
        score_threshold: Optional[float] = None
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """
        Search the FAISS index with optimizations
        
        OPTIMIZATION: Ensure pending additions are flushed before search
        """
        if not self.faiss_index or self.faiss_index.ntotal == 0:
            logger.warning("FAISS index is empty")
            return []
        
        # OPTIMIZATION: Flush pending additions before search
        if self.pending_additions:
            await self._flush_pending_additions()
        
        import faiss
        
        # Get query embedding if not provided
        if query_embedding is None:
            if not query_text or not openai_client or not model_name:
                raise ValueError("Must provide either query_embedding or (query_text, openai_client, model_name)")
            
            query_embedding = await self.get_embedding(query_text, openai_client, model_name, dimensions)
            if query_embedding is None:
                logger.error("Failed to generate query embedding")
                return []
        
        # Normalize query
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        faiss.normalize_L2(query_embedding)
        
        # Search
        k = min(top_k, self.faiss_index.ntotal)
        similarities, indices = self.faiss_index.search(query_embedding, k)
        
        # Build results
        results = []
        doc_ids = list(self.document_metadata.keys())
        
        for sim, idx in zip(similarities[0], indices[0]):
            if idx < 0 or idx >= len(doc_ids):
                continue
            
            similarity = float(sim)
            if score_threshold and similarity < score_threshold:
                continue
            
            doc_id = doc_ids[idx]
            metadata = self.document_metadata[doc_id]
            results.append((doc_id, similarity, metadata))
        
        return results
    
    def combine_scores(
        self,
        results: List[Dict[str, Any]],
        id_field: str = "id",
        lexical_score_field: str = "lexical_score",
        vector_score_field: str = "faiss_score"
    ) -> List[Dict[str, Any]]:
        """
        Combine lexical and vector scores for hybrid search
        OPTIMIZATION: In-place sorting to reduce memory usage
        """
        for result in results:
            lexical_score = result.get(lexical_score_field, 0.0)
            vector_score = result.get(vector_score_field, 0.0)
            
            # Calculate weighted combination
            combined_score = (
                self.lexical_weight * lexical_score +
                self.vector_weight * vector_score
            )
            
            result["combined_score"] = combined_score
        
        # Sort by combined score (in-place for efficiency)
        results.sort(key=lambda x: x.get("combined_score", 0), reverse=True)
        
        return results
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the FAISS index and cache"""
        stats = {
            "index_size": self.faiss_index.ntotal if self.faiss_index else 0,
            "documents_tracked": len(self.document_metadata),
            "cache_size": len(self.embedding_cache),
            "pending_additions": len(self.pending_additions),
            "embedding_dimensions": self.embedding_dimensions,
            "index_path": self.index_path,
            "metadata_path": self.metadata_path,
            "last_index_update": self.last_index_update
        }
        
        # Add cache memory estimate (rough)
        if self.embedding_cache:
            avg_embedding_size = self.embedding_dimensions * 4  # 4 bytes per float32
            cache_memory_mb = (len(self.embedding_cache) * avg_embedding_size) / (1024 * 1024)
            stats["cache_memory_mb"] = round(cache_memory_mb, 2)
        
        return stats
    
    def clear(self):
        """Clear the index and all data"""
        self._initialize_empty_index()
        logger.info("Cleared FAISS index and all data")
    
    async def remove_documents(self, doc_ids: List[str]) -> int:
        """
        Remove documents from the index (requires rebuilding)
        
        Note: FAISS doesn't support direct removal, so this removes from metadata
        and marks for rebuild if needed
        """
        if not doc_ids:
            return 0
        
        # Remove from metadata
        removed_count = 0
        for doc_id in doc_ids:
            if doc_id in self.document_metadata:
                del self.document_metadata[doc_id]
                removed_count += 1
        
        # Remove from pending additions if present
        self.pending_additions = [
            item for item in self.pending_additions 
            if item["doc_id"] not in doc_ids
        ]
        
        logger.info(f"Removed {removed_count} documents from metadata")
        return removed_count
    
    async def optimize_index(self):
        """
        OPTIMIZATION: Periodic index optimization
        Call this during low-traffic periods
        """
        if not self.faiss_index:
            return
        
        # Flush any pending additions
        await self._flush_pending_additions()
        
        # Clean expired cache
        async with self._cache_lock:
            self._clean_expired_cache()
        
        # Save current state
        self.save()
        
        logger.info("Index optimization completed")
    
    def __del__(self):
        """Cleanup: ensure pending additions are saved"""
        if hasattr(self, 'pending_additions') and self.pending_additions:
            # Note: This won't work in async context, but helps with data safety
            logger.warning(f"FAISSManager destroyed with {len(self.pending_additions)} pending additions")