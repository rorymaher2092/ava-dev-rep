import { useState } from "react";
import { Example } from "./Example";
import styles from "./Example.module.css";

/** ─────────────────────────────────────────────────────────────
 *  Categorized question pools with icons and modern phrasing
 *  ────────────────────────────────────────────────────────────*/

interface ExampleQuestion {
    text: string;
    icon: string;
    category: string;
}

const EXAMPLE_CATEGORIES = {
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
};

const GPT4V_EXAMPLES: ExampleQuestion[] = [
    { text: "Upload a screenshot and explain what this error means", icon: "🖼️", category: "Visual Analysis" },
    { text: "What does this network diagram tell us about latency?", icon: "📈", category: "Visual Analysis" },
    { text: "Identify the compliance icons in this image", icon: "🔍", category: "Visual Analysis" }
];

interface Props {
    onExampleClicked: (value: string) => void;
    useGPT4V?: boolean;
}

/** Picks random examples from different categories */
const pickRandomFromCategories = (categories: Record<string, ExampleQuestion[]>, count = 6): ExampleQuestion[] => {
    const allExamples = Object.values(categories).flat();
    if (allExamples.length <= count) return allExamples;

    const chosen: ExampleQuestion[] = [];
    const used = new Set<number>();

    while (chosen.length < count) {
        const idx = Math.floor(Math.random() * allExamples.length);
        if (!used.has(idx)) {
            used.add(idx);
            chosen.push(allExamples[idx]);
        }
    }
    return chosen;
};

export const ExampleList = ({ onExampleClicked, useGPT4V = false }: Props) => {
    const [examples] = useState<ExampleQuestion[]>(() =>
        useGPT4V && GPT4V_EXAMPLES.length ? GPT4V_EXAMPLES.slice(0, 3) : pickRandomFromCategories(EXAMPLE_CATEGORIES, 6)
    );

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
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
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
