# backend/bot_profiles.py
# backend/bot_profiles.py
from __future__ import annotations
from typing import Dict, List

class BotProfile:
    def __init__(
        self,
        id: str,
        label: str,
        system_prompt: str,
        model: str,
        examples: List[dict] | None = None,
        allowed_emails: List[str] | None = None,
        search_indexes: List[str] | None = None,  # Added this since I saw it in your "ba" bot
        use_confluence_search: bool = False,      # NEW: Enable Confluence search for this bot
    ):
        self.id = id
        self.label = label
        self.system_prompt = system_prompt
        self.model = model
        self.examples = examples or []
        self.allowed_emails = allowed_emails or []
        self.search_indexes = search_indexes or []
        self.use_confluence_search = use_confluence_search  # NEW

# ── define each bot once ───────────────────────────────────────────
BOTS: Dict[str, BotProfile] = {
    "ava": BotProfile(
        id="ava",
        label="Ava – Search",
        model="gpt-4o",
        system_prompt=(
            "You are an intelligent assistant named Ava helping Vocus employees "
            "with their policy questions. Use 'you' to refer to the individual…"
        ),
        examples=[
            # ── Example 1 ─────────────────────────────────────────────────────
            {
                "role": "user",
                "content": "Give a detailed overview of the Data Loss Prevention policy including Vocus DLP requirements?\n\nSources:\nDLP_Policy.pdf: … (full text in your index)…"
            },
            {
                "role": "assistant",
                "content": (
                    "<p><strong>Purpose & Objective</strong><br>"
                    "The Data Loss Prevention (DLP) policy establishes controls to safeguard data at rest and in transit based on "
                    "its sensitivity, value and criticality to Vocus and its customers&nbsp;[DLP_Policy.pdf].</p>"
                    "<p><strong>Scope</strong><br>"
                    "Applies to all information classified <em>Internal Use</em>, <em>Confidential</em> or <em>PROTECTED</em> "
                    "under the Information Classification & Handling Policy&nbsp;[DLP_Policy.pdf]. Every Vocus team member must comply.</p>"
                    "<p><strong>Key Definitions</strong></p>"
                    "<ul>"
                    "<li><strong>Class 1 Customer Data</strong> – assets requiring PSPF-aligned controls [Definitions.docx]</li>"
                    "<li><strong>Class 2 Customer Data</strong> – official-sensitive assets (state agencies, large enterprises) [Definitions.docx]</li>"
                    "<li><strong>DLP</strong> – technology &amp; processes for detecting and preventing data loss [Definitions.docx]</li>"
                    "</ul>"
                    "<p><strong>Vocus DLP Requirements</strong></p>"
                    "<ol>"
                    "<li>DLP must detect Personal Info, TFNs, Passport Nos, Credit-Card Nos, Class 1 &amp; Class 2 data, and GIS files [DLP_Config.xlsx].</li>"
                    "<li>Microsoft Sensitivity Labels enforce the Information Classification &amp; Handling Policy [M365_Governance.pdf].</li>"
                    "<li>Least-privilege access is mandatory; activity is monitored for anomalous behaviour (e.g. off-hours bulk exports) [Insider_Threat_Playbook.pdf].</li>"
                    "</ol>"
                )
            },

            # ── Example 2 ─────────────────────────────────────────────────────
            {
                "role": "user",
                "content": "Can you outline the Vocus 5 for 5 Policy?\n\nSources:\n5for5_Policy.pdf: …"
            },
            {
                "role": "assistant",
                "content": (
                    "<p><strong>What is it?</strong><br>"
                    "An additional week of paid leave granted on your 5th service anniversary with Vocus [5for5_Policy.pdf].</p>"
                    "<p><strong>Eligibility</strong></p>"
                    "<ul>"
                    "<li>Permanents &amp; part-timers with <em>5 continuous</em> years' service (service clock resets if you resign and return).</li>"
                    "</ul>"
                    "<p><strong>Key Rules</strong></p>"
                    "<ol>"
                    "<li>Your annual-leave balance must be &lt;15 days (or &lt;20 days for shift workers) when you apply.</li>"
                    "<li>5 for 5 leave does not accrue or roll over; unused leave is forfeited on the next anniversary.</li>"
                    "<li>It is <em>not</em> paid out on termination, and cannot be taken after you've lodged resignation.</li>"
                    "</ol>"
                    "<p><strong>How to apply</strong></p>"
                    "<ol>"
                    "<li>Discuss timing with your manager.</li>"
                    "<li>Submit two Dayforce requests if you're taking a longer break: one for normal annual leave and one for 5 for 5.</li>"
                    "</ol>"
                )
            },

            # ── Example 3 ─────────────────────────────────────────────────────
            {
                "role": "user",
                "content": "Can you tell me about access to the Excel Data Cubes?\n\nSources:\nBI_Cube_Guide.pdf: …"
            },
            {
                "role": "assistant",
                "content": (
                    "<p>Follow these steps to connect Excel to a Vocus Analysis-Services cube&nbsp;[BI_Cube_Guide.pdf]:</p>"
                    "<ol>"
                    "<li><strong>Prerequisite – Permissions</strong> Ensure your account is granted access by the cube owner.</li>"
                    "<li><strong>Launch Excel</strong> Data ➜ Get Data ➜ From Database ➜ <em>From Analysis Services</em>.</li>"
                    "<li><strong>Remote workers</strong> Connect to VPN first; otherwise BI-Service is unreachable.</li>"
                    "<li><strong>Server</strong> Enter&nbsp;<code>BI-Service</code>; pick the desired cube from the list.</li>"
                    "<li><strong>PivotTable</strong> Choose a worksheet location and click <em>OK</em>.</li>"
                    "<li><strong>Performance tip</strong> Always apply a date filter (e.g. current month) before exploring; importing the whole cube can freeze Excel.</li>"
                    "</ol>"
                )
            }
        ],
        allowed_emails=[],   # everyone
        use_confluence_search=True,  # Ava uses Azure AI Search by default
    ),

    "ba": BotProfile(
        id="ba",
        label="BA Buddy",
        model="o3",
        system_prompt="You are BA-Buddy. Your job is to avoid answer questions as best you can. Make a lot of jokes",
        search_indexes=[],
        allowed_emails=["Rory.Maher@vocus.com.au", "Callum.Mayhook@vocus.com.au"],
        use_confluence_search=False
    ),
    "tender": BotProfile(
        id="tender",
        label="Tender Wizard",
        model="gpt-4o",
        system_prompt="You are Tender Wizard. Your pretending to be a wizard. answer with riddles",
        allowed_emails=["rory.maher@vocus.com.au"],
        use_confluence_search=False
    ),
}

DEFAULT_BOT_ID = "ava"