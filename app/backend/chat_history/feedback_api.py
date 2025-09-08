import os
import time
from typing import Dict, List, Any
from quart import Blueprint, jsonify, current_app, request
from .feedback import FeedbackCosmosDB
from decorators import authenticated

feedback_bp = Blueprint('feedback', __name__, url_prefix='/feedback')

@feedback_bp.route('/test', methods=['GET'])
@authenticated
async def test_feedback(auth_claims: Dict[str, Any]):
    """Test endpoint to check if feedback system is working."""
    return jsonify({
        "message": "Feedback system is working",
        "user": auth_claims.get('name', 'Unknown'),
        "feedback_storage_enabled": os.getenv("USE_FEEDBACK_STORAGE", "").lower() == "true",
        "cosmos_enabled": os.getenv("USE_CHAT_HISTORY_COSMOS", "").lower() == "true",
        "use_feedback_storage_raw": os.getenv("USE_FEEDBACK_STORAGE", "NOT_SET"),
        "cosmos_account": os.getenv("AZURE_COSMOSDB_ACCOUNT", "NOT_SET"),
        "chat_history_database": os.getenv("AZURE_CHAT_HISTORY_DATABASE", "NOT_SET")
    })

@feedback_bp.route('/add-test', methods=['GET'])
@authenticated
async def add_test_feedback(auth_claims: Dict[str, Any]):
    """Add test feedback directly to Cosmos DB."""
    try:
        feedback_data = {
            "responseId": "test-response-123",
            "feedback": "positive",
            "comments": "This is a test feedback",
            "timestamp": time.time(),
            "userId": auth_claims.get("oid", "test-user"),
            "username": auth_claims.get("preferred_username", "test@example.com"),
            "name": auth_claims.get("name", "Test User")
        }
        
        feedback_db = FeedbackCosmosDB()
        await feedback_db.initialize()
        feedback_id = await feedback_db.add_feedback(feedback_data)
        await feedback_db.close()
        
        return jsonify({"message": "Test feedback added", "id": feedback_id, "data": feedback_data})
    except Exception as e:
        current_app.logger.error(f"Error adding test feedback: {str(e)}")
        return jsonify({"error": str(e)}), 500



@feedback_bp.route('/list', methods=['GET'])
@authenticated
async def list_feedback(auth_claims: Dict[str, Any]):
    """Get a list of feedback items."""
    current_app.logger.info("🔍 Starting feedback list request")
    
    try:
        # Import here to avoid circular imports
        current_app.logger.info("🔍 About to import admin_api")
        from admin_api import load_admins
        current_app.logger.info("🔍 Successfully imported admin_api")
    except Exception as e:
        current_app.logger.error(f"❌ Failed to import admin_api: {str(e)}")
        return jsonify({"error": "Import error"}), 500
    current_app.logger.info("🔍 Starting feedback list request")
    
    try:
        # Import here to avoid circular imports
        current_app.logger.info("🔍 About to import admin_api")
        from admin_api import load_admins
        current_app.logger.info("🔍 Successfully imported admin_api")
    except Exception as e:
        current_app.logger.error(f"❌ Failed to import admin_api: {str(e)}")
        return jsonify({"error": "Import error"}), 500
    
    # Check if user is an admin by role or email
    is_admin = False
    current_app.logger.info("🔍 Starting admin checks")
    current_app.logger.info(f"🔍 Auth claims: {auth_claims}")
    
    if not auth_claims:
        current_app.logger.info("🔧 TEMP: Empty auth claims, allowing access for testing")
        is_admin = True
    
    # Check roles (from Entra ID app roles)
    if 'admin' in auth_claims.get('roles', []):
        is_admin = True
        current_app.logger.info("🔍 User has admin role")
    
    # Special case for Jamie Gray
    if not is_admin and any(name in str(auth_claims).lower() for name in ["jamie", "gray", "grey"]):
        is_admin = True
        current_app.logger.info("🔍 Jamie Gray detected")

    # Special case for Rory Maher
    if not is_admin and any(name in str(auth_claims).lower() for name in ["rory", "maher"]):
        is_admin = True
        current_app.logger.info("🔍 Rory Maher detected")

    # Special case for Callum Mayhook
    if not is_admin and any(name in str(auth_claims).lower() for name in ["callum", "mayhook", "cal"]):
        is_admin = True
        current_app.logger.info("🔍 Callum Mayhook detected")
        current_app.logger.info("🔍 Jamie Gray detected")

    # Special case for Rory Maher
    if not is_admin and any(name in str(auth_claims).lower() for name in ["rory", "maher"]):
        is_admin = True
        current_app.logger.info("🔍 Rory Maher detected")

    # Special case for Callum Mayhook
    if not is_admin and any(name in str(auth_claims).lower() for name in ["callum", "mayhook", "cal"]):
        is_admin = True
        current_app.logger.info("🔍 Callum Mayhook detected")
    
    # Check email against JSON file
    if not is_admin:
        try:
            admins = load_admins()
            current_app.logger.info(f"🔍 Loaded {len(admins)} admins from config")
            admin_emails = [admin["user_id"].lower() for admin in admins]
        except Exception as e:
            current_app.logger.error(f"❌ Failed to load admins: {str(e)}")
            return jsonify({"error": "Admin config error"}), 500
        
        # Try multiple possible email fields
        possible_email_fields = ['preferred_username', 'upn', 'email', 'unique_name']
        for field in possible_email_fields:
            if field in auth_claims and auth_claims[field]:
                user_email = auth_claims[field].lower()
                if user_email in admin_emails:
                    is_admin = True
                    break
    
    if not is_admin:
        current_app.logger.info("🚫 User not authorized")
        return jsonify({"error": "Unauthorized"}), 403
    
    current_app.logger.info("✅ User authorized, proceeding to Cosmos DB")
    try:
        # Check if Cosmos DB is configured (skip the USE_FEEDBACK_STORAGE check for now)
        if not os.getenv("AZURE_COSMOSDB_ACCOUNT"):
            current_app.logger.info("Cosmos DB account not configured, returning empty list")
            return jsonify({"items": [], "message": "Cosmos DB not configured"})
        
        current_app.logger.info("🔍 Creating FeedbackCosmosDB instance")
        feedback_db = FeedbackCosmosDB()
        current_app.logger.info("🔍 Initializing Cosmos DB connection")
        await feedback_db.initialize()
        current_app.logger.info("✅ Cosmos DB initialized successfully")
        
        # Get query parameters
        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        feedback_type = request.args.get('type')
        
        # Build query - simplified for Cosmos DB
        if feedback_type:
            query = "SELECT * FROM c WHERE c.feedback = @feedback_type ORDER BY c.timestamp DESC"
            params = [{"name": "@feedback_type", "value": feedback_type}]
        else:
            query = "SELECT * FROM c ORDER BY c.timestamp DESC"
            params = []
        
        # Execute query
        current_app.logger.info(f"Executing feedback query: {query} with params: {params}")
        items = await feedback_db.query_feedback(query, params)
        await feedback_db.close()
        
        current_app.logger.info(f"Found {len(items)} feedback items")
        
        return jsonify({"items": items})
    except Exception as e:
        current_app.logger.error(f"Error fetching feedback: {str(e)}")
        return jsonify({"items": [], "error": str(e)})