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
            <>
                {/* Standard features */}
                {this.renderFeatures(config.features)}

                {/* How to use section */}
                {config.howToUse && (
                    <div
                        style={{
                            backgroundColor: "var(--surface-elevated)",
                            borderRadius: "12px",
                            padding: "20px",
                            marginBottom: "32px",
                            border: "1px solid var(--brand-80)",
                            textAlign: "center",
                            maxWidth: "600px",
                            margin: "0 auto 32px auto"
                        }}
                    >
                        <div style={{ fontSize: "18px", marginBottom: "8px" }}>💡</div>
                        <div style={{ color: "var(--text)", fontWeight: "600", marginBottom: "8px" }}>
                            How to use {config.title}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                            {config.howToUse}
                        </div>
                    </div>
                )}

                {/* Artifact Selection - BA Bot specific functionality */}
                <ArtifactSelector />
                
                {/* Collaboration Prompt */}
                <CollaborationPrompt 
                    onGetStarted={() => {
                        // Optionally trigger something when user clicks "Get Started"
                        // For now, this could scroll to the input or focus it
                        const questionInput = document.querySelector('[placeholder*="Type a new question"]') as HTMLElement;
                        questionInput?.focus();
                    }}
                />
            </>
        );
    }
}