from typing import Dict, List, Any
from quart import Blueprint, jsonify, current_app, request
from .feedback import FeedbackCosmosDB
from decorators import authenticated

feedback_bp = Blueprint('feedback', __name__, url_prefix='/feedback')

@feedback_bp.route('/list', methods=['GET'])
@authenticated
async def list_feedback(auth_claims: Dict[str, Any]):
    """Get a list of feedback items."""
    # Only allow admins to view feedback
    if 'admin' not in auth_claims.get('roles', []):
        return jsonify({"error": "Unauthorized"}), 403
    
    try:
        feedback_db = FeedbackCosmosDB()
        await feedback_db.initialize()
        
        # Get query parameters
        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        feedback_type = request.args.get('type')
        
        # Build query
        query = "SELECT * FROM c"
        params = []
        
        if feedback_type:
            query += " WHERE c.feedback = @feedback_type"
            params.append({"name": "@feedback_type", "value": feedback_type})
        
        # Add sorting and pagination
        query += " ORDER BY c.timestamp DESC OFFSET @offset LIMIT @limit"
        params.append({"name": "@offset", "value": offset})
        params.append({"name": "@limit", "value": limit})
        
        # Execute query
        items = await feedback_db.query_feedback(query, params)
        await feedback_db.close()
        
        return jsonify({"items": items})
    except Exception as e:
        current_app.logger.error(f"Error fetching feedback: {str(e)}")
        return jsonify({"error": str(e)}), 500