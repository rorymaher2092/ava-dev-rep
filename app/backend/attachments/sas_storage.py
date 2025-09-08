# attachments/sas_storage.py - FIXED path management for ephemeral storage
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from azure.storage.blob.aio import BlobServiceClient, ContainerClient
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from azure.core.exceptions import ResourceNotFoundError
from quart import current_app

class SASAttachmentStorage:
    """SAS-based ephemeral storage for session attachments"""
    
    def __init__(self):
        self.account_name = os.environ.get('AZURE_STORAGE_ACCOUNT')
        self.container_name = "ephemeral-attachments"
        
    async def get_container_client(self) -> ContainerClient:
        """Get container client with managed identity"""
        if not self.account_name:
            raise ValueError("AZURE_STORAGE_ACCOUNT not configured")
            
        # CRITICAL: Always use existing credential from app config
        from quart import current_app
        from config import CONFIG_CREDENTIAL
        azure_credential = current_app.config[CONFIG_CREDENTIAL]
            
        blob_service = BlobServiceClient(
            account_url=f"https://{self.account_name}.blob.core.windows.net",
            credential=azure_credential
        )
        
        container_client = blob_service.get_container_client(self.container_name)
        
        # Ensure container exists (only create, don't check properties to avoid extra calls)
        try:
            await container_client.create_container()
        except Exception:
            pass  # Container likely already exists
        
        return container_client
    
    def generate_blob_path(self, session_id: str, attachment_id: str, filename: str) -> str:
        """Generate blob path following SAS pattern: /uploads/{session_id}/{attachment_id}/{filename}"""
        return f"uploads/{session_id}/{attachment_id}/{filename}"
    
    async def upload_attachment(
        self, 
        session_id: str, 
        file_data: bytes, 
        filename: str, 
        file_type: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Upload attachment and return SAS URL with metadata"""
        
        # Validate inputs to prevent unwanted blobs
        if not session_id or not filename or not file_data:
            raise ValueError("Invalid upload parameters")
        
        # Only allow user-initiated file uploads
        if len(file_data) < 10:  # Prevent tiny/empty files
            raise ValueError("File too small to be valid")
        
        attachment_id = str(uuid.uuid4())
        blob_path = self.generate_blob_path(session_id, attachment_id, filename)
        
        container_client = await self.get_container_client()
        
        try:
            blob_client = container_client.get_blob_client(blob_path)
            
            # Prepare metadata
            upload_metadata = {
                "session_id": session_id,
                "attachment_id": attachment_id,
                "filename": filename,
                "file_type": file_type,
                "uploaded_at": datetime.utcnow().isoformat(),
                "size": str(len(file_data))
            }
            
            if metadata:
                upload_metadata.update(metadata)
            
            # Upload blob (overwrite if exists)
            await blob_client.upload_blob(
                file_data,
                overwrite=True,
                metadata=upload_metadata
            )
            
            # Generate blob URL (no SAS needed with managed identity)
            blob_url = f"https://{self.account_name}.blob.core.windows.net/{self.container_name}/{blob_path}"
            
            current_app.logger.info(f"Uploaded attachment to: {blob_path}")
            current_app.logger.info(f"Attachment ID: {attachment_id}")
            current_app.logger.info(f"Session ID: {session_id}")
            
            return {
                "attachment_id": attachment_id,
                "blob_path": blob_path,
                "blob_url": blob_url,
                "filename": filename,
                "file_type": file_type,
                "size": len(file_data),
                "uploaded_at": upload_metadata["uploaded_at"],
                "session_id": session_id  # Include session_id in return
            }
            
        finally:
            await container_client.close()
    
    def get_blob_url(self, blob_path: str) -> str:
        """Get blob URL (managed identity handles auth)"""
        return f"https://{self.account_name}.blob.core.windows.net/{self.container_name}/{blob_path}"
    
    async def get_attachment_content(self, blob_path: str) -> bytes:
        """Get attachment content from blob storage"""
        container_client = await self.get_container_client()
        
        try:
            # First try the exact path
            blob_client = container_client.get_blob_client(blob_path)
            current_app.logger.info(f"Attempting to download blob: {blob_path}")
            
            try:
                download = await blob_client.download_blob()
                content = await download.readall()
                current_app.logger.info(f"Successfully downloaded {len(content)} bytes from {blob_path}")
                return content
            except ResourceNotFoundError:
                # If exact path fails, try to find the file by name in the session
                current_app.logger.warning(f"Blob not found at {blob_path}, searching for file...")
                
                # Extract session_id and filename from the path
                path_parts = blob_path.split('/')
                if len(path_parts) >= 4:
                    session_id = path_parts[1]
                    filename = path_parts[-1]
                    
                    # Search for the file in the session
                    prefix = f"uploads/{session_id}/"
                    async for blob in container_client.list_blobs(name_starts_with=prefix):
                        if blob.name.endswith(f"/{filename}"):
                            current_app.logger.info(f"Found file at: {blob.name}")
                            blob_client = container_client.get_blob_client(blob.name)
                            download = await blob_client.download_blob()
                            content = await download.readall()
                            current_app.logger.info(f"Successfully downloaded {len(content)} bytes from {blob.name}")
                            return content
                
                # If still not found, raise the original error
                raise ResourceNotFoundError(f"Blob not found: {blob_path}")
                
        except Exception as e:
            current_app.logger.error(f"Error downloading blob {blob_path}: {type(e).__name__}: {str(e)}")
            if hasattr(e, 'status_code'):
                current_app.logger.error(f"HTTP Status Code: {e.status_code}")
            if hasattr(e, 'error_code'):
                current_app.logger.error(f"Azure Error Code: {e.error_code}")
            raise
        finally:
            await container_client.close()
    
    async def delete_attachment(self, blob_path: str) -> bool:
        """Delete attachment from blob storage"""
        container_client = await self.get_container_client()
        
        try:
            blob_client = container_client.get_blob_client(blob_path)
            await blob_client.delete_blob()
            current_app.logger.info(f"Deleted attachment: {blob_path}")
            return True
        except ResourceNotFoundError:
            current_app.logger.warning(f"Attachment already deleted: {blob_path}")
            return True
        except Exception as e:
            current_app.logger.error(f"Error deleting attachment {blob_path}: {e}")
            return False
        finally:
            await container_client.close()
    
    async def cleanup_session_attachments(self, session_id: str) -> int:
        """Clean up all attachments for a session"""
        container_client = await self.get_container_client()
        deleted_count = 0
        
        try:
            # List all blobs with session prefix
            async for blob in container_client.list_blobs(name_starts_with=f"uploads/{session_id}/"):
                try:
                    blob_client = container_client.get_blob_client(blob.name)
                    await blob_client.delete_blob()
                    deleted_count += 1
                except Exception as e:
                    current_app.logger.error(f"Error deleting blob {blob.name}: {e}")
            
            current_app.logger.info(f"Cleaned up {deleted_count} blobs for session {session_id}")
            return deleted_count
            
        finally:
            await container_client.close()

# Global instance
sas_storage = SASAttachmentStorage()