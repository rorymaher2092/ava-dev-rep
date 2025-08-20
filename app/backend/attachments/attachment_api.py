# attachment_api.py - Fixed Session Storage
import aiohttp
import asyncio
import base64
import re
import uuid
import json
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse
from quart import Blueprint, jsonify, current_app, request, session
from decorators import authenticated

attachment_bp = Blueprint('attachments', __name__, url_prefix='/api/attachments')

# Configuration - Replace with your actual values
JIRA_CONFIG = {
    "base_url": "https://vocus.atlassian.net",
    "api_token": "REDACTED_TOKEN",
    "email": "svc.atlassian@vocus.com.au"
}

CONFLUENCE_CONFIG = {
    "base_url": "https://vocus.atlassian.net/wiki",
    "api_token": "REDACTED_TOKEN",
    "email": "svc.atlassian@vocus.com.au"
}

# Session Management Functions
def get_or_create_session_id() -> str:
    """Get or create a session ID for attachments"""
    if 'attachment_session_id' not in session:
        session['attachment_session_id'] = str(uuid.uuid4())
        session.permanent = True  # Make session persistent
        current_app.logger.info(f"🔧 Created new attachment session: {session['attachment_session_id']}")
    return session['attachment_session_id']

def get_session_attachments() -> Dict[str, List[Dict[str, Any]]]:
    """Get attachments from session storage"""
    # Store attachments directly in the session, not in memory
    if 'attachments_data' not in session:
        session['attachments_data'] = {
            "jira_tickets": [],
            "confluence_pages": [],
            "last_accessed": asyncio.get_event_loop().time()
        }
        current_app.logger.info(f"🔧 Initialized empty attachments in session")
    
    # Update last accessed time
    session['attachments_data']['last_accessed'] = asyncio.get_event_loop().time()
    session.modified = True  # Mark session as modified
    
    return {
        "jira_tickets": session['attachments_data'].get("jira_tickets", []),
        "confluence_pages": session['attachments_data'].get("confluence_pages", [])
    }

def add_jira_ticket_to_session(ticket_data: Dict[str, Any]) -> None:
    """Add a JIRA ticket to session storage"""
    attachments = get_session_attachments()
    
    # Check if already exists
    if not any(t["key"] == ticket_data["key"] for t in attachments["jira_tickets"]):
        if 'attachments_data' not in session:
            session['attachments_data'] = {"jira_tickets": [], "confluence_pages": []}
        
        session['attachments_data']['jira_tickets'].append(ticket_data)
        session.modified = True
        current_app.logger.info(f"✅ Added JIRA ticket {ticket_data['key']} to session")

def add_confluence_page_to_session(page_data: Dict[str, Any]) -> None:
    """Add a Confluence page to session storage"""
    attachments = get_session_attachments()
    
    # Check if already exists
    if not any(p["url"] == page_data["url"] for p in attachments["confluence_pages"]):
        if 'attachments_data' not in session:
            session['attachments_data'] = {"jira_tickets": [], "confluence_pages": []}
        
        session['attachments_data']['confluence_pages'].append(page_data)
        session.modified = True
        current_app.logger.info(f"✅ Added Confluence page {page_data['title']} to session")

def remove_jira_ticket_from_session(ticket_key: str) -> bool:
    """Remove a JIRA ticket from session storage"""
    if 'attachments_data' in session:
        original_length = len(session['attachments_data'].get('jira_tickets', []))
        session['attachments_data']['jira_tickets'] = [
            t for t in session['attachments_data']['jira_tickets'] 
            if t["key"] != ticket_key
        ]
        session.modified = True
        return len(session['attachments_data']['jira_tickets']) < original_length
    return False

def remove_confluence_page_from_session(page_url: str) -> bool:
    """Remove a Confluence page from session storage"""
    if 'attachments_data' in session:
        original_length = len(session['attachments_data'].get('confluence_pages', []))
        session['attachments_data']['confluence_pages'] = [
            p for p in session['attachments_data']['confluence_pages'] 
            if p["url"] != page_url
        ]
        session.modified = True
        return len(session['attachments_data']['confluence_pages']) < original_length
    return False

def clear_session_attachments() -> None:
    """Clear all attachments from session"""
    if 'attachments_data' in session:
        session['attachments_data'] = {
            "jira_tickets": [],
            "confluence_pages": [],
            "last_accessed": asyncio.get_event_loop().time()
        }
        session.modified = True
        current_app.logger.info("🗑️ Cleared all attachments from session")

# Helper Functions (unchanged from your original)
def extract_jira_description(description: Any) -> str:
    """Extract clean text from Jira description (handles ADF format)"""
    if not description:
        return "No description"
    
    if isinstance(description, dict) and "content" in description:
        return extract_text_from_adf(description["content"])
    
    if isinstance(description, str):
        return description.strip()
    
    return "No description"

def extract_text_from_adf(content: List[Dict[str, Any]]) -> str:
    """Extract text from Atlassian Document Format (ADF)"""
    text = ""
    
    def traverse(nodes):
        nonlocal text
        for node in nodes:
            if node.get("type") == "text":
                text += node.get("text", "")
            elif node.get("type") == "hardBreak":
                text += "\n"
            elif "content" in node:
                traverse(node["content"])
            
            if node.get("type") == "paragraph":
                text += "\n"
    
    traverse(content)
    return text.strip()

def extract_confluence_page_id(page_url: str) -> Optional[str]:
    """Extract page ID from Confluence URL"""
    patterns = [
        r'/pages/(\d+)',
        r'pageId[=:](\d+)',
        r'/(\d+)/[^/]*$'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, page_url)
        if match:
            return match.group(1)
    
    return None

def strip_confluence_html(html: str) -> str:
    """Strip HTML and clean up Confluence content"""
    if not html:
        return ""
    
    # Remove HTML tags
    html = re.sub(r'<[^>]*>', '', html)
    
    # Decode HTML entities
    html = html.replace('&nbsp;', ' ')
    html = html.replace('&amp;', '&')
    html = html.replace('&lt;', '<')
    html = html.replace('&gt;', '>')
    html = html.replace('&quot;', '"')
    html = html.replace('&#39;', "'")
    
    # Clean up whitespace
    html = re.sub(r'\s+', ' ', html)
    html = re.sub(r'\n\s*\n', '\n', html)
    
    return html.strip()

# API Integration Functions (unchanged)
async def fetch_jira_ticket(ticket_key: str) -> Dict[str, Any]:
    """Fetch Jira ticket details from API with better error handling"""
    try:
        current_app.logger.info(f"Fetching Jira ticket: {ticket_key}")
        
        auth_string = f"{JIRA_CONFIG['email']}:{JIRA_CONFIG['api_token']}"
        auth_bytes = auth_string.encode('ascii')
        auth_header = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
        
        url = f"{JIRA_CONFIG['base_url']}/rest/api/3/issue/{ticket_key}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 404:
                    raise Exception(f"Jira ticket {ticket_key} not found")
                elif response.status == 403:
                    raise Exception(f"Access denied to Jira ticket {ticket_key}")
                elif response.status == 401:
                    raise Exception("Authentication failed - check API token")
                elif response.status != 200:
                    text = await response.text()
                    raise Exception(f"Jira API error {response.status}: {text}")
                
                data = await response.json()
                
                # Extract fields safely
                fields = data.get("fields", {})
                
                ticket_data = {
                    "id": data["id"],
                    "key": data["key"],
                    "summary": fields.get("summary", "No summary"),
                    "description": extract_jira_description(fields.get("description")),
                    "status": fields.get("status", {}).get("name", "Unknown"),
                    "priority": fields.get("priority", {}).get("name", "None") if fields.get("priority") else "None",
                    "assignee": fields.get("assignee", {}).get("displayName", "Unassigned") if fields.get("assignee") else "Unassigned",
                    "reporter": fields.get("reporter", {}).get("displayName", "Unknown") if fields.get("reporter") else "Unknown",
                    "created": fields.get("created"),
                    "updated": fields.get("updated"),
                    "issue_type": fields.get("issuetype", {}).get("name", "Unknown") if fields.get("issuetype") else "Unknown",
                    "url": f"{JIRA_CONFIG['base_url']}/browse/{data['key']}"
                }
                
                current_app.logger.info(f"✅ Successfully fetched Jira ticket: {ticket_key}")
                return ticket_data
                
    except Exception as error:
        current_app.logger.error(f"❌ Failed to fetch Jira ticket {ticket_key}: {str(error)}")
        raise

async def fetch_confluence_page(page_url: str) -> Dict[str, Any]:
    """Fetch Confluence page content from API with better error handling"""
    try:
        current_app.logger.info(f"Fetching Confluence page: {page_url}")
        
        page_id = extract_confluence_page_id(page_url)
        if not page_id:
            raise Exception("Could not extract page ID from URL. Please check the URL format.")
        
        auth_string = f"{CONFLUENCE_CONFIG['email']}:{CONFLUENCE_CONFIG['api_token']}"
        auth_bytes = auth_string.encode('ascii')
        auth_header = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
        
        url = f"{CONFLUENCE_CONFIG['base_url']}/rest/api/content/{page_id}?expand=body.storage,space,version"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status == 404:
                    raise Exception("Confluence page not found")
                elif response.status == 403:
                    raise Exception("Access denied to Confluence page")
                elif response.status == 401:
                    raise Exception("Authentication failed - check API token")
                elif response.status != 200:
                    text = await response.text()
                    raise Exception(f"Confluence API error {response.status}: {text}")
                
                data = await response.json()
                
                page_data = {
                    "id": data["id"],
                    "title": data.get("title", "Untitled"),
                    "space_key": data.get("space", {}).get("key", "Unknown"),
                    "space_name": data.get("space", {}).get("name", "Unknown Space"),
                    "content": strip_confluence_html(data.get("body", {}).get("storage", {}).get("value", "")),
                    "version": data.get("version", {}).get("number", 1),
                    "last_modified": data.get("version", {}).get("when"),
                    "url": page_url
                }
                
                current_app.logger.info(f"✅ Successfully fetched Confluence page: {data.get('title', 'Unknown')}")
                return page_data
                
    except Exception as error:
        current_app.logger.error(f"❌ Failed to fetch Confluence page {page_url}: {str(error)}")
        raise

# API Routes
@attachment_bp.route('/test', methods=['GET'])
async def test_attachment_system():
    """Test endpoint to check if attachment system is working"""
    session_id = get_or_create_session_id()
    session_attach = get_session_attachments()
    
    return jsonify({
        "message": "Session-based attachment system is working",
        "session_id": session_id,
        "jira_config_set": bool(JIRA_CONFIG.get("api_token") and JIRA_CONFIG["api_token"] != "your-token-here"),
        "confluence_config_set": bool(CONFLUENCE_CONFIG.get("api_token") and CONFLUENCE_CONFIG["api_token"] != "your-token-here"),
        "current_attachments": {
            "jira_tickets": len(session_attach["jira_tickets"]),
            "confluence_pages": len(session_attach["confluence_pages"])
        }
    })

@attachment_bp.route('/', methods=['GET'])
async def get_attachments():
    """Get all attachments for current session"""
    try:
        session_id = get_or_create_session_id()
        session_attach = get_session_attachments()
        
        # Debug logging
        current_app.logger.info(f"📋 Getting attachments for session: {session_id}")
        current_app.logger.info(f"📋 Session data: {json.dumps(session_attach, default=str)}")
        
        return jsonify({
            "session_id": session_id,
            "jira_tickets": session_attach["jira_tickets"],
            "confluence_pages": session_attach["confluence_pages"],
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to get attachments: {str(error)}")
        return jsonify({"error": "Failed to get attachments"}), 500

@attachment_bp.route('/jira', methods=['POST'])
async def add_jira_ticket():
    """Add a Jira ticket attachment"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        ticket_key = request_json.get("ticketKey")
        session_id = get_or_create_session_id()
        
        if not ticket_key:
            return jsonify({"error": "ticketKey is required"}), 400
        
        # Normalize ticket key (uppercase)
        ticket_key = ticket_key.strip().upper()
        
        current_app.logger.info(f"Processing Jira ticket: {ticket_key} for session: {session_id}")
        
        # Get current attachments
        session_attach = get_session_attachments()
        
        # Check if already exists
        if any(t["key"] == ticket_key for t in session_attach["jira_tickets"]):
            return jsonify({"error": f"Ticket {ticket_key} already attached"}), 409
        
        # Fetch full ticket data from Jira API
        ticket_data = await fetch_jira_ticket(ticket_key)
        
        # Add metadata
        ticket_data["added_at"] = asyncio.get_event_loop().time()
        
        # Store the ticket in session
        add_jira_ticket_to_session(ticket_data)
        
        current_app.logger.info(f"Successfully added Jira ticket: {ticket_key} to session {session_id}")
        
        # Get updated count
        updated_attach = get_session_attachments()
        
        return jsonify({
            "success": True,
            "ticket": ticket_data,
            "session_id": session_id,
            "total_attachments": len(updated_attach["jira_tickets"]) + len(updated_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to add Jira ticket: {str(error)}")
        return jsonify({"error": str(error)}), 500

@attachment_bp.route('/confluence', methods=['POST'])
async def add_confluence_page():
    """Add a Confluence page attachment"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        page_url = request_json.get("pageUrl")
        title = request_json.get("title")
        session_id = get_or_create_session_id()
        
        if not page_url:
            return jsonify({"error": "pageUrl is required"}), 400
        
        # Validate URL format
        try:
            urlparse(page_url)
        except Exception:
            return jsonify({"error": "Invalid URL format"}), 400
        
        current_app.logger.info(f"Processing Confluence page: {page_url} for session: {session_id}")
        
        # Get current attachments
        session_attach = get_session_attachments()
        
        # Check if already exists
        if any(p["url"] == page_url for p in session_attach["confluence_pages"]):
            return jsonify({"error": "Page already attached"}), 409
        
        # Fetch full page data from Confluence API
        page_data = await fetch_confluence_page(page_url)
        
        # Override title if provided
        if title:
            page_data["title"] = title
        
        # Add metadata
        page_data["added_at"] = asyncio.get_event_loop().time()
        
        # Store the page in session
        add_confluence_page_to_session(page_data)
        
        current_app.logger.info(f"Successfully added Confluence page: {page_data['title']} to session {session_id}")
        
        # Get updated count
        updated_attach = get_session_attachments()
        
        return jsonify({
            "success": True,
            "page": page_data,
            "session_id": session_id,
            "total_attachments": len(updated_attach["jira_tickets"]) + len(updated_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to add Confluence page: {str(error)}")
        return jsonify({"error": str(error)}), 500

@attachment_bp.route('/jira/<ticket_key>', methods=['DELETE'])
async def remove_jira_ticket(ticket_key: str):
    """Remove a Jira ticket attachment"""
    try:
        session_id = get_or_create_session_id()
        
        # Normalize ticket key
        ticket_key = ticket_key.strip().upper()
        
        success = remove_jira_ticket_from_session(ticket_key)
        
        if not success:
            return jsonify({"error": f"Ticket {ticket_key} not found in attachments"}), 404
        
        current_app.logger.info(f"Removed Jira ticket {ticket_key} from session {session_id}")
        
        session_attach = get_session_attachments()
        return jsonify({
            "success": True,
            "session_id": session_id,
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to remove Jira ticket: {str(error)}")
        return jsonify({"error": "Failed to remove ticket"}), 500

@attachment_bp.route('/confluence', methods=['DELETE'])
async def remove_confluence_page():
    """Remove a Confluence page attachment"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        page_url = request_json.get("pageUrl")
        
        if not page_url:
            return jsonify({"error": "pageUrl is required"}), 400
        
        session_id = get_or_create_session_id()
        
        current_app.logger.info(f"Removing Confluence page: {page_url} for session: {session_id}")
        
        success = remove_confluence_page_from_session(page_url)
        
        if not success:
            return jsonify({"error": "Page not found in attachments"}), 404
        
        current_app.logger.info(f"Removed Confluence page from session {session_id}")
        
        session_attach = get_session_attachments()
        return jsonify({
            "success": True,
            "session_id": session_id,
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to remove Confluence page: {str(error)}")
        return jsonify({"error": "Failed to remove page"}), 500

@attachment_bp.route('/all', methods=['DELETE'])
async def clear_all_attachments():
    """Clear all attachments for current session"""
    try:
        session_id = get_or_create_session_id()
        
        clear_session_attachments()
        
        current_app.logger.info(f"Cleared all attachments for session {session_id}")
        
        return jsonify({
            "success": True,
            "session_id": session_id,
            "total_attachments": 0
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to clear attachments: {str(error)}")
        return jsonify({"error": "Failed to clear attachments"}), 500

# Export function for chat integration
def get_session_attachments_for_chat(session_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get session attachments for chat context (exported function)"""
    # This function is called from attachment_helpers.py
    # We ignore the passed session_id and use the current session
    return get_session_attachments()

def clear_session_attachments_for_chat(session_id: str) -> bool:
    """Clear attachments for chat (exported function)"""
    try:
        clear_session_attachments()
        return True
    except Exception as e:
        current_app.logger.error(f"Error clearing attachments: {str(e)}")
        return False