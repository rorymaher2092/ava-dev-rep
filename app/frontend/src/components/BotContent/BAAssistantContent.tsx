// src/components/BotContent/BAAssistantContent.tsx
import React from "react";
import { BaseBotContent, BotContentConfig, BotContentProps } from "./BotContent";
import { ArtifactSelector } from "../ArtifactSelector/ArtifactSelector";
import { CollaborationPrompt } from "../CollaborationPrompt/CollaborationPrompt";
import { useArtifact } from "../../contexts/ArtifactContext";

export class BAAssistantContent extends BaseBotContent {
    getConfig(): BotContentConfig {
        return {
            title: "BA Assistant",
            showDescription: false,
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
            howToUse: "You can drop in a PRFAQ, create User Stories, generate Acceptance Criteria, and get help with business analysis frameworks and templates."
        };
    }

    // Override the render method to include artifact selection
    render(props: BotContentProps) {
        const config = this.getConfig();

    return (
            <div>
                {/* Standard features */}
                {/*this.renderFeatures(config.features)*/}

                {/* Artifact Selection - BA Bot specific functionality */}
                <ArtifactSelector />
            
                {/* Collaboration Prompt - NOW WITH onSendMessage prop */}
                <CollaborationPrompt 
                    onSendMessage={props.onSendMessage}
                    onGetStarted={() => {
                        console.log('BA Assistant: User clicked get started');
                    }}
                />
            </div>
         );
    }
};