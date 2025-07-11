# Fixed confluence_search.py to use signed-in user's Graph token

import aiohttp
import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# CONFIGURATION: Choose your search strategy
USE_CONFLUENCE_CONNECTOR = False  # Set to True when you have your Confluence connector ID
CONFLUENCE_CONNECTOR_ID = "your-confluence-connector-id-here"  # Set this when you have it
SEARCH_ALL_EXTERNAL_CONNECTORS = False  # Set to True to search ALL external connectors (slower but comprehensive)


class ConfluenceSearchService:
    """Service for searching Confluence content via Microsoft Graph using signed-in user's token"""
    
    def __init__(self):
        """
        No longer needs app credentials - uses user tokens passed to each method
        """
        pass
        
    async def find_confluence_connector_id(self, user_graph_token: str) -> Optional[str]:
        """
        Find the Confluence connector ID using exact name match
        """
        logger.info("🔍 Finding Confluence connector with exact name match...")
        target_connector_name = "Confluence_Ava_Connector"
        logger.info(f"   Looking for connector named: '{target_connector_name}'")
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        try:
            logger.info("   Making API call to list connections...")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/external/connections",
                    headers=headers
                ) as response:
                    logger.info(f"   API Response status: {response.status}")
                    
                    if response.status == 200:
                        data = await response.json()
                        connections = data.get("value", [])
                        logger.info(f"   Found {len(connections)} total connections")
                        
                        # Look for exact connector name
                        for i, connection in enumerate(connections, 1):
                            name = connection.get("name", "")
                            conn_id = connection.get("id", "")
                            state = connection.get("state", "")
                            
                            logger.info(f"     {i}. '{name}' (ID: {conn_id}, State: {state})")
                            
                            if name == target_connector_name:
                                logger.info(f"   ✅ Found exact match! Connector ID: {conn_id}")
                                return conn_id
                        
                        logger.warning(f"   ❌ Confluence connector '{target_connector_name}' not found")
                        available_names = [conn.get("name", "No name") for conn in connections]
                        logger.info(f"   Available connector names: {available_names}")
                        return None
                    else:
                        error_text = await response.text()
                        logger.error(f"   ❌ Failed to list connections: {response.status}")
                        logger.error(f"   Error details: {error_text}")
                        return None
                        
        except Exception as e:
            logger.error(f"   ❌ Exception while finding Confluence connector: {e}")
            import traceback
            logger.error(f"   Full traceback: {traceback.format_exc()}")
            return None

    async def search_all_microsoft_graph(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20,
        fields: Optional[List[str]] = None
    ) -> List[Any]:
        """
        Search Microsoft 365 content (OneDrive, Outlook, Teams) - no external connectors
        This searches built-in Microsoft 365 content the user has access to
        """
        logger.info(f"🌐 Starting Microsoft 365 search for: '{query}' (top {top})")
        logger.info(f"   Token length: {len(user_graph_token)} characters")
        
        # Default fields to retrieve
        if fields is None:
            fields = ["title", "url", "summary", "lastModifiedDateTime", "createdDateTime"]
        logger.info(f"   Requesting fields: {fields}")
        
        # Try different entity type combinations that are known to work
        entity_combinations = [
            # Combination 1: Core Microsoft 365 content
            ["driveItem", "message", "event"],
            # Combination 2: Just OneDrive files if the first fails
            ["driveItem"],
            # Combination 3: Just emails if others fail
            ["message"]
        ]
        
        all_results = []
        per_search_limit = max(1, top // len(entity_combinations))
        
        for i, entity_types in enumerate(entity_combinations, 1):
            logger.info(f"   Attempt {i}/{len(entity_combinations)}: Trying entity types {entity_types}")
            
            search_request = {
                "requests": [{
                    "entityTypes": entity_types,
                    "query": {
                        "queryString": query
                    },
                    "from": 0,
                    "size": min(per_search_limit, 25),
                    "fields": fields
                }]
            }
            
            headers = {
                "Authorization": f"Bearer {user_graph_token}",
                "Content-Type": "application/json"
            }
            
            try:
                logger.info(f"     Making API call with {len(entity_types)} entity types...")
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        "https://graph.microsoft.com/v1.0/search/query",
                        headers=headers,
                        json=search_request
                    ) as response:
                        logger.info(f"     API Response status: {response.status}")
                        
                        if response.status == 200:
                            data = await response.json()
                            logger.info(f"     Raw response contains {len(data.get('value', []))} search response containers")
                            
                            results = self._parse_general_graph_results(data)
                            logger.info(f"     ✅ Found {len(results)} results for entity types {entity_types}")
                            
                            all_results.extend(results)
                            
                            # Log sample results
                            for j, result in enumerate(results[:2], 1):
                                logger.info(f"       Sample {j}: [{result.get('content_source', 'unknown')}] {result.get('title', 'No title')}")
                        
                        else:
                            error_text = await response.text()
                            logger.warning(f"     ⚠️ Entity types {entity_types} failed: {response.status}")
                            logger.warning(f"     Error: {error_text}")
                            continue
                            
            except Exception as e:
                logger.warning(f"     ⚠️ Exception with entity types {entity_types}: {e}")
                continue
        
        # Sort and deduplicate results
        seen_ids = set()
        unique_results = []
        for result in all_results:
            hit_id = result.get("hit_id", "")
            if hit_id and hit_id not in seen_ids:
                seen_ids.add(hit_id)
                unique_results.append(result)
            elif not hit_id:  # Include results without IDs
                unique_results.append(result)
        
        # Limit to top N
        final_results = unique_results[:top]
        
        if final_results:
            # Log content type breakdown
            content_types = {}
            for result in final_results:
                content_type = result.get("content_source", "unknown")
                content_types[content_type] = content_types.get(content_type, 0) + 1
            
            logger.info(f"✅ Successfully retrieved {len(final_results)} Microsoft 365 results total")
            logger.info(f"   Content breakdown: {content_types}")
            
            # Log first few results
            for i, result in enumerate(final_results[:3], 1):
                logger.info(f"   Result {i}: [{result.get('content_source', 'unknown')}] {result.get('title', 'No title')}")
        else:
            logger.warning("❌ No results found across any entity type combination")
        
        return final_results

    async def search_confluence_content(
        self, 
        query: str, 
        confluence_connector_id: str,
        user_graph_token: str,
        top: int = 20,
        fields: Optional[List[str]] = None
    ) -> List[Any]:
        """
        Search Confluence content using the signed-in user's Graph token with specific connector ID
        """
        logger.info(f"🔗 Searching Confluence connector '{confluence_connector_id}' for: '{query}' (top {top})")
        
        # Default fields to retrieve
        if fields is None:
            fields = ["title", "url", "summary", "lastModifiedDateTime", "createdDateTime"]
        
        search_request = {
            "requests": [{
                "entityTypes": ["externalItem"],
                "query": {
                    "queryString": query
                },
                "contentSources": [confluence_connector_id],
                "from": 0,
                "size": min(top, 25),
                "fields": fields
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
                        results = self._parse_confluence_results(data)
                        logger.info(f"✅ Successfully retrieved {len(results)} Confluence results")
                        return results
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Confluence search failed: {response.status} - {error_text}")
                        return []
                        
        except Exception as e:
            logger.error(f"❌ Error searching Confluence: {e}")
            return []

    def _parse_general_graph_results(self, search_data: dict) -> List[Any]:
        """Parse Microsoft Graph search response for Microsoft 365 content (files, emails, etc.)"""
        results = []
        
        try:
            for search_response in search_data.get("value", []):
                for container in search_response.get("hitsContainers", []):
                    for hit in container.get("hits", []):
                        # Extract result data
                        hit_id = hit.get("hitId", "")
                        rank = hit.get("rank", 0)
                        summary = hit.get("summary", "")
                        
                        # Extract properties - these vary by content type
                        resource = hit.get("resource", {})
                        properties = resource.get("properties", {})
                        
                        # Try to get title from various fields
                        title = (properties.get("title") or 
                                properties.get("name") or 
                                properties.get("subject") or 
                                resource.get("name") or 
                                "Untitled")
                        
                        # Try to get URL from various fields  
                        url = (properties.get("url") or 
                              properties.get("webUrl") or 
                              resource.get("webUrl") or 
                              "")
                        
                        # Get content source/type
                        content_source = resource.get("@odata.type", "unknown")
                        if "driveItem" in content_source:
                            content_source = "onedrive"
                        elif "message" in content_source:
                            content_source = "email"
                        elif "event" in content_source:
                            content_source = "calendar"
                        elif "site" in content_source:
                            content_source = "sharepoint_site"
                        elif "list" in content_source:
                            content_source = "sharepoint_list"
                        elif "listItem" in content_source:
                            content_source = "sharepoint_item"
                        else:
                            content_source = "microsoft365"
                        
                        last_modified = (properties.get("lastModifiedDateTime") or 
                                        properties.get("createdDateTime") or 
                                        resource.get("lastModifiedDateTime"))
                        
                        # Create result object
                        result = {
                            "hit_id": hit_id,
                            "title": title,
                            "url": url,
                            "summary": summary,
                            "rank": rank,
                            "last_modified": last_modified,
                            "content_source": content_source
                        }
                        results.append(result)
                        
            logger.debug(f"Parsed {len(results)} Microsoft 365 results")
            return results
            
        except Exception as e:
            logger.error(f"Error parsing Microsoft 365 results: {e}")
            return []

    def _parse_confluence_results(self, search_data: dict) -> List[Any]:
        """Parse Microsoft Graph search response for Confluence content"""
        results = []
        
        try:
            for search_response in search_data.get("value", []):
                for container in search_response.get("hitsContainers", []):
                    for hit in container.get("hits", []):
                        # Extract result data
                        hit_id = hit.get("hitId", "")
                        rank = hit.get("rank", 0)
                        summary = hit.get("summary", "")
                        
                        # Extract properties
                        properties = hit.get("resource", {}).get("properties", {})
                        title = properties.get("title", "Untitled")
                        url = properties.get("url", "")
                        last_modified = properties.get("lastModifiedDateTime")
                        
                        # Create result object
                        result = {
                            "hit_id": hit_id,
                            "title": title,
                            "url": url,
                            "summary": summary,
                            "rank": rank,
                            "last_modified": last_modified,
                            "content_source": "confluence"
                        }
                        results.append(result)
                        
            logger.debug(f"Parsed {len(results)} Confluence results")
            return results
            
        except Exception as e:
            logger.error(f"Error parsing Confluence results: {e}")
            return []

    async def search_with_auto_discovery(
        self,
        query: str,
        user_graph_token: str,
        top: int = 20,
        fields: Optional[List[str]] = None
    ) -> List[Any]:
        """
        Search with configuration-based approach:
        - If SEARCH_ALL_EXTERNAL_CONNECTORS = True: Search all external connectors
        - If USE_CONFLUENCE_CONNECTOR = True: Search specific Confluence connector
        - If both False: Search Microsoft 365 content only
        """
        
        logger.info("🚀 Starting auto-discovery search process")
        logger.info(f"   Query: '{query}' (top {top})")
        logger.info(f"   Configuration:")
        logger.info(f"     USE_CONFLUENCE_CONNECTOR = {USE_CONFLUENCE_CONNECTOR}")
        logger.info(f"     SEARCH_ALL_EXTERNAL_CONNECTORS = {SEARCH_ALL_EXTERNAL_CONNECTORS}")
        logger.info(f"     CONFLUENCE_CONNECTOR_ID = '{CONFLUENCE_CONNECTOR_ID}'")
        
        # Option 1: Search ALL external connectors (comprehensive but slower)
        if SEARCH_ALL_EXTERNAL_CONNECTORS:
            logger.info("🔗 Route 1: Searching ALL external connectors (comprehensive mode)")
            return await self.search_all_external_connectors(
                query=query,
                user_graph_token=user_graph_token,
                top=top,
                fields=fields
            )
        
        # Option 2: Search specific Confluence connector
        if USE_CONFLUENCE_CONNECTOR:
            logger.info("🎯 Route 2: Searching specific Confluence connector")
            
            # Try configured connector ID first
            if CONFLUENCE_CONNECTOR_ID and CONFLUENCE_CONNECTOR_ID != "your-confluence-connector-id-here":
                logger.info(f"   Using pre-configured connector ID: {CONFLUENCE_CONNECTOR_ID}")
                return await self.search_confluence_content(
                    query=query,
                    confluence_connector_id=CONFLUENCE_CONNECTOR_ID,
                    user_graph_token=user_graph_token,
                    top=top,
                    fields=fields
                )
            
            # Try to auto-discover the connector
            logger.info("   No pre-configured ID, attempting auto-discovery...")
            connector_id = await self.find_confluence_connector_id(user_graph_token)
            
            if connector_id:
                logger.info(f"   ✅ Auto-discovered connector ID: {connector_id}")
                return await self.search_confluence_content(
                    query=query,
                    confluence_connector_id=connector_id,
                    user_graph_token=user_graph_token,
                    top=top,
                    fields=fields
                )
            else:
                logger.warning("   ❌ Confluence connector not found - falling back to Microsoft 365 search")
        
        # Option 3: Search Microsoft 365 content only (default)
        logger.info("🌐 Route 3: Searching Microsoft 365 content only (default mode)")
        logger.info("   This includes: OneDrive, Outlook, SharePoint, Teams")
        return await self.search_all_microsoft_graph(
            query=query,
            user_graph_token=user_graph_token,
            top=top,
            fields=fields
        )

    async def search_all_external_connectors(
        self,
        query: str,
        user_graph_token: str,
        top: int = 20,
        fields: Optional[List[str]] = None
    ) -> List[Any]:
        """
        Search ALL external connectors the user has access to
        This finds all connectors first, then searches each one
        """
        logger.info(f"🔗 Starting search across ALL external connectors")
        logger.info(f"   Query: '{query}' (top {top})")
        logger.info(f"   Token length: {len(user_graph_token)} characters")
        
        # First, get all available connectors
        logger.info("   Step 1: Listing all available external connectors...")
        connectors = await self._list_all_connectors(user_graph_token)
        
        if not connectors:
            logger.warning("   No external connectors found - falling back to Microsoft 365 search")
            return await self.search_all_microsoft_graph(query, user_graph_token, top, fields)
        
        logger.info(f"   Found {len(connectors)} external connectors to search:")
        for i, connector in enumerate(connectors, 1):
            connector_name = connector.get("name", "Unknown")
            connector_id = connector.get("id", "No ID")
            connector_state = connector.get("state", "Unknown")
            logger.info(f"     {i}. {connector_name} (ID: {connector_id}, State: {connector_state})")
        
        all_results = []
        per_connector_limit = max(1, top // len(connectors))  # Split the top limit across connectors
        logger.info(f"   Step 2: Searching each connector (limit: {per_connector_limit} per connector)")
        
        # Search each connector
        for i, connector in enumerate(connectors, 1):
            connector_id = connector.get("id")
            connector_name = connector.get("name", "Unknown")
            
            try:
                logger.info(f"   Searching connector {i}/{len(connectors)}: {connector_name}")
                logger.info(f"     Connector ID: {connector_id}")
                
                start_time = logger.info("     Making search request...")
                
                connector_results = await self.search_confluence_content(
                    query=query,
                    confluence_connector_id=connector_id,
                    user_graph_token=user_graph_token,
                    top=per_connector_limit,
                    fields=fields
                )
                
                logger.info(f"     ✅ Found {len(connector_results)} results in {connector_name}")
                
                # Add connector info to results
                for result in connector_results:
                    if isinstance(result, dict):
                        result["connector_name"] = connector_name
                        result["connector_id"] = connector_id
                
                all_results.extend(connector_results)
                
                # Log sample results from this connector
                if connector_results:
                    for j, result in enumerate(connector_results[:2], 1):
                        title = result.get("title", "No title")
                        logger.info(f"       Sample {j}: {title}")
                
            except Exception as e:
                logger.error(f"     ❌ Error searching connector {connector_name}: {e}")
                logger.error(f"       Error type: {type(e)}")
                continue
        
        # Sort by rank and limit to top N
        logger.info(f"   Step 3: Combining and sorting {len(all_results)} total results")
        all_results.sort(key=lambda x: x.get("rank", 0))
        final_results = all_results[:top]
        
        # Log final breakdown
        connector_breakdown = {}
        for result in final_results:
            connector_name = result.get("connector_name", "Unknown")
            connector_breakdown[connector_name] = connector_breakdown.get(connector_name, 0) + 1
        
        logger.info(f"✅ Final results: {len(final_results)} from {len(connector_breakdown)} connectors")
        logger.info(f"   Results by connector: {connector_breakdown}")
        
        return final_results

    async def _list_all_connectors(self, user_graph_token: str) -> List[dict]:
        """List all external connectors the user has access to"""
        logger.info("📋 Listing all external connectors...")
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        try:
            logger.info("   Making API call to https://graph.microsoft.com/v1.0/external/connections")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/external/connections",
                    headers=headers
                ) as response:
                    logger.info(f"   API Response status: {response.status}")
                    
                    if response.status == 200:
                        data = await response.json()
                        connectors = data.get("value", [])
                        logger.info(f"   ✅ Successfully retrieved {len(connectors)} connectors")
                        
                        # Log each connector's details
                        if connectors:
                            logger.info("   Available connectors:")
                            for i, connector in enumerate(connectors, 1):
                                name = connector.get("name", "No name")
                                conn_id = connector.get("id", "No ID")
                                state = connector.get("state", "Unknown state")
                                description = connector.get("description", "No description")
                                logger.info(f"     {i}. {name}")
                                logger.info(f"        ID: {conn_id}")
                                logger.info(f"        State: {state}")
                                if description != "No description":
                                    logger.info(f"        Description: {description[:100]}...")
                        else:
                            logger.info("   No connectors found in response")
                        
                        return connectors
                    else:
                        error_text = await response.text()
                        logger.error(f"   ❌ Failed to list connectors: {response.status}")
                        logger.error(f"   Error details: {error_text}")
                        return []
        except Exception as e:
            logger.error(f"   ❌ Exception while listing connectors: {e}")
            import traceback
            logger.error(f"   Full traceback: {traceback.format_exc()}")
            return []


# Create service instance - no longer needs credentials
confluence_service = ConfluenceSearchService()