# backend/bot_profiles.py
from __future__ import annotations
from typing import Dict, List

class BotProfile:
    def __init__(
        self,
        id: str,
        label: str,
        model: str,
        deployment: str | None = None,  # Add deployment parameter
        api_version: str | None = None,  # Add API version
        allowed_emails: List[str] | None = None,
        search_indexes: List[str] | None = None,
        use_confluence_search: bool = False,
        use_dual_search: bool = False,
        primary_search_index: str | None = None,
        custom_prompt_template: str | None = None,
        disable_rag: bool = False,
        valid_artifacts: List[str] | None = None,  # Add this line
    ):
        self.id = id
        self.label = label
        self.model = model
        self.deployment = deployment  # Store the deployment name
        self.api_version = api_version
        self.allowed_emails = allowed_emails or []
        self.search_indexes = search_indexes or []
        self.use_confluence_search = use_confluence_search
        self.dual_search = use_dual_search
        self.primary_search_index = primary_search_index
        self.custom_prompt_template = custom_prompt_template
        self.disable_rag = disable_rag
        self.valid_artifacts = valid_artifacts or []  # Add this line
        
    
    def supports_artifact(self, artifact_type: str) -> bool:
        """Check if this bot supports the given artifact type."""
        return artifact_type in self.valid_artifacts
    
    def validate_artifact(self, artifact_type: str | None) -> str | None:
        """Validate and return artifact type if supported, otherwise None."""
        if artifact_type and self.supports_artifact(artifact_type):
            return artifact_type
        return None

# ── define each bot once ───────────────────────────────────────────
BOTS: Dict[str, BotProfile] = {
    "ava": BotProfile(
        id="ava",
        label="Ava – Search",
        model="gpt-4o",
        allowed_emails=[],   # everyone
        use_confluence_search=True,
        use_dual_search=True,
        primary_search_index=None,  # Uses default index
        custom_prompt_template="chat_answer_question.prompty",  # Explicit default
        disable_rag=False,
        valid_artifacts=[],  # Ava doesn't use artifacts
    ),

    "ba": BotProfile(
    id="ba",
    label="BA Buddy",
    model="o4-mini",
    deployment="o4-mini",
    api_version="2025-04-16",
    allowed_emails=["Jamie.Gray@vocus.com.au", "Rory.Maher@vocus.com.au", "Callum.Mayhook@vocus.com.au"],
    use_confluence_search=False,
    use_dual_search=False,
    primary_search_index="babuddyindex",
    custom_prompt_template="ba_buddy.prompty",
    disable_rag=True,
    valid_artifacts=[
        # Ideate Stage
        "dvf_prioritisation",
        
        # Define Stage
        "business_discovery",
        "prfaq",
        "change_on_page",
        "stakeholder_impact",
        "change_schedule",
        
        # Design Stage
        "feature_breakdown",
        "feature_details",
        "acceptance_criteria",
        "story_map",
        "business_process",
        "change_strategy",
        
        # Refine & Plan Stage
        "engineering_breakdown",
        "business_activities",
        
        # Develop Stage
        "uat_plan"
    ],
),
    
    "tender": BotProfile(
        id="tender",
        label="Tender Wizard",
        model="gpt-4o",
        deployment="gpt-4o",  # Add your actual deployment name
        allowed_emails=["rory.maher@vocus.com.au"],
        use_confluence_search=False,
        use_dual_search=False,
        primary_search_index=None,  # No search index
        custom_prompt_template="tender_wizard.prompty",  # Custom wizard template
        disable_rag=False,  # Completely disable RAG
        valid_artifacts=[]
    ),
}

DEFAULT_BOT_ID = "ava"

def get_all_search_indexes() -> set[str]:
    """
    Get all unique search indexes used by bots.
    This is used at startup to create all necessary search clients.
    Only returns indexes for bots that have RAG enabled.
    """
    indexes = set()
    
    for bot in BOTS.values():
        # Skip bots with RAG disabled
        if bot.disable_rag:
            continue
            
        if bot.primary_search_index:
            indexes.add(bot.primary_search_index)
        # Also include any indexes from the legacy search_indexes field
        if bot.search_indexes:
            indexes.update(bot.search_indexes)
    
    return indexes