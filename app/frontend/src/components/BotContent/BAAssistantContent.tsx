// src/components/BotContent/BAAssistantContent.tsx
import React from "react";
import { BaseBotContent, BotContentConfig } from "./BotContent";

export class BAAssistantContent extends BaseBotContent {
    getConfig(): BotContentConfig {
        return {
            title: "BA Assistant",
            showDescription: false, // No description header
            features: [
                {
                    icon: "📊",
                    title: "Analytics",
                    description: "Advanced data analysis and visualization"
                },
                {
                    icon: "🎯",
                    title: "Requirements",
                    description: "Automated requirements gathering and documentation"
                },
                {
                    icon: "🚀",
                    title: "Process Optimization",
                    description: "Business process analysis and improvement"
                }
            ],
            howToUse:
                "You can drop in a PRFAQ, create User Stories, generate Acceptance Criteria, and get help with business analysis frameworks and templates."
        };
    }
}
