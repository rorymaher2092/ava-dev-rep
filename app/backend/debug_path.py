import os
from pathlib import Path

def debug_paths():
    """Print debug information about paths."""
    print("Current working directory:", os.getcwd())
    print("__file__:", __file__)
    print("Parent directory:", Path(__file__).parent)
    
    config_path = Path(__file__).parent / "config" / "admins.json"
    print("Config path:", config_path)
    print("Config path exists:", config_path.exists())
    
    # Try alternative paths
    alt_path1 = Path("config/admins.json")
    print("Alternative path 1:", alt_path1)
    print("Alternative path 1 exists:", alt_path1.exists())
    
    alt_path2 = Path("app/backend/config/admins.json")
    print("Alternative path 2:", alt_path2)
    print("Alternative path 2 exists:", alt_path2.exists())

if __name__ == "__main__":
    debug_paths()