import os
import time
from typing import Any, Dict, List, Optional

from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError


class FeedbackCosmosDB:
    def __init__(self):
        # Use the same connection string as chat history
        connection_string = os.environ.get("AZURE_COSMOSDB_CONNECTION_STRING")
        if not connection_string:
            raise ValueError("AZURE_COSMOSDB_CONNECTION_STRING environment variable not set")

        # Create a Cosmos DB client
        self.client = CosmosClient.from_connection_string(connection_string)
        self.database_name = os.environ.get("AZURE_COSMOSDB_DATABASE_NAME", "chat_history")
        self.container_name = "feedback"  # Store feedback in a separate container

    async def initialize(self):
        """Initialize the database and container if they don't exist."""
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
        async for item in container_client.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True
        ):
            items.append(item)
        
        return items

    async def close(self):
        """Close the client connection."""
        await self.client.close()