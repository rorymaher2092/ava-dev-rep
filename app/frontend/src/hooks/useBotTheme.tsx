import { useEffect } from "react";
import { BOTS } from "../config/botConfig";

export const useBotTheme = (botId: string) => {
    useEffect(() => {
        const root = document.documentElement;

        // Remove all bot theme classes first
        Object.values(BOTS).forEach(bot => {
            if (bot.themeClass) {
                root.classList.remove(bot.themeClass);
            }
        });

        // Add the selected bot's theme class
        const themeClass = BOTS[botId]?.themeClass;
        if (themeClass) {
            root.classList.add(themeClass);
        }
    }, [botId]);
};
