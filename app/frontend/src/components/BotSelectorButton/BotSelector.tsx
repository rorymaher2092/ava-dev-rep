// BotSelector.tsx

import { useBot } from "../../contexts/BotContext";
import { BOTS, BotProfile } from "../../config/botConfig";
import styles from "./BotSelector.module.css";

export interface BotSelectorProps {
    userEmail: string | undefined;
    className?: string;
}

export default function BotSelector({ userEmail, className = "" }: BotSelectorProps) {
    const { botId, setBotId } = useBot(); // ✅ Global context
    const bots = Object.values(BOTS) as BotProfile[];
    const current = (userEmail ?? "").trim().toLowerCase();

    return (
        <select className={`${styles.BotSelectorDropdown} ${className}`.trim()} value={botId} onChange={e => setBotId(e.target.value)}>
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
