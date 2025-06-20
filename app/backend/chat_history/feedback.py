import os
import time
from typing import Any, Dict, List, Optional, Union

from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError
from azure.identity.aio import AzureDeveloperCliCredential, ManagedIdentityCredential
from quart import current_app


class FeedbackCosmosDB:
    def __init__(self):
        # Use the same approach as chat history
        self.cosmos_account = os.environ.get("AZURE_COSMOSDB_ACCOUNT")
        self.database_name = os.environ.get("AZURE_CHAT_HISTORY_DATABASE", "chat-database")
        self.container_name = "feedback"
        
        if not self.cosmos_account:
            raise ValueError("AZURE_COSMOSDB_ACCOUNT environment variable not set")

    async def initialize(self):
        """Initialize the database and container if they don't exist."""
        # Get the Azure credential from the app config (same as chat history)
        from config import CONFIG_CREDENTIAL
        azure_credential = current_app.config[CONFIG_CREDENTIAL]
        
        # Create Cosmos client using the same pattern as chat history
        self.client = CosmosClient(
            url=f"https://{self.cosmos_account}.documents.azure.com:443/", 
            credential=azure_credential
        )
        
        # Get or create the database
        database_client = self.client.get_database_client(self.database_name)
        try:
            await database_client.read()
        except CosmosResourceNotFoundError:
            await self.client.create_database(self.database_name)

        # Get or create the container
        try:
            await database_client.get_container_client(self.container_name).read()
        except CosmosResourceNotFoundError:
            await database_client.create_container(
                id=self.container_name,
                partition_key_path="/responseId"
            )

    async def add_feedback(self, feedback_data: Dict[str, Any]) -> str:
        """Add feedback to the database."""
        database_client = self.client.get_database_client(self.database_name)
        container_client = database_client.get_container_client(self.container_name)
        
        # Add timestamp if not present
        if "timestamp" not in feedback_data:
            feedback_data["timestamp"] = time.time()
            
        # Add a unique ID if not present
        if "id" not in feedback_data:
            feedback_data["id"] = f"feedback-{int(time.time())}"
            
        # Store the feedback
        response = await container_client.create_item(body=feedback_data)
        return response["id"]
    
    async def query_feedback(self, query: str, params: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Query feedback from the database."""
        database_client = self.client.get_database_client(self.database_name)
        container_client = database_client.get_container_client(self.container_name)
        
        items = []
        # Use the same pattern as chat history - iterate through pages
        result = container_client.query_items(query=query, parameters=params)
        async for page in result.by_page():
            async for item in page:
                items.append(item)
        
        return items

    async def close(self):
        """Close the client connection."""
        await self.client.close()