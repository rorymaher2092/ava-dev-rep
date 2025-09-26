/**
 * Front-end copy of the bot profiles that also exist on the server.
 * ⚠️  Keep ids / labels / palette classes in sync with backend/bot_profiles.py
 */

import avaBlue from "../assets/ava.svg";
import avaOrange from "../assets/ava-orange.png";
import avaGreen from "../assets/ava-green.png"; // add your file

export interface BotProfile {
    id: string;
    label: string;
    themeClass: string; // CSS class that sets --brand tokens
    logo: string; // path to the logo image
    allowed_emails: string[]; // empty ⇒ open to everyone
    supportsAttachments?: boolean; // whether this bot supports attachments
}

export const BOTS: Record<string, BotProfile> = {
    ava: {
        id: "ava",
        label: "Ava – Search",
        themeClass: "theme-blue", // you already style blue as default
        logo: avaBlue,
        allowed_emails: [],
        supportsAttachments: false
    },
    ba: {
        id: "ba",
        label: "Accelerate Assistant",
        themeClass: "theme-green",
        logo: avaGreen,
        allowed_emails: [],
        supportsAttachments: true
    },
    tender: {
        id: "tender",
        label: "Coming Soon!",
        themeClass: "theme-orange",
        logo: avaOrange,
        allowed_emails: ["Rory.Maher@vocus.com.au"],
        supportsAttachments: false
    }
};

export const DEFAULT_BOT_ID = "ava";
export const DEFAULT_BOT_PROFILE = BOTS[DEFAULT_BOT_ID];
