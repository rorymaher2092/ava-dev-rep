# cleanup_service.py - Automatic cleanup for temporary attachments
import asyncio
import time
import logging
from typing import List
from azure.storage.blob.aio import ContainerClient
from azure.core.exceptions import ResourceNotFoundError
from quart import current_app

logger = logging.getLogger(__name__)

class AttachmentCleanupService:
    """Service to automatically clean up old temporary attachments"""
    
    def __init__(self, max_age_hours: int = 24):
        self.max_age_hours = max_age_hours
        self.max_age_seconds = max_age_hours * 3600
        self.container_name = 'temp-attachments'
        
    async def cleanup_old_attachments(self) -> int:
        """Clean up attachments older than max_age_hours"""
        try:
            from .direct_attachment_storage import attachment_storage
            
            blob_client = attachment_storage._get_blob_client()
            if not blob_client:
                logger.error("Could not get blob client for cleanup")
                return 0
                
            container_client = blob_client.get_container_client(self.container_name)
            
            # Check if container exists
            try:
                await container_client.get_container_properties()
            except ResourceNotFoundError:
                logger.info(f"Container {self.container_name} doesn't exist, nothing to clean")
                return 0
            
            current_time = time.time()
            deleted_count = 0
            
            # List all blobs and check their age
            async for blob in container_client.list_blobs(include=['metadata']):
                try:
                    # Get upload time from metadata
                    uploaded_at = blob.metadata.get('uploaded_at') if blob.metadata else None
                    
                    if uploaded_at:
                        upload_time = float(uploaded_at)
                        age_seconds = current_time - upload_time
                        
                        if age_seconds > self.max_age_seconds:
                            # Delete old attachment
                            blob_client_obj = container_client.get_blob_client(blob.name)
                            await blob_client_obj.delete_blob()
                            deleted_count += 1
                            
                            age_hours = age_seconds / 3600
                            logger.info(f"Deleted old attachment: {blob.name} (age: {age_hours:.1f} hours)")
                    else:
                        # No metadata - assume it's old and delete it
                        blob_client_obj = container_client.get_blob_client(blob.name)
                        await blob_client_obj.delete_blob()
                        deleted_count += 1
                        logger.info(f"Deleted attachment without metadata: {blob.name}")
                        
                except Exception as e:
                    logger.error(f"Error processing blob {blob.name}: {e}")
                    continue
            
            if deleted_count > 0:
                logger.info(f"Cleanup completed: deleted {deleted_count} old attachments")
            else:
                logger.debug("Cleanup completed: no old attachments found")
                
            return deleted_count
            
        except Exception as e:
            logger.error(f"Cleanup service error: {e}")
            return 0
    
    async def cleanup_by_file_ids(self, file_ids: List[str]) -> int:
        """Clean up specific attachments by their file IDs"""
        try:
            from .direct_attachment_storage import attachment_storage
            
            deleted_count = 0
            for file_id in file_ids:
                success = await attachment_storage.delete_file(file_id)
                if success:
                    deleted_count += 1
                    logger.info(f"Deleted attachment: {file_id}")
                    
            return deleted_count
            
        except Exception as e:
            logger.error(f"Cleanup by IDs error: {e}")
            return 0

# Global cleanup service instance
cleanup_service = AttachmentCleanupService(max_age_hours=24)  # 24 hour TTL