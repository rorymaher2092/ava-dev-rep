import React, { createContext, useContext, useState, ReactNode } from "react";
import { DEFAULT_BOT_ID } from "../config/botConfig";

// Define the shape of the context
interface BotContextProps {
    botId: string;
    setBotId: (id: string) => void;
}

// Create the context with default undefined to enforce provider usage
const BotContext = createContext<BotContextProps | undefined>(undefined);

// Create a hook for easier access
export const useBot = () => {
    const context = useContext(BotContext);
    if (!context) {
        throw new Error("useBot must be used within a BotProvider");
    }
    return context;
};

// Create the provider component
export const BotProvider = ({ children }: { children: ReactNode }) => {
    const [botId, setBotId] = useState<string>(DEFAULT_BOT_ID);

    return <BotContext.Provider value={{ botId, setBotId }}>{children}</BotContext.Provider>;
};
