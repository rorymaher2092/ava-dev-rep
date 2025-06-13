import { useState } from "react";
import { Example } from "./Example";
import styles from "./Example.module.css";

/** ─────────────────────────────────────────────────────────────
 *  Master question pools – expand or edit as needed
 *  ────────────────────────────────────────────────────────────*/
const DEFAULT_EXAMPLES: string[] = [
    "What Information Classification labels do Vocus use?",
    "What is the Hybrid-Ways-of-Working policy?",
    "Who do I contact for Paid Parental Leave information?",
    "Where can I find the Travel Policy?",
    "How do I connect to the VPN?",
    "Can you tell me how to access the Excel Data Cubes?",
    "Where can I locate the brand guidelines?",
    "What does VIE Stand for?",
    "Give a detailed overview of the Data loss prevention policy including Vocus DLP requirements?",
    "What are the risks involved in implementing a new product or solution, and how can they be mitigated?",
    "What are the recommended steps for writing an engaging and credible communication plan for a change initiative?",
    "Are there policies in place for employees or stakeholders to anonymously report concerns about modern slavery or workplace grievances?",
    "What types of incidents are classified as a major incident?"
];

const GPT4V_EXAMPLES: string[] = [
    "Upload a screenshot of the error and explain what it means.",
    "What does this diagram tell us about the network latency?",
    "Identify the compliance icons in this image."
];

interface Props {
    onExampleClicked: (value: string) => void;
    useGPT4V?: boolean;
}

/** Picks `count` unique random items from `pool` */
const pickRandom = (pool: string[], count = 3): string[] => {
    if (pool.length <= count) return pool; // nothing to randomise
    const chosen: string[] = [];
    const used = new Set<number>();

    while (chosen.length < count) {
        const idx = Math.floor(Math.random() * pool.length);
        if (!used.has(idx)) {
            used.add(idx);
            chosen.push(pool[idx]);
        }
    }
    return chosen;
};

export const ExampleList = ({ onExampleClicked, useGPT4V = false }: Props) => {
    // Initialiser function runs exactly once per component mount
    const [examples] = useState<string[]>(() => pickRandom(useGPT4V && GPT4V_EXAMPLES.length ? GPT4V_EXAMPLES : DEFAULT_EXAMPLES, 3));

    return (
        <ul className={styles.examplesNavList}>
            {examples.map((question, i) => (
                <li key={i}>
                    <Example text={question} value={question} onClick={onExampleClicked} />
                </li>
            ))}
        </ul>
    );
};
