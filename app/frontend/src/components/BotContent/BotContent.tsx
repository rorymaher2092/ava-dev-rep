// src/components/BotContent/BaseBotContent.tsx
import React from "react";

export interface BotContentProps {
    userName: string;
    welcomeMessage: string;
    isMobile: boolean;
    onSendMessage?: (message: string) => void;
}

export interface BotContentConfig {
    title: string;
    showDescription: boolean; // New: whether to show description at all
    description?: string; // Optional now
    features: Array<{
        icon: string;
        title: string;
        description: string;
    }>;
    howToUse?: string; // New: "How to use" box that appears AFTER features
}

export abstract class BaseBotContent {
    abstract getConfig(): BotContentConfig;

    renderFeatures(features: BotContentConfig["features"]) {
        return (
            <div
                style={{
                    display: "flex",
                    gap: "24px",
                    marginBottom: "32px",
                    flexWrap: "wrap",
                    justifyContent: "center"
                }}
            >
                {features.map((feature, index) => (
                    <div
                        key={index}
                        style={{
                            backgroundColor: "var(--surface-elevated)",
                            borderRadius: "16px",
                            padding: "20px",
                            textAlign: "center",
                            width: "180px",
                            height: "140px",
                            boxShadow: "var(--shadow-sm)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center"
                        }}
                    >
                        <div
                            style={{
                                marginBottom: "12px",
                                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center"
                            }}
                        >
                            {feature.icon.startsWith("http") || feature.icon.includes(".") ? (
                                <img src={feature.icon} alt={feature.title} style={{ width: "32px", height: "32px" }} />
                            ) : (
                                <div style={{ fontSize: "32px" }}>{feature.icon}</div>
                            )}
                        </div>
                        <div style={{ color: "var(--text)", fontWeight: "700", fontSize: "16px", marginBottom: "4px" }}>{feature.title}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.4" }}>{feature.description}</div>
                    </div>
                ))}
            </div>
        );
    }

    render(props: BotContentProps) {
        const config = this.getConfig();

        return (
            <>
                {/* Optional description (only if showDescription is true) */}
                {config.showDescription && config.description && (
                    <h2
                        style={{
                            color: "var(--text)",
                            marginBottom: "16px",
                            fontSize: "20px",
                            fontWeight: "500",
                            textAlign: "center"
                        }}
                    >
                        {config.description}
                    </h2>
                )}

                {/* Features (always shown) */}
                {this.renderFeatures(config.features)}

                {/* "How to use" box (appears AFTER features) */}
                {config.howToUse && (
                    <div
                        style={{
                            backgroundColor: "var(--surface-elevated)",
                            borderRadius: "12px",
                            padding: "20px",
                            marginBottom: "24px",
                            border: "1px solid var(--brand-80)",
                            textAlign: "center",
                            maxWidth: "600px",
                            margin: "0 auto 24px auto"
                        }}
                    >
                        <div style={{ fontSize: "18px", marginBottom: "8px" }}>💡</div>
                        <div style={{ color: "var(--text)", fontWeight: "600", marginBottom: "8px" }}>How to use {config.title}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{config.howToUse}</div>
                    </div>
                )}
            </>
        );
    }
}
