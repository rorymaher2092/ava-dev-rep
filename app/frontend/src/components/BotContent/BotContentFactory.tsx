// src/components/BotContent/BotContentFactory.tsx
import React from "react";
import { BotContentProps } from "./BotContent";
import { AvaSearchContent } from "./AvaSearchContent";
import { BAAssistantContent } from "./BAAssistantContent";
import { TenderAssistantContent } from "./TenderWizard";

const botContentInstances = {
    ava: new AvaSearchContent(),
    ba: new BAAssistantContent(),
    tender: new TenderAssistantContent()
};

export const BotContentFactory = {
    render: (botId: string, props: BotContentProps): React.ReactNode => {
        const contentInstance = botContentInstances[botId as keyof typeof botContentInstances] || botContentInstances.ava; // Default fallback

        return contentInstance.render(props);
    },

    getConfig: (botId: string) => {
        const contentInstance = botContentInstances[botId as keyof typeof botContentInstances] || botContentInstances.ava;

        return contentInstance.getConfig();
    }
};
