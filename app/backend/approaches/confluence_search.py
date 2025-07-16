# Fixed confluence_search.py to use signed-in user's Graph token

import aiohttp
import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import sys

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')


logger = logging.getLogger(__name__)

# Add a StreamHandler to ensure logs are shown in real-time (to stdout or stderr)
if not any(isinstance(handler, logging.StreamHandler) for handler in logger.handlers):
    stream_handler = logging.StreamHandler(sys.stdout)  # You can use sys.stderr if you prefer
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)


# CONFIGURATION: Choose your search strategy
USE_CONFLUENCE_CONNECTOR = False  # Set to True when you have your Confluence connector ID
CONFLUENCE_CONNECTOR_ID = "your-confluence-connector-id-here"  # Set this when you have it
SEARCH_ALL_EXTERNAL_CONNECTORS = False  # Set to True to search ALL external connectors (no IDs needed!)


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
        logger.warning("🔍 Finding Confluence connector with exact name match...")
        target_connector_name = "Confluence_Ava_Connector"
        logger.warning(f"   Looking for connector named: '{target_connector_name}'")
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        try:
            logger.warning("   Making API call to list connections...")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/external/connections",
                    headers=headers
                ) as response:
                    logger.warning(f"   API Response status: {response.status}")
                    
                    if response.status == 200:
                        data = await response.json()
                        connections = data.get("value", [])
                        logger.warning(f"   Found {len(connections)} total connections")
                        
                        # Look for exact connector name
                        for i, connection in enumerate(connections, 1):
                            name = connection.get("name", "")
                            conn_id = connection.get("id", "")
                            state = connection.get("state", "")
                            
                            logger.warning(f"     {i}. '{name}' (ID: {conn_id}, State: {state})")
                            
                            if name == target_connector_name:
                                logger.warning(f"   ✅ Found exact match! Connector ID: {conn_id}")
                                return conn_id
                        
                        logger.warning(f"   ❌ Confluence connector '{target_connector_name}' not found")
                        available_names = [conn.get("name", "No name") for conn in connections]
                        logger.warning(f"   Available connector names: {available_names}")
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
        
    # Add this method to your ConfluenceSearchService class

    async def debug_actual_token(self, user_graph_token: str) -> dict:
        """
        Debug the actual token your app is using to understand why we get 401
        """
        logger.warning("🔍 DEBUGGING ACTUAL APP TOKEN")
        logger.warning("=" * 60)
        
        # First, let's decode the JWT token to see what's inside
        try:
            import base64
            import json
            from datetime import datetime
            
            # Split the JWT token (format: header.payload.signature)
            token_parts = user_graph_token.split('.')
            if len(token_parts) >= 2:
                # Decode the payload (second part)
                payload = token_parts[1]
                # Add padding for base64 decoding
                payload += '=' * (4 - len(payload) % 4)
                
                decoded_bytes = base64.urlsafe_b64decode(payload)
                token_payload = json.loads(decoded_bytes.decode('utf-8'))
                
                logger.warning("📋 TOKEN CONTENTS:")
                logger.warning(f"   🎯 Audience (aud): {token_payload.get('aud', 'Not found')}")
                logger.warning(f"   🔑 App ID (appid): {token_payload.get('appid', 'Not found')}")
                logger.warning(f"   👤 User ID (oid): {token_payload.get('oid', 'Not found')}")
                logger.warning(f"   🏢 Tenant ID (tid): {token_payload.get('tid', 'Not found')}")
                logger.warning(f"   📜 Scopes (scp): {token_payload.get('scp', 'Not found')}")
                logger.warning(f"   🎭 Roles (roles): {token_payload.get('roles', 'Not found')}")
                logger.warning(f"   ⏰ Expires: {datetime.fromtimestamp(token_payload.get('exp', 0))}")
                logger.warning(f"   🎫 Token Use (token_use): {token_payload.get('token_use', 'Not found')}")
                
                # Check if we have the right audience for Microsoft Graph
                audience = token_payload.get('aud', '')
                if 'graph.microsoft.com' not in audience and '00000003-0000-0000-c000-000000000000' not in audience:
                    logger.error(f"   ❌ WRONG AUDIENCE! Token audience is '{audience}' but should be for Microsoft Graph")
                    logger.error(f"      Expected: https://graph.microsoft.com OR 00000003-0000-0000-c000-000000000000")
                else:
                    logger.warning(f"   ✅ Correct audience for Microsoft Graph")
                
                # Check for the specific scopes we need
                scopes = token_payload.get('scp', '')
                required_scopes = ['ExternalConnection.Read.All', 'ExternalItem.Read.All']
                
                logger.warning("🔍 SCOPE ANALYSIS:")
                for required_scope in required_scopes:
                    if required_scope in scopes:
                        logger.warning(f"   ✅ Found required scope: {required_scope}")
                    else:
                        logger.error(f"   ❌ Missing required scope: {required_scope}")
                
                # Show all scopes for debugging
                if scopes:
                    all_scopes = scopes.split(' ')
                    logger.warning(f"   📜 All scopes in token: {all_scopes}")
                
                return token_payload
                
        except Exception as e:
            logger.error(f"❌ Error decoding token: {e}")
            return {}

    # Modified method to include token debugging in your search
    async def debug_search_with_token_analysis(
        self,
        query: str,
        user_graph_token: str,
        top: int = 20
    ) -> List[Any]:
        """
        Search with comprehensive token debugging
        """
        logger.warning("🚀 Starting search with token analysis")
        logger.warning(f"   Query: '{query}' (top {top})")
        logger.warning(f"   Token length: {len(user_graph_token)} characters")
        
        # Step 1: Analyze the token
        logger.warning("\n" + "=" * 60)
        logger.warning("STEP 1: TOKEN ANALYSIS")
        logger.warning("=" * 60)
        token_warning = await self.debug_actual_token(user_graph_token)
        
        # Step 2: Test a simple Graph call first
        logger.warning("\n" + "=" * 60)
        logger.warning("STEP 2: BASIC GRAPH API TEST")
        logger.warning("=" * 60)
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                # Test basic user profile (should always work)
                async with session.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers=headers
                ) as response:
                    if response.status == 200:
                        user_data = await response.json()
                        logger.warning(f"   ✅ Basic Graph API works - User: {user_data.get('displayName', 'Unknown')}")
                    else:
                        logger.error(f"   ❌ Basic Graph API failed: {response.status}")
                        error_text = await response.text()
                        logger.error(f"   Error: {error_text}")
                        return []
        except Exception as e:
            logger.error(f"   ❌ Exception testing basic Graph API: {e}")
            return []
        
        # Step 3: Test external connections specifically
        logger.warning("\n" + "=" * 60)
        logger.warning("STEP 3: EXTERNAL CONNECTIONS TEST")
        logger.warning("=" * 60)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/external/connections",
                    headers=headers
                ) as response:
                    logger.warning(f"   External connections API response: {response.status}")
                    
                    if response.status == 200:
                        data = await response.json()
                        connections = data.get("value", [])
                        logger.warning(f"   ✅ SUCCESS! Found {len(connections)} external connections")
                        
                        for i, conn in enumerate(connections, 1):
                            logger.warning(f"     {i}. Name: {conn.get('name', 'No name')}")
                            logger.warning(f"        ID: {conn.get('id', 'No ID')}")
                            logger.warning(f"        State: {conn.get('state', 'Unknown')}")
                        
                        return connections
                        
                    elif response.status == 401:
                        error_text = await response.text()
                        logger.error(f"   ❌ 401 UNAUTHORIZED")
                        logger.error(f"   Error details: {error_text}")
                        
                        # Try to parse the error to understand why
                        try:
                            error_json = json.loads(error_text)
                            error_code = error_json.get('error', {}).get('code', 'Unknown')
                            error_message = error_json.get('error', {}).get('message', 'Unknown')
                            logger.error(f"   Error code: {error_code}")
                            logger.error(f"   Error message: {error_message}")
                        except:
                            pass
                        
                        # Analyze possible causes
                        logger.warning("\n🔍 POSSIBLE CAUSES OF 401:")
                        scopes = token_warning.get('scp', '')
                        if 'ExternalConnection.Read.All' not in scopes:
                            logger.error("   ❌ Token doesn't contain ExternalConnection.Read.All scope")
                            logger.error("   This means the token wasn't requested with this scope")
                        else:
                            logger.warning("   ✅ Token contains ExternalConnection.Read.All scope")
                            logger.error("   ❌ But still getting 401 - this might be a user access issue")
                            logger.error("   Your user might not have access to external connectors")
                        
                        return []
                    else:
                        error_text = await response.text()
                        logger.error(f"   ❌ Unexpected status: {response.status}")
                        logger.error(f"   Error: {error_text}")
                        return []
                        
        except Exception as e:
            logger.error(f"   ❌ Exception testing external connections: {e}")
            return []

    async def search_all_microsoft_graph(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20,
        fields: Optional[List[str]] = None
    ) -> List[Any]:
        """
        Search Microsoft 365 content - falls back to basic Graph API calls if search permissions missing
        """
        logger.warning(f"🌐 Starting Microsoft 365 search for: '{query}' (top {top})")
        logger.warning(f"   Token length: {len(user_graph_token)} characters")
        
        # First try the search API
        search_results = await self._try_graph_search_api(query, user_graph_token, top, fields)
        if search_results:
            return search_results
        
        # If search API fails due to permissions, try basic Graph API calls
        logger.warning("   Search API failed, trying basic Graph API calls...")
        return await self._try_basic_graph_api(query, user_graph_token, top)

    async def _try_graph_search_api(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20,
        fields: Optional[List[str]] = None
    ) -> List[Any]:
        """Try the Graph Search API with different entity type combinations"""
        
        # Default fields to retrieve
        if fields is None:
            fields = ["title", "url", "summary", "lastModifiedDateTime", "createdDateTime"]
        logger.warning(f"   Requesting fields: {fields}")
        
        # SharePoint-focused entity type combinations
        entity_combinations = [
            # Combination 1: SharePoint sites only (what you want for now)
            ["site"],
            # Combination 2: SharePoint sites + files in document libraries
            ["site", "driveItem"], 
            # Combination 3: SharePoint files/documents only
            ["driveItem"],
            # Combination 4: SharePoint list items only
            ["listItem"],
            # Combination 5: Sites + list items (full SharePoint content)
            ["site", "listItem"]
        ]
        
        all_results = []
        
        for i, entity_types in enumerate(entity_combinations, 1):
            logger.warning(f"   Attempt {i}/{len(entity_combinations)}: Trying entity types {entity_types}")
            
            search_request = {
                "requests": [{
                    "entityTypes": entity_types,
                    "query": {
                        "queryString": query
                    },
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
                        logger.warning(f"     API Response status: {response.status}")
                        
                        if response.status == 200:
                            data = await response.json()
                            results = self._parse_general_graph_results(data)
                            logger.warning(f"     ✅ Found {len(results)} results for entity types {entity_types}")
                            all_results.extend(results)
                            
                        elif response.status == 403:
                            error_text = await response.text()
                            logger.warning(f"     ⚠️ Permission denied for {entity_types}: {response.status}")
                            logger.warning(f"     Error details: {error_text}")  # ← Now shows the actual error!
                            logger.warning(f"     This means your app needs additional Graph API permissions")
                            continue
                            
                        else:
                            error_text = await response.text()
                            logger.warning(f"     ⚠️ Entity types {entity_types} failed: {response.status}")
                            logger.warning(f"     Error details: {error_text}")  # ← Now shows the actual error!
                            continue
                            
            except Exception as e:
                logger.warning(f"     ⚠️ Exception with entity types {entity_types}: {e}")
                continue
        
        return all_results[:top] if all_results else []

    async def _try_basic_graph_api(
        self, 
        query: str, 
        user_graph_token: str,
        top: int = 20
    ) -> List[Any]:
        """
        Try basic Graph API calls that work with minimal permissions
        This is a fallback when search API permissions are missing
        """
        logger.warning("   🔧 Trying basic Graph API fallback (works with User.Read permission)")
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        results = []
        
        # 1. Get user profile (always works with User.Read)
        try:
            logger.warning("     Getting user profile...")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers=headers
                ) as response:
                    if response.status == 200:
                        user_data = await response.json()
                        
                        # Create a mock "result" from user profile if query matches
                        display_name = user_data.get("displayName", "")
                        email = user_data.get("mail", user_data.get("userPrincipalName", ""))
                        
                        if any(term.lower() in display_name.lower() or term.lower() in email.lower() 
                               for term in query.split()):
                            
                            results.append({
                                "hit_id": f"user_profile_{user_data.get('id', '')}",
                                "title": f"User Profile: {display_name}",
                                "url": f"https://outlook.office.com/people/{email}",
                                "summary": f"User profile for {display_name} ({email})",
                                "rank": 1,
                                "last_modified": None,
                                "content_source": "user_profile"
                            })
                            
                        logger.warning(f"     ✅ User profile processed (matched: {len(results) > 0})")
                    else:
                        logger.warning(f"     ⚠️ Could not get user profile: {response.status}")
                        
        except Exception as e:
            logger.warning(f"     ⚠️ Error getting user profile: {e}")
        
        # 2. Try to get recent activities (may work with basic permissions)
        try:
            logger.warning("     Trying to get recent activities...")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/me/activities/recent",
                    headers=headers
                ) as response:
                    if response.status == 200:
                        activities_data = await response.json()
                        activities = activities_data.get("value", [])
                        
                        for activity in activities[:5]:  # Limit to recent 5
                            activity_name = activity.get("activitySourceHost", "")
                            visual_elements = activity.get("visualElements", {})
                            display_text = visual_elements.get("displayText", "")
                            
                            if any(term.lower() in display_text.lower() 
                                   for term in query.split() if term):
                                
                                results.append({
                                    "hit_id": f"activity_{activity.get('id', '')}",
                                    "title": f"Recent Activity: {display_text}",
                                    "url": activity.get("contentUrl", ""),
                                    "summary": f"Recent activity from {activity_name}",
                                    "rank": 2,
                                    "last_modified": activity.get("lastModifiedDateTime"),
                                    "content_source": "recent_activity"
                                })
                        
                        logger.warning(f"     ✅ Recent activities processed (found {len(activities)}, matched {len([r for r in results if r['content_source'] == 'recent_activity'])})")
                    else:
                        logger.warning(f"     ⚠️ Recent activities not available: {response.status}")
                        
        except Exception as e:
            logger.warning(f"     ⚠️ Error getting recent activities: {e}")
        
        if results:
            logger.warning(f"   ✅ Basic Graph API returned {len(results)} results")
            for i, result in enumerate(results, 1):
                logger.warning(f"     Result {i}: [{result['content_source']}] {result['title']}")
        else:
            logger.warning("   ℹ️ No matching content found with basic Graph API calls")
            # Return a helpful message instead of empty results
            results.append({
                "hit_id": "no_permissions_message",
                "title": "Limited Search Results",
                "url": "",
                "summary": f"Your search for '{query}' requires additional Microsoft Graph permissions. Contact your admin to enable Files.Read.All and Mail.Read permissions for better search results.",
                "rank": 1,
                "last_modified": None,
                "content_source": "system_message"
            })
        
        return results[:top]

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
        logger.warning(f"🔗 Searching Confluence connector '{confluence_connector_id}' for: '{query}' (top {top})")
        
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
                        logger.warning(f"✅ Successfully retrieved {len(results)} Confluence results")
                        return results
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Confluence search failed: {response.status} - {error_text}")
                        return []
                        
        except Exception as e:
            logger.error(f"❌ Error searching Confluence: {e}")
            return []

    # Update your _parse_general_graph_results method to better handle SharePoint site data
    def _parse_general_graph_results(self, search_data: dict) -> List[Any]:
        """Parse Microsoft Graph search response for Microsoft 365 content with improved SharePoint site handling"""
        results = []
        
        try:
            for search_response in search_data.get("value", []):
                for container in search_response.get("hitsContainers", []):
                    for hit in container.get("hits", []):
                        # Extract result data
                        hit_id = hit.get("hitId", "")
                        rank = hit.get("rank", 0)
                        summary = hit.get("summary", "")
                        
                        # Extract resource warningrmation
                        resource = hit.get("resource", {})
                        
                        # For SharePoint sites, the data structure is different than files
                        if resource.get("@odata.type") == "#microsoft.graph.site":
                            # SharePoint site - data is directly in resource, not in properties
                            title = resource.get("displayName", "Untitled Site")
                            url = resource.get("webUrl", "")
                            description = resource.get("description", "")
                            last_modified = resource.get("lastModifiedDateTime")
                            created = resource.get("createdDateTime")
                            site_name = resource.get("name", "")
                            
                            # Determine if it's a personal OneDrive site or team site
                            if "-my.sharepoint.com" in url:
                                content_source = "onedrive_personal"
                            else:
                                content_source = "sharepoint_site"
                            
                            # Use description as summary if summary is empty or not useful
                            if not summary.strip() or summary == description:
                                summary = description or f"SharePoint site: {title}"
                            
                            result = {
                                "hit_id": hit_id,
                                "title": title,
                                "url": url,
                                "summary": summary,
                                "rank": rank,
                                "last_modified": last_modified,
                                "created": created,
                                "content_source": content_source,
                                "site_name": site_name,
                                "path": ""  # Sites don't have paths like files do
                            }
                            
                        else:
                            # Handle other content types (files, etc.) - existing logic
                            properties = resource.get("properties", {})
                            
                            # Try to get title from various fields
                            title = (properties.get("title") or 
                                    properties.get("name") or 
                                    properties.get("subject") or 
                                    resource.get("name") or 
                                    resource.get("displayName") or
                                    "Untitled")
                            
                            # Try to get URL from various fields  
                            url = (properties.get("url") or 
                                properties.get("webUrl") or 
                                resource.get("webUrl") or 
                                "")
                            
                            # Get content source/type with better detection
                            content_source = resource.get("@odata.type", "unknown")
                            if "driveItem" in content_source:
                                # Check if it's SharePoint or OneDrive based on URL
                                if url and "sharepoint.com" in url and "/sites/" in url:
                                    content_source = "sharepoint_file"
                                else:
                                    content_source = "onedrive_file"
                            elif "listItem" in content_source:
                                content_source = "sharepoint_list"
                            elif "message" in content_source:
                                content_source = "email"
                            elif "event" in content_source:
                                content_source = "calendar"
                            else:
                                content_source = "microsoft365"
                            
                            last_modified = (properties.get("lastModifiedDateTime") or 
                                            resource.get("lastModifiedDateTime"))
                            created = (properties.get("createdDateTime") or 
                                    resource.get("createdDateTime"))
                            
                            # Get path warningrmation for better context
                            path = properties.get("path", "")
                            
                            result = {
                                "hit_id": hit_id,
                                "title": title,
                                "url": url,
                                "summary": summary,
                                "rank": rank,
                                "last_modified": last_modified,
                                "created": created,
                                "content_source": content_source,
                                "path": path,
                                "site_name": ""
                            }
                        
                        results.append(result)
                        
            logger.debug(f"Parsed {len(results)} Microsoft 365 results")
            
            # Log a summary of what we found
            content_breakdown = {}
            for result in results:
                source = result.get("content_source", "unknown")
                content_breakdown[source] = content_breakdown.get(source, 0) + 1
            
            logger.warning(f"Content breakdown: {content_breakdown}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error parsing Microsoft 365 results: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
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
        
        logger.warning("🚀 Starting auto-discovery search process")
        logger.warning(f"   Query: '{query}' (top {top})")
        logger.warning(f"   Configuration:")
        logger.warning(f"     USE_CONFLUENCE_CONNECTOR = {USE_CONFLUENCE_CONNECTOR}")
        logger.warning(f"     SEARCH_ALL_EXTERNAL_CONNECTORS = {SEARCH_ALL_EXTERNAL_CONNECTORS}")
        logger.warning(f"     CONFLUENCE_CONNECTOR_ID = '{CONFLUENCE_CONNECTOR_ID}'")
        
        # Option 1: Search ALL external connectors (comprehensive but slower)
        if SEARCH_ALL_EXTERNAL_CONNECTORS:
            logger.warning("🔗 Route 1: Searching ALL external connectors (comprehensive mode)")
            try:
                results = await self.search_all_external_connectors(
                    query=query,
                    user_graph_token=user_graph_token,
                    top=top,
                    fields=fields
                )
                logger.warning(f"   External connectors search returned {len(results)} results")
                return results
            except Exception as e:
                logger.error(f"   ❌ Error in external connectors search: {e}")
                logger.error("   Falling back to basic Graph API...")
                return await self._try_basic_graph_api(query, user_graph_token, top)
        
        # Option 2: Search specific Confluence connector
        if USE_CONFLUENCE_CONNECTOR:
            logger.warning("🎯 Route 2: Searching specific Confluence connector")
            
            # Try configured connector ID first
            if CONFLUENCE_CONNECTOR_ID and CONFLUENCE_CONNECTOR_ID != "your-confluence-connector-id-here":
                logger.warning(f"   Using pre-configured connector ID: {CONFLUENCE_CONNECTOR_ID}")
                try:
                    results = await self.search_confluence_content(
                        query=query,
                        confluence_connector_id=CONFLUENCE_CONNECTOR_ID,
                        user_graph_token=user_graph_token,
                        top=top,
                        fields=fields
                    )
                    return results
                except Exception as e:
                    logger.error(f"   ❌ Error with configured connector: {e}")
            
            # Try to auto-discover the connector
            logger.warning("   No pre-configured ID, attempting auto-discovery...")
            try:
                connector_id = await self.find_confluence_connector_id(user_graph_token)
                
                if connector_id:
                    logger.warning(f"   ✅ Auto-discovered connector ID: {connector_id}")
                    results = await self.search_confluence_content(
                        query=query,
                        confluence_connector_id=connector_id,
                        user_graph_token=user_graph_token,
                        top=top,
                        fields=fields
                    )
                    return results
                else:
                    logger.warning("   ❌ Confluence connector not found - falling back to basic Graph API")
            except Exception as e:
                logger.error(f"   ❌ Error in auto-discovery: {e}")
        
        # Option 3: Basic Graph API fallback (works with minimal permissions)
        logger.warning("🔧 Route 3: Using basic Graph API fallback (minimal permissions)")
        logger.warning("   This works with just User.Read permission and provides helpful messages")
        return await self._try_basic_graph_api(query, user_graph_token, top)
    
    def log_connector_summary(self, connectors: List[dict]) -> None:
        """
        Log a clear summary of all connector IDs for easy copying/reference
        """
        logger.warning("=" * 60)
        logger.warning("📋 CONNECTOR ID SUMMARY (for configuration)")
        logger.warning("=" * 60)
        
        if not connectors:
            logger.warning("❌ No connectors found")
            return
        
        for i, connector in enumerate(connectors, 1):
            name = connector.get("name", "Unknown")
            connector_id = connector.get("id", "No ID")
            state = connector.get("state", "Unknown")
            
            logger.warning(f"{i}. {name}")
            logger.warning(f"   🆔 ID: {connector_id}")
            logger.warning(f"   📊 State: {state}")
            logger.warning("")
        
        logger.warning("💡 To use a specific connector:")
        logger.warning("   1. Copy the ID from above")
        logger.warning("   2. Set CONFLUENCE_CONNECTOR_ID = 'your-connector-id'")
        logger.warning("   3. Set USE_CONFLUENCE_CONNECTOR = True")
        logger.warning("=" * 60)

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
        logger.warning(f"🔗 Starting search across ALL external connectors")
        logger.warning(f"   Query: '{query}' (top {top})")
        logger.warning(f"   Token length: {len(user_graph_token)} characters")
        
        # First, get all available connectors
        logger.warning("   Step 1: Listing all available external connectors...")
        try:
            connectors = await self._list_all_connectors(user_graph_token)
        except Exception as e:
            logger.error(f"   ❌ Failed to list connectors: {e}")
            logger.error("   This usually means missing ExternalConnection.Read.All permission")
            logger.warning("   Falling back to basic Graph API...")
            return await self._try_basic_graph_api(query, user_graph_token, top)
        
        if not connectors:
            logger.warning("   No external connectors found")
            logger.warning("   Possible reasons:")
            logger.warning("     1. No external connectors configured")
            logger.warning("     2. Missing Graph API permissions")
            logger.warning("     3. User doesn't have access to connectors")
            logger.warning("   Falling back to basic Graph API...")
            return await self._try_basic_graph_api(query, user_graph_token, top)
        
        logger.warning(f"   Found {len(connectors)} external connectors to search:")
        for i, connector in enumerate(connectors, 1):
            connector_name = connector.get("name", "Unknown")
            connector_id = connector.get("id", "No ID")
            connector_state = connector.get("state", "Unknown")
            logger.warning(f"     {i}. {connector_name} (ID: {connector_id}, State: {connector_state})")
        
        all_results = []
        per_connector_limit = max(1, top // len(connectors))  # Split the top limit across connectors
        logger.warning(f"   Step 2: Searching each connector (limit: {per_connector_limit} per connector)")
        
        # Search each connector
        for i, connector in enumerate(connectors, 1):
            connector_id = connector.get("id")
            connector_name = connector.get("name", "Unknown")
            
            try:
                logger.warning(f"   Searching connector {i}/{len(connectors)}: {connector_name}")
                logger.warning(f"     Connector ID: {connector_id}")
                
                connector_results = await self.search_confluence_content(
                    query=query,
                    confluence_connector_id=connector_id,
                    user_graph_token=user_graph_token,
                    top=per_connector_limit,
                    fields=fields
                )
                
                logger.warning(f"     ✅ Found {len(connector_results)} results in {connector_name}")
                
                # Add connector warning to results
                for result in connector_results:
                    if isinstance(result, dict):
                        result["connector_name"] = connector_name
                        result["connector_id"] = connector_id
                
                all_results.extend(connector_results)
                
                # Log sample results from this connector
                if connector_results:
                    for j, result in enumerate(connector_results[:2], 1):
                        title = result.get("title", "No title")
                        logger.warning(f"       Sample {j}: {title}")
                
            except Exception as e:
                logger.error(f"     ❌ Error searching connector {connector_name}: {e}")
                logger.error(f"       Error type: {type(e)}")
                # Continue with next connector instead of failing completely
                continue
        
        # Sort by rank and limit to top N
        logger.warning(f"   Step 3: Combining and sorting {len(all_results)} total results")
        
        if not all_results:
            logger.warning("   No results found across any external connectors")
            logger.warning("   Falling back to basic Graph API...")
            return await self._try_basic_graph_api(query, user_graph_token, top)
        
        all_results.sort(key=lambda x: x.get("rank", 0))
        final_results = all_results[:top]
        
        # Log final breakdown
        connector_breakdown = {}
        for result in final_results:
            connector_name = result.get("connector_name", "Unknown")
            connector_breakdown[connector_name] = connector_breakdown.get(connector_name, 0) + 1
        
        logger.warning(f"✅ Final results: {len(final_results)} from {len(connector_breakdown)} connectors")
        logger.warning(f"   Results by connector: {connector_breakdown}")
        
        return final_results

    async def _list_all_connectors(self, user_graph_token: str) -> List[dict]:
        """List all external connectors the user has access to"""
        logger.warning("📋 Listing all external connectors...")
        
        headers = {
            "Authorization": f"Bearer {user_graph_token}",
            "Content-Type": "application/json"
        }
        
        try:
            logger.warning("   Making API call to https://graph.microsoft.com/v1.0/external/connections")
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.microsoft.com/v1.0/external/connections",
                    headers=headers
                ) as response:
                    logger.warning(f"   API Response status: {response.status}")
                    
                    if response.status == 200:
                        data = await response.json()
                        connectors = data.get("value", [])
                        logger.warning(f"   ✅ Successfully retrieved {len(connectors)} connectors")
                        
                        # Log each connector's details
                        if connectors:
                            logger.warning("   Available connectors:")
                            for i, connector in enumerate(connectors, 1):
                                name = connector.get("name", "No name")
                                conn_id = connector.get("id", "No ID")
                                state = connector.get("state", "Unknown state")
                                description = connector.get("description", "No description")
                                logger.warning(f"     {i}. {name}")
                                logger.warning(f"        ID: {conn_id}")
                                logger.warning(f"        State: {state}")
                                if description != "No description":
                                    logger.warning(f"        Description: {description[:100]}...")
                        else:
                            logger.warning("   No connectors found in response")
                        
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