import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from azure.storage.blob.aio import BlobServiceClient, ContainerClient
from azure.core.exceptions import ResourceNotFoundError
from quart import current_app


class SuggestionsBlobStorage:
    def __init__(self):
        self.storage_account = os.environ.get("AZURE_STORAGE_ACCOUNT")
        self.container_name = "suggested-content"
        
        if not self.storage_account:
            raise ValueError("AZURE_STORAGE_ACCOUNT environment variable not set")

    async def initialize(self):
        """Initialize the blob container if it doesn't exist."""
        # Get the Azure credential from the app config (same as other services)
        from config import CONFIG_CREDENTIAL
        azure_credential = current_app.config[CONFIG_CREDENTIAL]
        
        # Create blob service client
        blob_service_url = f"https://{self.storage_account}.blob.core.windows.net"
        self.blob_service_client = BlobServiceClient(
            account_url=blob_service_url,
            credential=azure_credential
        )
        
        # Get container client
        self.container_client = self.blob_service_client.get_container_client(self.container_name)
        
        # Create container if it doesn't exist
        try:
            await self.container_client.get_container_properties()
        except ResourceNotFoundError:
            current_app.logger.info(f"Creating container '{self.container_name}'")
            await self.container_client.create_container()

    async def add_suggestion(self, suggestion_data: Dict[str, Any]) -> str:
        """Add suggestion to blob storage as a JSON file."""
        # Generate unique filename with timestamp
        timestamp = int(time.time() * 1000)  # milliseconds for better uniqueness
        suggestion_id = f"suggestion-{timestamp}-{str(uuid.uuid4())[:8]}"
        filename = f"{suggestion_id}.json"
        
        # Add metadata to suggestion
        enriched_data = {
            "id": suggestion_id,
            "timestamp": time.time(),
            **suggestion_data
        }
        
        # Convert to JSON
        json_content = json.dumps(enriched_data, indent=2, ensure_ascii=False)
        
        # Upload to blob storage
        blob_client = self.container_client.get_blob_client(filename)
        await blob_client.upload_blob(
            data=json_content,
            content_type="application/json",
            overwrite=True,
            metadata={
                "suggestion_id": suggestion_id,
                "user_id": suggestion_data.get("userId", ""),
                "timestamp": str(enriched_data["timestamp"]),
                "type": "content_suggestion"
            }
        )
        
        current_app.logger.info(f"Suggestion stored as {filename}")
        return suggestion_id

    async def list_suggestions(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all suggestions, optionally filtered by user."""
        suggestions = []
        
        try:
            # List all blobs in the container
            async for blob in self.container_client.list_blobs(include=["metadata"]):
                # Filter by user if specified
                if user_id and blob.metadata and blob.metadata.get("user_id") != user_id:
                    continue
                
                # Download and parse the JSON content
                blob_client = self.container_client.get_blob_client(blob.name)
                content = await blob_client.download_blob()
                json_content = await content.readall()
                
                try:
                    suggestion_data = json.loads(json_content.decode('utf-8'))
                    suggestions.append(suggestion_data)
                except json.JSONDecodeError as e:
                    current_app.logger.warning(f"Failed to parse suggestion file {blob.name}: {e}")
                    continue
                    
        except ResourceNotFoundError:
            current_app.logger.warning(f"Container '{self.container_name}' not found")
            
        # Sort by timestamp (newest first)
        suggestions.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
        return suggestions

    async def get_suggestion(self, suggestion_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific suggestion by ID."""
        try:
            # Try to find blob with this suggestion ID
            async for blob in self.container_client.list_blobs(include=["metadata"]):
                if blob.metadata and blob.metadata.get("suggestion_id") == suggestion_id:
                    blob_client = self.container_client.get_blob_client(blob.name)
                    content = await blob_client.download_blob()
                    json_content = await content.readall()
                    
                    try:
                        return json.loads(json_content.decode('utf-8'))
                    except json.JSONDecodeError as e:
                        current_app.logger.warning(f"Failed to parse suggestion file {blob.name}: {e}")
                        return None
                        
        except ResourceNotFoundError:
            current_app.logger.warning(f"Container '{self.container_name}' not found")
            
        return None

    async def delete_suggestion(self, suggestion_id: str) -> bool:
        """Delete a suggestion by ID."""
        try:
            # Find and delete the blob with this suggestion ID
            async for blob in self.container_client.list_blobs(include=["metadata"]):
                if blob.metadata and blob.metadata.get("suggestion_id") == suggestion_id:
                    blob_client = self.container_client.get_blob_client(blob.name)
                    await blob_client.delete_blob()
                    current_app.logger.info(f"Deleted suggestion {suggestion_id}")
                    return True
                    
        except ResourceNotFoundError:
            current_app.logger.warning(f"Container '{self.container_name}' not found")
            
        return False

    async def export_suggestions_csv(self) -> str:
        """Export all suggestions as CSV format."""
        suggestions = await self.list_suggestions()
        
        if not suggestions:
            return "timestamp,userId,username,name,question,suggestion\n"
        
        # Create CSV content
        csv_lines = ["timestamp,userId,username,name,question,suggestion"]
        
        for suggestion in suggestions:
            # Escape CSV values
            def escape_csv(value):
                if value is None:
                    return ""
                value = str(value).replace('"', '""')  # Escape quotes
                if ',' in value or '"' in value or '\n' in value:
                    return f'"{value}"'
                return value
            
            csv_line = ",".join([
                escape_csv(suggestion.get("timestamp", "")),
                escape_csv(suggestion.get("userId", "")),
                escape_csv(suggestion.get("username", "")),
                escape_csv(suggestion.get("name", "")),
                escape_csv(suggestion.get("question", "")),
                escape_csv(suggestion.get("suggestion", ""))
            ])
            csv_lines.append(csv_line)
        
        return "\n".join(csv_lines)

    async def close(self):
        """Close the client connection."""
        if hasattr(self, 'blob_service_client'):
            await self.blob_service_client.close()