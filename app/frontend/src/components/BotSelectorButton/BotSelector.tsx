import { useBot } from "../../contexts/BotContext"; // Import the context if not already
import { BOTS, BotProfile, DEFAULT_BOT_ID } from "../../config/botConfig";
import styles from "./BotSelector.module.css";

export interface BotSelectorProps {
    value?: string;
    userEmail: string | undefined;
    onChange: (botId: string) => void;
    /** allow parent to pass extra classes */
    className?: string;
}

export default function BotSelector({
    value = DEFAULT_BOT_ID,
    userEmail,
    onChange,
    className = "" // ← NEW
}: BotSelectorProps) {
    const bots = Object.values(BOTS) as BotProfile[];
    const current = (userEmail ?? "").trim().toLowerCase();

    return (
        <select
            /* merge the two class names */
            className={`${styles.selectDropdown} ${className}`.trim()} // Apply the new class here
            value={value}
            onChange={e => onChange(e.target.value)}
        >
            {bots.map(bot => {
                const allowed = bot.id === "ava" || bot.allowed_emails.length === 0 || bot.allowed_emails.map(e => e.trim().toLowerCase()).includes(current);
                return (
                    <option key={bot.id} value={bot.id} disabled={!allowed}>
                        {bot.label}
                    </option>
                );
            })}
        </select>
    );
}
