import avaLogo from "../../assets/ava.svg"; // Import your Ava logo
import { BotProfile, BOTS } from "../../config/botConfig";
import { useBot } from "../../contexts/BotContext";

export const AnswerIcon = () => {
    // Get the bot profile (same logic as in your Answer component)
    const { botId } = useBot();
    const botProfile: BotProfile = BOTS[botId] ?? BOTS["ava"];

    return (
        <img
            src={botProfile?.logo || avaLogo}
            alt={botProfile?.label || "Answer logo"}
            style={{
                width: "28px",
                height: "28px"
            }}
        />
    );
};
