import { useState, useEffect } from "react";
import { Example } from "./Example";
import styles from "./Example.module.css";

/** ─────────────────────────────────────────────────────────────
 *  Bot-specific question pools with icons and modern phrasing
 *  ────────────────────────────────────────────────────────────*/

interface ExampleQuestion {
    text: string;
    icon: string;
    category: string;
}

// Bot-specific examples with different counts
const BOT_EXAMPLES = {
    ava: {
        examples: {
            "Getting Started": [
                { text: "How do I connect to the VPN?", icon: "🔐", category: "Getting Started" },
                { text: "Where can I find the brand guidelines?", icon: "🎨", category: "Getting Started" },
                { text: "How can I access the Excel Data Cubes?", icon: "📊", category: "Getting Started" }
            ],
            "Policies & Procedures": [
                { text: "What's the Hybrid-Ways-of-Working policy?", icon: "🏠", category: "Policies & Procedures" },
                { text: "Where can I find the Travel Policy?", icon: "✈️", category: "Policies & Procedures" },
                { text: "What Information Classification labels does Vocus use?", icon: "🏷️", category: "Policies & Procedures" }
            ],
            "HR & Support": [
                { text: "Who should I contact for Paid Parental Leave information?", icon: "👶", category: "HR & Support" },
                { text: "How do I report workplace concerns anonymously?", icon: "🛡️", category: "HR & Support" },
                { text: "Can I go into negative leave balance?", icon: "✈️", category: "HR & Support" }
            ],
            "Technical Help": [
                { text: "What types of incidents are classified as major incidents?", icon: "🚨", category: "Technical Help" },
                { text: "How can I troubleshoot network connectivity issues?", icon: "🌐", category: "Technical Help" },
                { text: "What are the Data Loss Prevention requirements?", icon: "🔒", category: "Technical Help" }
            ],
            "Business Insights": [
                { text: "What are the risks in implementing new solutions and how to mitigate them?", icon: "⚖️", category: "Business Insights" },
                { text: "How do I create an effective change communication plan?", icon: "📢", category: "Business Insights" },
                { text: "What's our current customer satisfaction approach?", icon: "😊", category: "Business Insights" }
            ],
            "Product Information": [
                { text: "What does VIE stand for?", icon: "❓", category: "Product Information" },
                { text: "What is the value proposition for IP WAN over Starlink Ethernet Access?", icon: "📡", category: "Product Information" },
                { text: "What is the difference between internet products at Vocus?", icon: "🛜", category: "Product Information" }
            ]
        },
        count: 6
    },

    ba: {
        examples: {
            "Requirements & Documentation": [
                { text: "Help me write acceptance criteria for a user login feature", icon: "✅", category: "Requirements & Documentation" },
                { text: "Create a PRFAQ document for a new mobile app feature", icon: "❓", category: "Requirements & Documentation" },
                { text: "Generate user stories for an e-commerce checkout process", icon: "👤", category: "Requirements & Documentation" }
            ],
            "Analysis & Planning": [
                { text: "Review these acceptance criteria for completeness and clarity", icon: "🔍", category: "Analysis & Planning" },
                { text: "Help me structure a comprehensive PRFAQ for stakeholder review", icon: "📋", category: "Analysis & Planning" },
                { text: "Break down this epic into detailed user stories with acceptance criteria", icon: "⚡", category: "Analysis & Planning" }
            ]
        },
        count: 3
    },

    tender: {
        examples: {
            "Proposal Development": [
                { text: "Help me structure a technical proposal response", icon: "📝", category: "Proposal Development" },
                { text: "What are the key components of a winning tender submission?", icon: "🏆", category: "Proposal Development" },
                { text: "Create a compliance matrix for this RFP", icon: "📊", category: "Proposal Development" }
            ],
            "Bid Management": [
                { text: "Generate a proposal timeline and milestone schedule", icon: "📅", category: "Bid Management" },
                { text: "Help me write compelling value propositions", icon: "💡", category: "Bid Management" },
                { text: "Review this proposal section for clarity and impact", icon: "🔍", category: "Bid Management" }
            ]
        },
        count: 3
    }
};

const GPT4V_EXAMPLES: ExampleQuestion[] = [
    { text: "Upload a screenshot and explain what this error means", icon: "🖼️", category: "Visual Analysis" },
    { text: "What does this network diagram tell us about latency?", icon: "📈", category: "Visual Analysis" },
    { text: "Identify the compliance icons in this image", icon: "🔍", category: "Visual Analysis" }
];

interface Props {
    onExampleClicked: (value: string) => void;
    useGPT4V?: boolean;
    botId: string;
}

/** Picks random examples from different categories based on bot configuration */
const pickRandomFromCategories = (categories: Record<string, ExampleQuestion[]>, count: number): ExampleQuestion[] => {
    const allExamples = Object.values(categories).flat();
    if (allExamples.length <= count) return allExamples;

    const chosen: ExampleQuestion[] = [];
    const used = new Set<number>();

    while (chosen.length < count && chosen.length < allExamples.length) {
        const idx = Math.floor(Math.random() * allExamples.length);
        if (!used.has(idx)) {
            used.add(idx);
            chosen.push(allExamples[idx]);
        }
    }
    return chosen;
};

export const ExampleList = ({ onExampleClicked, useGPT4V = false, botId }: Props) => {
    console.log("ExampleList rendered with botId:", botId); // Debug log

    const [examples, setExamples] = useState<ExampleQuestion[]>([]);

    useEffect(() => {
        console.log("useEffect: Updating examples for botId:", botId); // Debug log

        // Handle GPT4V examples first
        if (useGPT4V && GPT4V_EXAMPLES.length) {
            console.log("useEffect: Setting GPT4V examples");
            setExamples(GPT4V_EXAMPLES.slice(0, 3));
            return;
        }

        // Get bot-specific configuration
        const botConfig = BOT_EXAMPLES[botId as keyof typeof BOT_EXAMPLES];
        console.log("useEffect: Bot config found:", botConfig ? "yes" : "no", "for botId:", botId);

        // Fallback to ava if bot not found
        const config = botConfig || BOT_EXAMPLES.ava;
        console.log("useEffect: Using config for bot:", botConfig ? botId : "ava (fallback)");

        const newExamples = pickRandomFromCategories(config.examples, config.count);
        console.log("useEffect: Generated", newExamples.length, "examples");
        setExamples(newExamples);
    }, [botId, useGPT4V]); // Re-run when botId or useGPT4V changes

    return (
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            <h3
                style={{
                    color: "var(--text)",
                    textAlign: "center",
                    marginBottom: "24px",
                    fontSize: "20px",
                    fontWeight: "600"
                }}
            >
                Try asking about...
            </h3>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
                    gap: "16px",
                    padding: "0 20px"
                }}
            >
                {examples.map((example, i) => (
                    <div
                        key={i}
                        onClick={() => onExampleClicked(example.text)}
                        style={{
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                            padding: "20px",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "12px"
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
                            e.currentTarget.style.borderColor = "var(--brand-80)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
                            e.currentTarget.style.borderColor = "var(--border)";
                        }}
                    >
                        <div
                            style={{
                                fontSize: "24px",
                                flexShrink: 0,
                                marginTop: "2px"
                            }}
                        >
                            {example.icon}
                        </div>
                        <div>
                            <div
                                style={{
                                    fontSize: "12px",
                                    color: "var(--brand-80)",
                                    fontWeight: "600",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    marginBottom: "6px"
                                }}
                            >
                                {example.category}
                            </div>
                            <div
                                style={{
                                    color: "var(--text)",
                                    fontSize: "14px",
                                    lineHeight: "1.4",
                                    fontWeight: "500"
                                }}
                            >
                                {example.text}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
