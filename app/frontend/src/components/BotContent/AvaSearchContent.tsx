// src/components/BotContent/AvaSearchContent.tsx
import React from "react";
import { BaseBotContent, BotContentConfig } from "./BotContent";
import confluencelogo from "../../assets/confluence-logo.png";
import defendersheild from "../../assets/defender-sheild.png";

export class AvaSearchContent extends BaseBotContent {
    getConfig(): BotContentConfig {
        return {
            title: "Ava Search",
            showDescription: false, // No description for Ava
            features: [
                {
                    icon: defendersheild,
                    title: "Secure",
                    description: "Microsoft Enterprise Security"
                },
                {
                    icon: confluencelogo,
                    title: "Live Search",
                    description: "Realtime Access to Confluence Data"
                },
                {
                    icon: "⚡",
                    title: "Fast Response",
                    description: "Powered by GPT-4o"
                }
            ]
            // No howToUse for Ava
        };
    }
}
