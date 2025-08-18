# attachment_api.py - Session-Based Storage
import aiohttp
import asyncio
import base64
import re
import uuid
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

# Session-based storage (use Redis/DB in production)
session_attachments: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}

# Session Management Functions
def get_session_id() -> str:
    """Get or create a session ID for attachments"""
    if 'attachment_session_id' not in session:
        session['attachment_session_id'] = str(uuid.uuid4())
        current_app.logger.info(f"🔧 Created new attachment session: {session['attachment_session_id']}")
    else:
        current_app.logger.info(f"🔧 Using existing attachment session: {session['attachment_session_id']}")
    
    return session['attachment_session_id']

def get_session_attachments(session_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get attachments for a session"""
    if session_id not in session_attachments:
        session_attachments[session_id] = {"jira_tickets": [], "confluence_pages": []}
        current_app.logger.info(f"🔧 Initialized empty attachments for session: {session_id}")
    return session_attachments[session_id]

def log_session_debug(session_id: str, action: str):
    """Debug helper to log session state"""
    attachments = session_attachments.get(session_id, {})
    current_app.logger.info(f"🔧 Session {session_id} - {action}: "
                           f"{len(attachments.get('jira_tickets', []))} JIRA, "
                           f"{len(attachments.get('confluence_pages', []))} Confluence")

# Helper Functions (unchanged)
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
    
    html = re.sub(r'<[^>]*>', '', html)
    html = html.replace('&nbsp;', ' ')
    html = html.replace('&amp;', '&')
    html = html.replace('&lt;', '<')
    html = html.replace('&gt;', '>')
    html = html.replace('&quot;', '"')
    html = html.replace('&#39;', "'")
    
    html = re.sub(r'\s+', ' ', html)
    html = re.sub(r'\n\s*\n', '\n', html)
    
    return html.strip()

# API Integration Functions (unchanged)
async def fetch_jira_ticket(ticket_key: str) -> Dict[str, Any]:
    """Fetch Jira ticket details from API"""
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
                elif response.status != 200:
                    raise Exception(f"Jira API error: {response.status}")
                
                data = await response.json()
                
                ticket_data = {
                    "id": data["id"],
                    "key": data["key"],
                    "summary": data["fields"]["summary"],
                    "description": extract_jira_description(data["fields"].get("description")),
                    "status": data["fields"]["status"]["name"] if data["fields"].get("status") else "Unknown",
                    "priority": data["fields"]["priority"]["name"] if data["fields"].get("priority") else "None",
                    "assignee": data["fields"]["assignee"]["displayName"] if data["fields"].get("assignee") else "Unassigned",
                    "reporter": data["fields"]["reporter"]["displayName"] if data["fields"].get("reporter") else "Unknown",
                    "created": data["fields"]["created"],
                    "updated": data["fields"]["updated"],
                    "issue_type": data["fields"]["issuetype"]["name"] if data["fields"].get("issuetype") else "Unknown",
                    "url": f"{JIRA_CONFIG['base_url']}/browse/{data['key']}"
                }
                
                current_app.logger.info(f"✅ Successfully fetched Jira ticket: {ticket_key}")
                return ticket_data
                
    except Exception as error:
        current_app.logger.error(f"❌ Failed to fetch Jira ticket {ticket_key}: {str(error)}")
        raise

async def fetch_confluence_page(page_url: str) -> Dict[str, Any]:
    """Fetch Confluence page content from API"""
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
                elif response.status != 200:
                    raise Exception(f"Confluence API error: {response.status}")
                
                data = await response.json()
                
                page_data = {
                    "id": data["id"],
                    "title": data["title"],
                    "space_key": data["space"]["key"] if data.get("space") else "Unknown",
                    "space_name": data["space"]["name"] if data.get("space") else "Unknown Space",
                    "content": strip_confluence_html(data.get("body", {}).get("storage", {}).get("value", "")),
                    "version": data.get("version", {}).get("number", 1),
                    "last_modified": data.get("version", {}).get("when"),
                    "url": page_url
                }
                
                current_app.logger.info(f"✅ Successfully fetched Confluence page: {data['title']}")
                return page_data
                
    except Exception as error:
        current_app.logger.error(f"❌ Failed to fetch Confluence page {page_url}: {str(error)}")
        raise

# API Routes - Updated for Session-Based Storage
@attachment_bp.route('/test', methods=['GET'])
async def test_attachment_system():
    """Test endpoint to check if attachment system is working"""
    session_id = get_session_id()
    session_attach = get_session_attachments(session_id)
    
    return jsonify({
        "message": "Session-based attachment system is working",
        "session_id": session_id,
        "jira_config_set": bool(JIRA_CONFIG.get("api_token", "").startswith("ATATT")),
        "confluence_config_set": bool(CONFLUENCE_CONFIG.get("api_token", "").startswith("ATATT")),
        "current_attachments": {
            "jira_tickets": len(session_attach["jira_tickets"]),
            "confluence_pages": len(session_attach["confluence_pages"])
        }
    })

@attachment_bp.route('/jira', methods=['POST'])
async def add_jira_ticket():
    """Add a Jira ticket attachment"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        ticket_key = request_json.get("ticketKey")
        session_id = get_session_id()
        
        if not ticket_key:
            return jsonify({"error": "ticketKey is required"}), 400
        
        current_app.logger.info(f"Processing Jira ticket: {ticket_key} for session: {session_id}")
        
        # Fetch full ticket data from Jira API
        ticket_data = await fetch_jira_ticket(ticket_key)
        
        session_attach = get_session_attachments(session_id)
        
        # Check if already exists
        if any(t["key"] == ticket_data["key"] for t in session_attach["jira_tickets"]):
            return jsonify({"error": "Ticket already attached"}), 409
        
        # Store the complete ticket data
        processed_ticket = {
            "kind": "jira_ticket",
            "key": ticket_data["key"],
            "id": ticket_data["id"],
            "summary": ticket_data["summary"],
            "url": ticket_data["url"],
            "description": ticket_data["description"],
            "status": ticket_data["status"],
            "priority": ticket_data["priority"],
            "assignee": ticket_data["assignee"],
            "reporter": ticket_data["reporter"],
            "issue_type": ticket_data["issue_type"],
            "created": ticket_data["created"],
            "updated": ticket_data["updated"],
            "added_at": str(asyncio.get_event_loop().time())
        }
        
        session_attach["jira_tickets"].append(processed_ticket)
        log_session_debug(session_id, "Added JIRA ticket")
        
        current_app.logger.info(f"Successfully added Jira ticket: {ticket_key}")
        
        return jsonify({
            "success": True,
            "ticket": processed_ticket,
            "session_id": session_id,
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
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
        session_id = get_session_id()
        
        if not page_url:
            return jsonify({"error": "pageUrl is required"}), 400
        
        # Validate URL format
        try:
            urlparse(page_url)
        except Exception:
            return jsonify({"error": "Invalid URL format"}), 400
        
        current_app.logger.info(f"Processing Confluence page: {page_url} for session: {session_id}")
        
        # Fetch full page data from Confluence API
        page_data = await fetch_confluence_page(page_url)
        
        session_attach = get_session_attachments(session_id)
        
        # Check if already exists
        if any(p["url"] == page_url for p in session_attach["confluence_pages"]):
            return jsonify({"error": "Page already attached"}), 409
        
        # Store the complete page data
        processed_page = {
            "kind": "confluence_page",
            "url": page_url,
            "id": page_data["id"],
            "title": title or page_data["title"],
            "space_key": page_data["space_key"],
            "space_name": page_data["space_name"],
            "content": page_data["content"],
            "version": page_data["version"],
            "last_modified": page_data["last_modified"],
            "added_at": str(asyncio.get_event_loop().time())
        }
        
        session_attach["confluence_pages"].append(processed_page)
        log_session_debug(session_id, "Added Confluence page")
        
        current_app.logger.info(f"Successfully added Confluence page: {page_data['title']}")
        
        return jsonify({
            "success": True,
            "page": processed_page,
            "session_id": session_id,
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to add Confluence page: {str(error)}")
        return jsonify({"error": str(error)}), 500

@attachment_bp.route('/jira/<ticket_key>', methods=['DELETE'])
async def remove_jira_ticket(ticket_key: str):
    """Remove a Jira ticket attachment"""
    try:
        session_id = get_session_id()
        session_attach = get_session_attachments(session_id)
        
        initial_length = len(session_attach["jira_tickets"])
        session_attach["jira_tickets"] = [t for t in session_attach["jira_tickets"] if t["key"] != ticket_key]
        
        if len(session_attach["jira_tickets"]) == initial_length:
            return jsonify({"error": "Ticket not found in attachments"}), 404
        
        log_session_debug(session_id, "Removed JIRA ticket")
        
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
    """Remove a Confluence page attachment using request body"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        page_url = request_json.get("pageUrl")
        
        if not page_url:
            return jsonify({"error": "pageUrl is required"}), 400
            
        session_id = get_session_id()
        
        current_app.logger.info(f"Removing Confluence page: {page_url} for session: {session_id}")
        
        session_attach = get_session_attachments(session_id)
        
        initial_length = len(session_attach["confluence_pages"])
        session_attach["confluence_pages"] = [p for p in session_attach["confluence_pages"] if p["url"] != page_url]
        
        if len(session_attach["confluence_pages"]) == initial_length:
            return jsonify({"error": "Page not found in attachments"}), 404
        
        log_session_debug(session_id, "Removed Confluence page")
        current_app.logger.info(f"Successfully removed Confluence page: {page_url}")
        
        return jsonify({
            "success": True,
            "session_id": session_id,
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to remove Confluence page: {str(error)}")
        return jsonify({"error": "Failed to remove page"}), 500

@attachment_bp.route('/', methods=['GET'])
async def get_session_attachments_endpoint():
    """Get all session attachments"""
    try:
        session_id = get_session_id()
        session_attach = get_session_attachments(session_id)
        
        return jsonify({
            "session_id": session_id,
            "jira_tickets": session_attach["jira_tickets"],
            "confluence_pages": session_attach["confluence_pages"],
            "total_attachments": len(session_attach["jira_tickets"]) + len(session_attach["confluence_pages"])
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to get attachments: {str(error)}")
        return jsonify({"error": "Failed to get attachments"}), 500

@attachment_bp.route('/all', methods=['DELETE'])
async def clear_all_attachments():
    """Clear all attachments for current session"""
    try:
        session_id = get_session_id()
        session_attachments[session_id] = {"jira_tickets": [], "confluence_pages": []}
        log_session_debug(session_id, "Cleared all attachments")
        
        return jsonify({
            "success": True, 
            "session_id": session_id,
            "total_attachments": 0
        })
        
    except Exception as error:
        current_app.logger.error(f"Failed to clear attachments: {str(error)}")
        return jsonify({"error": "Failed to clear attachments"}), 500

@attachment_bp.route('/debug', methods=['GET'])
async def debug_session_storage():
    """Debug endpoint to see all session storage"""
    session_id = get_session_id()
    
    return jsonify({
        "current_session_id": session_id,
        "all_sessions": list(session_attachments.keys()),
        "current_session_attachments": session_attachments.get(session_id, {}),
        "total_sessions": len(session_attachments)
    })

# Utility function for chat integration - Updated for session-based storage
def get_session_attachments_for_chat(session_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get session attachments for chat context (exported function)"""
    return get_session_attachments(session_id)