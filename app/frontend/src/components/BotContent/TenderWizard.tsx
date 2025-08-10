// src/components/BotContent/TenderAssistantContent.tsx
import React from "react";
import { BaseBotContent, BotContentConfig } from "./BotContent";

export class TenderAssistantContent extends BaseBotContent {
    getConfig(): BotContentConfig {
        return {
            title: "Tender Assistant",
            showDescription: false, // No description header
            features: [
                {
                    icon: "📝",
                    title: "Proposal Writing",
                    description: "Automated proposal generation and editing"
                },
                {
                    icon: "✅",
                    title: "Compliance Check",
                    description: "RFP requirement verification"
                },
                {
                    icon: "📊",
                    title: "Bid Analytics",
                    description: "Win/loss analysis and insights"
                }
            ],
            howToUse:
                "Upload RFP documents, get help structuring proposals, ensure compliance requirements are met, and receive guidance on winning bid strategies."
        };
    }
}
