# direct_attachment_storage.py - Store actual files in blob storage
import uuid
import json
import time
from typing import Dict, Optional, Any
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError
from quart import current_app
import logging

logger = logging.getLogger(__name__)

class DirectAttachmentStorage:
    """Store actual files in blob storage with UUID references"""
    
    def __init__(self):
        self.container_name = 'temp-attachments'
        self.blob_service_client = None
        
    def _get_blob_client(self):
        """Get blob client using existing app credentials"""
        if self.blob_service_client:
            return self.blob_service_client
            
        try:
            from config import CONFIG_CREDENTIAL
            account_name = current_app.config.get('AZURE_STORAGE_ACCOUNT')
            credential = current_app.config.get(CONFIG_CREDENTIAL)
            
            if account_name and credential:
                self.blob_service_client = BlobServiceClient(
                    account_url=f"https://{account_name}.blob.core.windows.net",
                    credential=credential
                )
                return self.blob_service_client
        except Exception as e:
            logger.error(f"Failed to create blob client: {e}")
            raise
    
    async def store_file(self, file_data: bytes, filename: str, file_type: str, metadata: Dict[str, Any] = None) -> str:
        """Store actual file in blob storage and return UUID"""
        file_id = str(uuid.uuid4())
        
        try:
            blob_client = self._get_blob_client()
            container_client = blob_client.get_container_client(self.container_name)
            
            # Ensure container exists
            try:
                await container_client.get_container_properties()
            except ResourceNotFoundError:
                await container_client.create_container()
                logger.info(f"Created container: {self.container_name}")
            
            # Store the actual file with UUID as name
            blob_name = f"{file_id}{file_type}"  # e.g., "uuid.pdf"
            blob_client_obj = container_client.get_blob_client(blob_name)
            
            # Prepare metadata
            blob_metadata = {
                "original_filename": filename,
                "file_type": file_type,
                "file_id": file_id,
                "uploaded_at": str(time.time()),
                "size": str(len(file_data))
            }
            if metadata:
                blob_metadata.update(metadata)
            
            # Upload the actual file
            await blob_client_obj.upload_blob(
                file_data,
                overwrite=True,
                metadata=blob_metadata
            )
            
            logger.info(f"Stored file {filename} as {blob_name} with ID {file_id}")
            return file_id
            
        except Exception as e:
            logger.error(f"Failed to store file: {e}")
            raise
    
    async def get_file(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file data and metadata by ID"""
        try:
            blob_client = self._get_blob_client()
            container_client = blob_client.get_container_client(self.container_name)
            
            # Try to find the file with any extension
            async for blob in container_client.list_blobs(name_starts_with=file_id):
                blob_client_obj = container_client.get_blob_client(blob.name)
                
                # Download file content
                download = await blob_client_obj.download_blob()
                file_data = await download.readall()
                
                # Get metadata
                properties = await blob_client_obj.get_blob_properties()
                
                return {
                    "file_id": file_id,
                    "file_data": file_data,
                    "blob_name": blob.name,
                    "original_filename": properties.metadata.get("original_filename", "unknown"),
                    "file_type": properties.metadata.get("file_type", ""),
                    "size": len(file_data),
                    "metadata": properties.metadata
                }
            
            logger.warning(f"File {file_id} not found")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get file {file_id}: {e}")
            return None
    
    async def delete_file(self, file_id: str) -> bool:
        """Delete file by ID"""
        try:
            blob_client = self._get_blob_client()
            container_client = blob_client.get_container_client(self.container_name)
            
            # Find and delete the file
            async for blob in container_client.list_blobs(name_starts_with=file_id):
                blob_client_obj = container_client.get_blob_client(blob.name)
                await blob_client_obj.delete_blob()
                logger.info(f"Deleted file {file_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete file {file_id}: {e}")
            return False

# Global instance
attachment_storage = DirectAttachmentStorage()