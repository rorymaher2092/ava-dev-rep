# simple_attachment_helper.py - Just-in-time attachment fetching
import aiohttp
import base64
import re
import os
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse
from quart import current_app
import dateutil.parser
from datetime import datetime
from attachments.direct_attachment_storage import attachment_storage
# Configuration from environment variables
JIRA_CONFIG = {
    "base_url": os.getenv("JIRA_BASE_URL", "https://vocus.atlassian.net"),
    "api_token": os.getenv("JIRA_API_TOKEN"),
    "email": os.getenv("JIRA_EMAIL")
}

CONFLUENCE_CONFIG = {
    "base_url": os.getenv("CONFLUENCE_BASE_URL", "https://vocus.atlassian.net/wiki"),
    "api_token": os.getenv("CONFLUENCE_API_TOKEN"),
    "email": os.getenv("CONFLUENCE_EMAIL")
}

def extract_jira_ticket_key(input_str: str) -> str:
    """Extract ticket key from Jira URL or return the input if it's already a key"""
    input_str = input_str.strip()
    
    # If it contains /browse/, extract the ticket key from URL
    if "/browse/" in input_str:
        try:
            # Extract everything after /browse/ and before any query parameters
            browse_part = input_str.split("/browse/")[1]
            ticket_key = browse_part.split("?")[0].split("#")[0]
            return ticket_key.upper()
        except (IndexError, AttributeError):
            pass
    
    # Return as-is if it's already a ticket key format
    return input_str.upper()

# ADD this new function to handle document sources
async def fetch_document_source(doc_ref: Dict[str, Any]) -> Optional[str]:
    """Fetch document from blob storage and format as source"""
    try:
        from attachments.sas_storage import sas_storage
        from attachments.document_attachment_api import extract_text_from_file_data
        
        # Get content from blob
        blob_path = doc_ref.get("blob_path")
        if not blob_path:
            current_app.logger.error(f"No blob_path in doc_ref: {doc_ref}")
            return None
            
        current_app.logger.info(f"Fetching document from blob: {blob_path}")
        file_data = await sas_storage.get_attachment_content(blob_path)
        
        # Extract text content
        content = await extract_text_from_file_data(
            file_data,
            doc_ref.get("fileType", ".txt"),
            doc_ref.get("filename", "document")
        )
        
        # Format as source
        source = f"""[DOCUMENT: {doc_ref.get('filename', 'Unknown')}]
Type: {doc_ref.get('fileType', 'Unknown')}
Size: {doc_ref.get('size', 0)} bytes
Uploaded: {doc_ref.get('uploaded_at', 'Unknown')}

Content:
{content}"""
        
        return source
        
    except Exception as e:
        current_app.logger.error(f"Error fetching document: {str(e)}")
        return None

async def fetch_attachments_for_chat(attachment_refs: List[Dict[str, Any]]) -> List[str]:
    """
    Fetch attachment content fresh for chat context.
    
    Args:
        attachment_refs: List of attachment references like:
        [
            {"type": "jira", "key": "PROJ-123"},
            {"type": "confluence", "url": "https://...", "title": "Page Title"},
            {"type": "document", "id": "uuid", "filename": "file.pdf", "blob_path": "uploads/..."}  # NEW
        ]
    
    Returns:
        List of formatted attachment sources ready for prompt inclusion
    """
    if not attachment_refs:
        return []
    
    current_app.logger.info(f"Fetching {len(attachment_refs)} attachments for chat")
    
    attachment_sources = []
    
    for ref in attachment_refs:
        try:
            if ref.get("type") == "jira" and ref.get("key"):
                source = await fetch_jira_ticket_source(ref["key"])
                if source:
                    attachment_sources.append(source)
                    current_app.logger.info(f"Fetched JIRA ticket: {ref['key']}")
            
            elif ref.get("type") == "confluence" and ref.get("url"):
                source = await fetch_confluence_page_source(ref["url"])
                if source:
                    attachment_sources.append(source)
                    current_app.logger.info(f"Fetched Confluence page: {ref.get('title', ref['url'])}")
            
            # ADD this new elif block for documents
            elif ref.get("type") == "document" and ref.get("id"):
                source = await fetch_document_source(ref)
                if source:
                    attachment_sources.append(source)
                    current_app.logger.info(f"Fetched document: {ref.get('filename', 'Unknown')}")
            
            else:
                current_app.logger.warning(f"Invalid attachment reference: {ref}")
                
        except Exception as e:
            current_app.logger.error(f"Failed to fetch attachment {ref}: {str(e)}")
            # Continue with other attachments even if one fails
            continue
    
    current_app.logger.info(f"Successfully fetched {len(attachment_sources)} attachment sources")
    return attachment_sources

async def validate_document(doc_id: str, blob_path: str) -> Dict[str, Any]:
    """
    Validate that a document exists in blob storage.
    Returns basic info for UI display without fetching full content.
    """
    try:
        from attachments.sas_storage import sas_storage
        
        # Just check if blob exists
        blob_url = sas_storage.get_blob_url(blob_path)
        
        return {
            "valid": True,
            "id": doc_id,
            "blob_path": blob_path,
            "url": blob_url
        }
    except Exception as e:
        return {"valid": False, "error": str(e)}

async def fetch_jira_ticket_source(ticket_key: str) -> Optional[str]:
    """Fetch a single JIRA ticket and format as source"""
    try:
        ticket_data = await fetch_jira_ticket_data(ticket_key)
        if not ticket_data:
            return None
        
        ticket_age = get_time_ago(ticket_data.get("updated") or ticket_data.get("created"))
        
        # Build source with core fields
        source_parts = [
            f"[JIRA TICKET: {ticket_data['key']}]",
            f"Title: {ticket_data['summary']}",
            f"Status: {ticket_data['status']} | Priority: {ticket_data['priority']} | Type: {ticket_data['issue_type']}",
            f"Assignee: {ticket_data['assignee']} | Reporter: {ticket_data['reporter']}",
            f"Last Updated: {ticket_age}",
            f"URL: {ticket_data['url']}",
            "",
            "Description:",
            format_content_for_prompt(ticket_data['description'])
        ]
        
        # Add custom fields if present
        custom_fields = ticket_data.get('custom_fields', {})
        if custom_fields:
            source_parts.append("\nCustom Fields:")
            for field_name, field_value in custom_fields.items():
                if isinstance(field_value, (list, dict)):
                    field_value = str(field_value)
                source_parts.append(f"{field_name}: {field_value}")
        
        return "\n".join(source_parts)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching JIRA ticket {ticket_key}: {str(e)}")
        return None

async def fetch_confluence_page_source(page_url: str) -> Optional[str]:
    """Fetch a single Confluence page and format as source"""
    try:
        page_data = await fetch_confluence_page_data(page_url)
        if not page_data:
            return None
        
        page_age = get_time_ago(page_data.get("last_modified"))
        
        # Format as a single source string
        source = f"""[CONFLUENCE PAGE: {page_data['title']}]
Space: {page_data['space_name']} ({page_data['space_key']})
Version: {page_data['version']} | Last Modified: {page_age}
URL: {page_data['url']}

Content:
{format_content_for_prompt(page_data['content'], max_length=2500)}"""
        
        return source
        
    except Exception as e:
        current_app.logger.error(f"Error fetching Confluence page {page_url}: {str(e)}")
        return None

# Validation functions for UI (lightweight checks)
async def validate_jira_ticket(ticket_input: str) -> Dict[str, Any]:
    """
    Validate that a JIRA ticket exists and is accessible.
    Accepts either a ticket key or full Jira URL.
    Returns basic info for UI display without fetching full content.
    """
    try:
        # Extract ticket key from URL or use as-is
        ticket_key = extract_jira_ticket_key(ticket_input)
        
        # Just fetch basic fields for validation
        auth_string = f"{JIRA_CONFIG['email']}:{JIRA_CONFIG['api_token']}"
        auth_bytes = auth_string.encode('ascii')
        auth_header = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Accept': 'application/json',
        }
        
        # Only fetch key fields for validation
        url = f"{JIRA_CONFIG['base_url']}/rest/api/3/issue/{ticket_key}?fields=key,summary,status,priority"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    data = await response.json()
                    fields = data.get("fields", {})
                    return {
                        "valid": True,
                        "key": data["key"],
                        "summary": fields.get("summary", "No summary"),
                        "status": fields.get("status", {}).get("name", "Unknown"),
                        "priority": fields.get("priority", {}).get("name", "None") if fields.get("priority") else "None",
                        "url": f"{JIRA_CONFIG['base_url']}/browse/{data['key']}"
                    }
                else:
                    return {"valid": False, "error": f"Ticket not found or inaccessible (status: {response.status})"}
    
    except Exception as e:
        return {"valid": False, "error": str(e)}

async def validate_confluence_page(page_url: str) -> Dict[str, Any]:
    """
    Validate that a Confluence page exists and is accessible.
    Returns basic info for UI display without fetching full content.
    """
    try:
        page_id = extract_confluence_page_id(page_url)
        if not page_id:
            return {"valid": False, "error": "Could not extract page ID from URL"}
        
        auth_string = f"{CONFLUENCE_CONFIG['email']}:{CONFLUENCE_CONFIG['api_token']}"
        auth_bytes = auth_string.encode('ascii')
        auth_header = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Accept': 'application/json',
        }
        
        # Only fetch basic fields for validation
        url = f"{CONFLUENCE_CONFIG['base_url']}/rest/api/content/{page_id}?expand=space,version"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        "valid": True,
                        "title": data.get("title", "Untitled"),
                        "space_key": data.get("space", {}).get("key", "Unknown"),
                        "space_name": data.get("space", {}).get("name", "Unknown Space"),
                        "version": data.get("version", {}).get("number", 1),
                        "url": page_url
                    }
                else:
                    return {"valid": False, "error": f"Page not found or inaccessible (status: {response.status})"}
    
    except Exception as e:
        return {"valid": False, "error": str(e)}

# Full data fetching functions (used by fetch_*_source functions)
async def fetch_jira_ticket_data(ticket_key: str) -> Dict[str, Any]:
    """Fetch full JIRA ticket data with all fields"""
    auth_string = f"{JIRA_CONFIG['email']}:{JIRA_CONFIG['api_token']}"
    auth_bytes = auth_string.encode('ascii')
    auth_header = base64.b64encode(auth_bytes).decode('ascii')
    
    headers = {
        'Authorization': f'Basic {auth_header}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    # Fetch navigable fields with field names (cleaner than *all)
    url = f"{JIRA_CONFIG['base_url']}/rest/api/3/issue/{ticket_key}?fields=*navigable&expand=names"
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status != 200:
                raise Exception(f"JIRA API error {response.status}")
            
            data = await response.json()
            fields = data.get("fields", {})
            names = data.get("names", {})
            
            # Clean and normalize all fields
            cleaned_fields = clean_jira_fields(fields, names)
            
            return {
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
                "url": f"{JIRA_CONFIG['base_url']}/browse/{data['key']}",
                "custom_fields": cleaned_fields
            }

async def fetch_confluence_page_data(page_url: str) -> Dict[str, Any]:
    """Fetch full Confluence page data"""
    page_id = extract_confluence_page_id(page_url)
    if not page_id:
        raise Exception("Could not extract page ID from URL")
    
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
            if response.status != 200:
                raise Exception(f"Confluence API error {response.status}")
            
            data = await response.json()
            
            return {
                "id": data["id"],
                "title": data.get("title", "Untitled"),
                "space_key": data.get("space", {}).get("key", "Unknown"),
                "space_name": data.get("space", {}).get("name", "Unknown Space"),
                "content": strip_confluence_html(data.get("body", {}).get("storage", {}).get("value", "")),
                "version": data.get("version", {}).get("number", 1),
                "last_modified": data.get("version", {}).get("when"),
                "url": page_url
            }

# Helper functions (same as before)
def clean_jira_fields(fields: Dict[str, Any], names: Dict[str, str]) -> Dict[str, Any]:
    """Clean and normalize Jira fields, removing empties and formatting content"""
    cleaned = {}
    
    # Skip these standard fields (already handled separately)
    skip_fields = {
        'summary', 'description', 'status', 'priority', 'assignee', 'reporter', 
        'created', 'updated', 'issuetype', 'project', 'creator', 'watches',
        'votes', 'worklog', 'attachment', 'comment', 'issuelinks', 'subtasks'
    }
    
    for field_id, value in fields.items():
        if field_id in skip_fields or not value:
            continue
            
        # Get human-readable name
        field_name = names.get(field_id, field_id)
        
        # Clean the value
        cleaned_value = clean_field_value(value)
        if cleaned_value:
            cleaned[field_name] = cleaned_value
    
    return cleaned

def clean_field_value(value: Any) -> Any:
    """Clean individual field values"""
    if value is None or value == "" or value == []:
        return None
    
    # Jira-specific empty values
    if isinstance(value, (int, float)) and value == -1:  # workratio, etc.
        return None
    if isinstance(value, dict) and value.keys() == {"progress", "total"} and value["progress"] == value["total"] == 0:
        return None
        
    if isinstance(value, dict):
        if 'displayName' in value:
            return value['displayName']
        elif 'name' in value:
            return value['name']
        elif 'value' in value:
            return value['value']
        # For ADF content
        elif 'content' in value:
            return extract_text_from_adf(value.get('content', []))
    
    elif isinstance(value, list):
        if len(value) > 50:  # Limit arrays
            cleaned_list = [clean_field_value(item) for item in value[:50]]
            return cleaned_list + [f"... and {len(value) - 50} more"]
        else:
            return [clean_field_value(item) for item in value if item]
    
    elif isinstance(value, str) and len(value) > 8000:  # Cap long text
        return value[:8000] + "... [truncated]"
    
    return value

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

def format_content_for_prompt(content: str, max_length: int = 2000) -> str:
    """Format content for optimal prompt consumption"""
    if not content:
        return "[No content available]"
    
    # Clean up the content
    content = content.strip()
    
    # Truncate if too long, but try to break at sentence boundaries
    if len(content) > max_length:
        truncated = content[:max_length]
        
        # Try to find last sentence boundary
        last_period = truncated.rfind('.')
        last_newline = truncated.rfind('\n')
        
        if last_period > max_length * 0.8:  # If we can cut at a sentence that's not too short
            content = truncated[:last_period + 1]
        elif last_newline > max_length * 0.8:  # Otherwise try paragraph boundary
            content = truncated[:last_newline]
        else:
            content = truncated
        
        content += "\n\n[Content truncated - see full content at source URL]"
    
    return content

def get_time_ago(date_string: Optional[str]) -> str:
    """Get human-readable time difference"""
    if not date_string:
        return "Unknown"
    
    try:
        date = dateutil.parser.parse(date_string)
        now = datetime.now(date.tzinfo)
        diff = now - date
        
        days = diff.days
        hours = diff.seconds // 3600
        minutes = (diff.seconds % 3600) // 60
        
        if days > 0:
            return f"{days} day{'s' if days > 1 else ''} ago"
        elif hours > 0:
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif minutes > 0:
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        else:
            return "Just now"
    except Exception:
        return "Unknown"
    
async def fetch_document_by_id(file_id: str) -> Optional[str]:
    """Fetch document from blob storage and extract text"""
    try:
        # Get file from blob storage
        file_info = await attachment_storage.get_file(file_id)
        if not file_info:
            current_app.logger.error(f"File {file_id} not found in blob storage")
            return None
        
        # Extract text from file data
        from attachments.document_attachment_api import extract_text_from_file_data
        
        extracted_text = await extract_text_from_file_data(
            file_data=file_info["file_data"],
            file_type=file_info["file_type"],
            filename=file_info["original_filename"]
        )
        
        # Format as document source
        source = f"""=== DOCUMENT: {file_info["original_filename"]} ===
File Type: {file_info["file_type"]}
Size: {file_info["size"]} bytes
Content:
{extracted_text}
"""
        return source
        
    except Exception as e:
        current_app.logger.error(f"Error fetching document {file_id}: {e}")
        return f"[Error loading document: {str(e)}]"