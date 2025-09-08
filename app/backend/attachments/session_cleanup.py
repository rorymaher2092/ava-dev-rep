# session_cleanup.py - Create this as a new file in your backend
from quart import Blueprint, jsonify, current_app, request, session
import asyncio
import logging
from typing import Dict, Any

session_cleanup_bp = Blueprint('session_cleanup', __name__, url_prefix='/api/session')

@session_cleanup_bp.route('/heartbeat', methods=['POST'])
async def session_heartbeat():
    """Client sends heartbeat to keep session alive - throttled to reduce blob updates"""
    try:
        from attachments.attachment_helpers import get_attachment_counts
        import time
        
        # Only update session if it's been more than 10 minutes since last heartbeat
        last_heartbeat = session.get('last_heartbeat', 0)
        current_time = time.time()
        
        if current_time - last_heartbeat > 600:  # 10 minutes
            from attachments.attachment_helpers import get_unified_session_attachments
            attachments = get_unified_session_attachments()  # This updates session
            session['last_heartbeat'] = current_time
            session.modified = True
            current_app.logger.info(f"Session heartbeat updated: {session.get('attachment_session_id')}")
        
        counts = get_attachment_counts()
        
        return jsonify({
            "status": "alive",
            "session_id": session.get('attachment_session_id'),
            "attachments": counts
        })
        
    except Exception as e:
        current_app.logger.error(f"Session heartbeat error: {e}")
        return jsonify({"error": "Session error"}), 500

@session_cleanup_bp.route('/cleanup', methods=['POST'])
async def cleanup_session():
    """Cleanup session attachments"""
    try:
        # Import here to avoid circular imports
        from attachments.attachment_helpers import cleanup_expired_session, get_attachment_counts
        
        session_id = session.get('attachment_session_id', 'unknown')
        counts_before = get_attachment_counts()
        
        current_app.logger.info(f"Manual cleanup requested for session: {session_id}")
        current_app.logger.info(f"Attachments before cleanup: {counts_before}")
        
        cleaned = cleanup_expired_session()
        
        counts_after = get_attachment_counts()
        current_app.logger.info(f"Attachments after cleanup: {counts_after}")
        
        return jsonify({
            "cleaned": cleaned,
            "session_id": session_id,
            "attachments_before": counts_before,
            "attachments_after": counts_after,
            "message": "Cleanup completed" if cleaned else "No cleanup needed"
        })
        
    except Exception as e:
        current_app.logger.error(f"Session cleanup error: {e}")
        return jsonify({"error": "Cleanup failed"}), 500