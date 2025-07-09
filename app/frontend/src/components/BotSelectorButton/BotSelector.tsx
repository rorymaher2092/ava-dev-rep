import { useBot } from "../../contexts/BotContext"; // Import the context to manage bot state
import { BOTS, BotProfile, DEFAULT_BOT_ID } from "../../config/botConfig";
import styles from "./BotSelector.module.css";

export interface BotSelectorProps {
    userEmail: string | undefined; // This will be used for access control
    onChange: (botId: string) => void; // onChange prop to handle bot change
    className?: string; // Allow custom styling via className
}

export default function BotSelector({
    userEmail,
    onChange,
    className = "" // Default value for className is an empty string
}: BotSelectorProps) {
    // Use the useBot context to access the current botId and setBotId function
    const { botId, setBotId } = useBot();

    // Get the list of all available bots from your botConfig
    const bots = Object.values(BOTS) as BotProfile[];

    // Normalize user email to lowercase for comparison (if not undefined)
    const current = (userEmail ?? "").trim().toLowerCase();

    // Handle the bot selection change by updating the context
    const handleBotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedBotId = e.target.value; // Get the botId selected by the user
        setBotId(selectedBotId); // Update the botId in the context
    };

    return (
        <select
            // Apply the custom styles along with any additional classes passed via className
            className={`${styles.selectDropdown} ${className}`.trim()}
            value={botId} // Set the currently selected botId from the context
            onChange={handleBotChange} // When selection changes, update the context with the new botId
        >
            {bots.map(bot => {
                // Check if the current user is allowed to access this bot based on allowed_emails
                const allowed =
                    bot.id === "ava" ||
                    bot.allowed_emails.length === 0 ||
                    bot.allowed_emails
                        .map(e => e.trim().toLowerCase()) // Normalize the emails to lowercase
                        .includes(current); // If the current user is in allowed_emails, this bot is enabled

                return (
                    <option key={bot.id} value={bot.id} disabled={!allowed}>
                        {bot.label} // Display bot label (name)
                    </option>
                );
            })}
        </select>
    );
}
