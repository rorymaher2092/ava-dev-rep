import os
import json
from pathlib import Path
from typing import Dict, Any, List
from quart import Blueprint, jsonify, current_app, request
from decorators import authenticated

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

def load_admins() -> List[Dict[str, str]]:
    """Load admin information from JSON file."""
    try:
        # Try multiple possible paths
        possible_paths = [
            Path(__file__).parent / "config" / "admins.json",  # Relative to this file
            Path("config/admins.json"),  # Relative to working directory
            Path("app/backend/config/admins.json"),  # Relative to project root
            Path("/Users/jamie.gray/Ava-Dev/Ava-Dev/app/backend/config/admins.json")  # Absolute path
        ]
        
        for config_path in possible_paths:
            current_app.logger.info(f"Trying path: {config_path}")
            if config_path.exists():
                current_app.logger.info(f"Found admin config at {config_path}")
                with open(config_path, "r") as f:
                    data = json.load(f)
                    admins = data.get("admins", [])
                    current_app.logger.info(f"Loaded {len(admins)} admins: {admins}")
                    return admins
            else:
                current_app.logger.info(f"Path does not exist: {config_path}")
        
        current_app.logger.error("No valid admin config file found")
        return []
    except Exception as e:
        current_app.logger.error(f"Error loading admin config: {str(e)}")
        return []

def save_admins(admins: List[Dict[str, str]]) -> bool:
    """Save admin information to JSON file."""
    try:
        config_path = Path(__file__).parent / "config" / "admins.json"
        with open(config_path, "w") as f:
            json.dump({"admins": admins}, f, indent=2)
        return True
    except Exception as e:
        current_app.logger.error(f"Error saving admin config: {str(e)}")
        return False

@admin_bp.route('/check', methods=['GET'])
@authenticated
async def check_admin(auth_claims: Dict[str, Any]):
    """Check if the current user is an admin."""
    current_app.logger.info(f"Checking admin status for auth claims: {auth_claims}")
    
    # Check roles (from Entra ID app roles)
    roles = auth_claims.get('roles', [])
    current_app.logger.info(f"User roles: {roles}")
    if 'admin' in roles:
        current_app.logger.info("User has admin role in claims")
        return jsonify({"isAdmin": True})
    
    # Check email against JSON file
    admins = load_admins()
    admin_emails = [admin["email"].lower() for admin in admins]
    current_app.logger.info(f"Admin emails from config: {admin_emails}")
    
    # Try multiple possible email fields
    possible_email_fields = ['preferred_username', 'upn', 'email', 'unique_name']
    user_email = None
    
    for field in possible_email_fields:
        if field in auth_claims and auth_claims[field]:
            user_email = auth_claims[field].lower()
            current_app.logger.info(f"Found user email in {field}: {user_email}")
            if user_email in admin_emails:
                current_app.logger.info(f"User email {user_email} found in admin list")
                return jsonify({"isAdmin": True})
    
    # Special case for Jamie Gray
    if any(name in str(auth_claims).lower() for name in ["jamie", "gray", "grey"]):
        current_app.logger.info("Jamie Gray detected in claims, granting admin access")
        return jsonify({"isAdmin": True})

    if any(name in str(auth_claims).lower() for name in ["rory", "maher",]):
        current_app.logger.info("Rory Maher detected in claims, granting admin access")
        return jsonify({"isAdmin": True})
    
    if any(name in str(auth_claims).lower() for name in ["callum","cal", "mayhook",]):
        current_app.logger.info("Callum Mayhook detected in claims, granting admin access")
        return jsonify({"isAdmin": True})
    
    current_app.logger.info(f"User is not an admin")
    return jsonify({"isAdmin": False})

@admin_bp.route('/list', methods=['GET'])
@authenticated
async def list_admins(auth_claims: Dict[str, Any]):
    """Get a list of admins."""
    # Check if user is an admin
    is_admin = 'admin' in auth_claims.get('roles', [])
    
    if not is_admin:
        # Check email against JSON file
        admins = load_admins()
        admin_emails = [admin["email"].lower() for admin in admins]
        user_email = auth_claims.get('preferred_username', '').lower()
        is_admin = user_email in admin_emails
    
    if not is_admin:
        return jsonify({"error": "Unauthorized"}), 403
    
    # Return the list of admins
    admins = load_admins()
    return jsonify({"admins": admins})

@admin_bp.route('/add', methods=['POST'])
@authenticated
async def add_admin(auth_claims: Dict[str, Any]):
    """Add a new admin."""
    # Check if user is an admin
    is_admin = 'admin' in auth_claims.get('roles', [])
    
    if not is_admin:
        # Check email against JSON file
        admins = load_admins()
        admin_emails = [admin["email"].lower() for admin in admins]
        user_email = auth_claims.get('preferred_username', '').lower()
        is_admin = user_email in admin_emails
    
    if not is_admin:
        return jsonify({"error": "Unauthorized"}), 403
    
    # Get the new admin details
    request_json = await request.get_json()
    email = request_json.get("email", "").lower()
    name = request_json.get("name", "")
    
    if not email or not name:
        return jsonify({"error": "Email and name are required"}), 400
    
    # Add the new admin
    admins = load_admins()
    admin_emails = [admin["email"].lower() for admin in admins]
    
    if email in admin_emails:
        return jsonify({"error": "Admin already exists"}), 400
    
    admins.append({"email": email, "name": name})
    
    if save_admins(admins):
        return jsonify({"message": "Admin added successfully"})
    else:
        return jsonify({"error": "Failed to add admin"}), 500

@admin_bp.route('/remove', methods=['POST'])
@authenticated
async def remove_admin(auth_claims: Dict[str, Any]):
    """Remove an admin."""
    # Check if user is an admin
    is_admin = 'admin' in auth_claims.get('roles', [])
    
    if not is_admin:
        # Check email against JSON file
        admins = load_admins()
        admin_emails = [admin["email"].lower() for admin in admins]
        user_email = auth_claims.get('preferred_username', '').lower()
        is_admin = user_email in admin_emails
    
    if not is_admin:
        return jsonify({"error": "Unauthorized"}), 403
    
    # Get the admin to remove
    request_json = await request.get_json()
    email = request_json.get("email", "").lower()
    
    if not email:
        return jsonify({"error": "Email is required"}), 400
    
    # Remove the admin
    admins = load_admins()
    admins = [admin for admin in admins if admin["email"].lower() != email]
    
    if save_admins(admins):
        return jsonify({"message": "Admin removed successfully"})
    else:
        return jsonify({"error": "Failed to remove admin"}), 500