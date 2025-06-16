import json
import os
from typing import Dict, Optional

def get_welcome_message(user_details: Dict) -> Optional[str]:
    """
    Generate a custom welcome message based on user details from configuration.
    
    Args:
        user_details: Dictionary containing user information including department, title, username
        
    Returns:
        Optional[str]: Custom welcome message based on user attributes, or default message
    """
    # Debug: Print user details to console
    print("DEBUG - User details:", user_details)
    
    if not user_details:
        return None
    
    # Load welcome messages configuration
    config_path = os.path.join(os.path.dirname(__file__), 'welcome_messages.json')
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # Fallback if config file is missing or invalid
        return f"Hello {user_details.get('name', '')}!"
    
    name = user_details.get('name', '')
    message = None
    
    # Extract username from email if it's an email address
    username = user_details.get('username', '')
    if '@' in username:
        username = username.split('@')[0]  # Extract part before @
    
    # Check for username-specific message
    if username and username.lower() in config.get('usernames', {}):
        message = config['usernames'][username.lower()]
    
    # Check for title-specific message
    elif 'title' in user_details and user_details['title'] in config.get('titles', {}):
        message = config['titles'][user_details['title']]
    
    # Check for department-specific message
    elif 'department' in user_details and user_details['department'].lower() in config.get('departments', {}):
        message = config['departments'][user_details['department'].lower()]
    
    # Use default message if no specific one found
    else:
        message = config.get('default', f"Hello {name}!")
    
    # Replace {{name}} placeholder with actual name
    return message.replace('{{name}}', name)