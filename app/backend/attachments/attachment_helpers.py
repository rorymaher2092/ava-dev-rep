# attachment_helpers.py
from typing import Dict, List, Any, Optional
from datetime import datetime
import dateutil.parser
from quart import current_app  # ADD THIS IMPORT

def build_attachment_sources(user_attach: Dict[str, List[Dict[str, Any]]]) -> List[str]:
    """
    Build attachment sources in the same format as text_sources.
    Returns a list of formatted attachment strings.
    """
    attachment_sources = []
    
    # Process Jira tickets
    for ticket in user_attach.get("jira_tickets", []):
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
    
    # Process Confluence pages
    for page in user_attach.get("confluence_pages", []):
        page_age = get_time_ago(page.get("last_modified"))
        
        # Format as a single source string (like text_sources)
        page_source = f"""[CONFLUENCE PAGE: {page['title']}]
Space: {page['space_name']} ({page['space_key']})
Version: {page['version']} | Last Modified: {page_age}
URL: {page['url']}

Content:
{format_content_for_prompt(page['content'], max_length=2500)}"""
        
        attachment_sources.append(page_source)
    
    return attachment_sources

def prepare_chat_with_attachments(user_id: str) -> dict:
    """
    Prepare chat context with attachments treated like text_sources.
    Returns metadata and attachment_sources list.
    """
    # Import here to avoid circular imports
    from attachments.attachment_api import get_user_attachments_for_chat
    
    # Get user's stored attachments
    user_attach = get_user_attachments_for_chat(user_id)
    summary = get_attachment_summary(user_attach)
    
    current_app.logger.info(f"Chat request from user {user_id}:")
    current_app.logger.info(f"- Attachments: {summary['jira_tickets']} Jira, {summary['confluence_pages']} Confluence")
    
    # Build attachment sources (like text_sources)
    attachment_sources = []
    if summary["has_attachments"]:
        attachment_sources = build_attachment_sources(user_attach)
        current_app.logger.info(f"Built {len(attachment_sources)} attachment sources")
    
    # Return metadata and sources
    return {
        **summary,
        "attachment_sources": attachment_sources
    }

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

def has_attachments(user_attach: Dict[str, List[Dict[str, Any]]]) -> bool:
    """Check if user has any attachments"""
    return (
        len(user_attach.get("jira_tickets", [])) > 0 or 
        len(user_attach.get("confluence_pages", [])) > 0
    )

def get_attachment_summary(user_attach: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Get summary of attachments for logging/debugging"""
    return {
        "jira_tickets": len(user_attach.get("jira_tickets", [])),
        "confluence_pages": len(user_attach.get("confluence_pages", [])),
        "total_attachments": len(user_attach.get("jira_tickets", [])) + len(user_attach.get("confluence_pages", [])),
        "has_attachments": has_attachments(user_attach)
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
def build_rich_attachment_context(user_attach: Dict[str, List[Dict[str, Any]]]) -> str:
    """Legacy function - use build_attachment_sources instead"""
    import warnings
    warnings.warn(
        "build_rich_attachment_context is deprecated. Use build_attachment_sources instead.",
        DeprecationWarning,
        stacklevel=2
    )
    attachment_sources = build_attachment_sources(user_attach)
    return "\n\n".join(attachment_sources)