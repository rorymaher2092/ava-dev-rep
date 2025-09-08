# attachment_api.py - Simple validation endpoints for UI (UPDATED)
from quart import Blueprint, jsonify, request
from attachments.attachment_helpers import validate_jira_ticket, validate_confluence_page

attachment_bp = Blueprint('attachments', __name__, url_prefix='/api/attachments')

@attachment_bp.route('/validate/jira', methods=['POST'])
async def validate_jira():
    """Validate a JIRA ticket for UI display"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        ticket_key = request_json.get("ticketKey")
        
        if not ticket_key:
            return jsonify({"error": "ticketKey is required"}), 400
        
        # Normalize ticket key
        ticket_key = ticket_key.strip().upper()
        
        result = await validate_jira_ticket(ticket_key)
        
        if result["valid"]:
            return jsonify(result), 200
        else:
            return jsonify({"error": result["error"]}), 400
            
    except Exception as error:
        return jsonify({"error": str(error)}), 500

@attachment_bp.route('/validate/confluence', methods=['POST'])
async def validate_confluence():
    """Validate a Confluence page for UI display"""
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    try:
        request_json = await request.get_json()
        page_url = request_json.get("pageUrl")
        
        if not page_url:
            return jsonify({"error": "pageUrl is required"}), 400
        
        # Basic URL validation
        page_url = page_url.strip()
        
        result = await validate_confluence_page(page_url)
        
        if result["valid"]:
            return jsonify(result), 200
        else:
            return jsonify({"error": result["error"]}), 400
            
    except Exception as error:
        return jsonify({"error": str(error)}), 500

# Optional: Test endpoint to verify the attachment system is working
@attachment_bp.route('/test', methods=['GET'])
async def test_attachment_system():
    """Test endpoint to check if attachment system is working"""
    return jsonify({
        "message": "Simple attachment validation system is working",
        "endpoints": [
            "/api/attachments/validate/jira",
            "/api/attachments/validate/confluence"
        ]
    })