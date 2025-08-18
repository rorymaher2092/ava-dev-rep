# attachment_helpers.py - Session-Based Storage
from typing import Dict, List, Any, Optional
from datetime import datetime
import dateutil.parser
from quart import current_app, session

def prepare_chat_with_attachments() -> dict:
    """
    Prepare chat context with attachments treated like text_sources.
    Uses session-based storage instead of user ID.
    Returns metadata and attachment_sources list.
    """
    # Import here to avoid circular imports
    from attachments.attachment_api import get_session_attachments_for_chat
    
    # Get session ID (create if doesn't exist)
    session_id = get_session_id()
    
    current_app.logger.info(f"🔍 DEBUG - prepare_chat_with_attachments called for session: {session_id}")
    
    # Get session's stored attachments
    session_attach = get_session_attachments_for_chat(session_id)
    
    # DEBUG: Log what we got from storage
    current_app.logger.info(f"🔍 DEBUG - Raw session_attach from storage: {session_attach}")
    current_app.logger.info(f"🔍 DEBUG - session_attach type: {type(session_attach)}")
    current_app.logger.info(f"🔍 DEBUG - session_attach keys: {list(session_attach.keys()) if isinstance(session_attach, dict) else 'NOT A DICT'}")
    
    summary = get_attachment_summary(session_attach)
    
    current_app.logger.info(f"Chat request for session {session_id}:")
    current_app.logger.info(f"- Attachments: {summary['jira_tickets']} Jira, {summary['confluence_pages']} Confluence")
    current_app.logger.info(f"🔍 DEBUG - Summary: {summary}")
    
    # Build attachment sources (like text_sources)
    attachment_sources = []
    if summary["has_attachments"]:
        current_app.logger.info(f"🔍 DEBUG - Building attachment sources...")
        attachment_sources = build_attachment_sources(session_attach)
        current_app.logger.info(f"Built {len(attachment_sources)} attachment sources")
        
        # DEBUG: Log the first attachment source
        if attachment_sources:
            current_app.logger.info(f"🔍 DEBUG - First attachment source (first 500 chars): {attachment_sources[0][:500]}...")
        else:
            current_app.logger.warning(f"🔍 DEBUG - No attachment sources built despite has_attachments=True!")
    else:
        current_app.logger.info("🔍 DEBUG - No attachments found (has_attachments=False)")
    
    # Return metadata and sources
    result = {
        **summary,
        "attachment_sources": attachment_sources,
        "session_id": session_id  # Include session ID for debugging
    }
    
    # DEBUG: Log what we're returning
    current_app.logger.info(f"🔍 DEBUG - Returning result with {len(result.get('attachment_sources', []))} attachment sources")
    current_app.logger.info(f"🔍 DEBUG - Full result keys: {list(result.keys())}")
    
    return result

def get_session_id() -> str:
    """Get or create a session ID for attachments (same logic as API)"""
    import uuid
    
    if 'attachment_session_id' not in session:
        session['attachment_session_id'] = str(uuid.uuid4())
        current_app.logger.info(f"🔧 Created new attachment session in helpers: {session['attachment_session_id']}")
    else:
        current_app.logger.info(f"🔧 Using existing attachment session in helpers: {session['attachment_session_id']}")
    
    return session['attachment_session_id']

def build_attachment_sources(session_attach: Dict[str, List[Dict[str, Any]]]) -> List[str]:
    """
    Build attachment sources in the same format as text_sources.
    Returns a list of formatted attachment strings.
    """
    current_app.logger.info(f"🔍 DEBUG - build_attachment_sources called with: {session_attach}")
    
    attachment_sources = []
    
    # Process Jira tickets
    jira_tickets = session_attach.get("jira_tickets", [])
    current_app.logger.info(f"🔍 DEBUG - Processing {len(jira_tickets)} JIRA tickets")
    
    for i, ticket in enumerate(jira_tickets):
        current_app.logger.info(f"🔍 DEBUG - Processing JIRA ticket {i}: {ticket.get('key', 'NO_KEY')}")
        ticket_age = get_time_ago(ticket.get("updated") or ticket.get("created"))
        
        # Format as a single source string (like text_sources)
        ticket_source = f"""[JIRA TICKET: {ticket['key']}]
Title: {ticket['summary']}
Status: {ticket['status']} | Priority: {ticket['priority']} | Type: {ticket['issue_type']}
Assignee: {ticket['assignee']} | Reporter: {ticket['reporter']}
Last Updated: {ticket_age}
URL: {ticket['url']}

Description:
{format_content_for_prompt(ticket['description'])}"""
        
        attachment_sources.append(ticket_source)
        current_app.logger.info(f"🔍 DEBUG - Added JIRA ticket source (length: {len(ticket_source)})")
    
    # Process Confluence pages
    confluence_pages = session_attach.get("confluence_pages", [])
    current_app.logger.info(f"🔍 DEBUG - Processing {len(confluence_pages)} Confluence pages")
    
    for i, page in enumerate(confluence_pages):
        current_app.logger.info(f"🔍 DEBUG - Processing Confluence page {i}: {page.get('title', 'NO_TITLE')}")
        page_age = get_time_ago(page.get("last_modified"))
        
        # Format as a single source string (like text_sources)
        page_source = f"""[CONFLUENCE PAGE: {page['title']}]
Space: {page['space_name']} ({page['space_key']})
Version: {page['version']} | Last Modified: {page_age}
URL: {page['url']}

Content:
{format_content_for_prompt(page['content'], max_length=2500)}"""
        
        attachment_sources.append(page_source)
        current_app.logger.info(f"🔍 DEBUG - Added Confluence page source (length: {len(page_source)})")
    
    current_app.logger.info(f"🔍 DEBUG - build_attachment_sources returning {len(attachment_sources)} sources")
    return attachment_sources

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

def has_attachments(session_attach: Dict[str, List[Dict[str, Any]]]) -> bool:
    """Check if session has any attachments"""
    return (
        len(session_attach.get("jira_tickets", [])) > 0 or 
        len(session_attach.get("confluence_pages", [])) > 0
    )

def get_attachment_summary(session_attach: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Get summary of attachments for logging/debugging"""
    return {
        "jira_tickets": len(session_attach.get("jira_tickets", [])),
        "confluence_pages": len(session_attach.get("confluence_pages", [])),
        "total_attachments": len(session_attach.get("jira_tickets", [])) + len(session_attach.get("confluence_pages", [])),
        "has_attachments": has_attachments(session_attach)
    }

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

# Legacy function for backwards compatibility
def build_rich_attachment_context(session_attach: Dict[str, List[Dict[str, Any]]]) -> str:
    """Legacy function - use build_attachment_sources instead"""
    import warnings
    warnings.warn(
        "build_rich_attachment_context is deprecated. Use build_attachment_sources instead.",
        DeprecationWarning,
        stacklevel=2
    )
    attachment_sources = build_attachment_sources(session_attach)
    return "\n\n".join(attachment_sources)