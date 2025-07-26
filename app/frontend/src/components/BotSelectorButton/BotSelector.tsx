// BotSelector.tsx
import React, { useState, useRef, useEffect } from "react";
import { useBot } from "../../contexts/BotContext";
import { BOTS, BotProfile, DEFAULT_BOT_ID } from "../../config/botConfig";
import styles from "./BotSelector.module.css";

export interface BotSelectorProps {
    userEmail: string | undefined;
    onChange: (botId: string) => void;
    className?: string;
}

export default function BotSelector({ userEmail, onChange, className = "" }: BotSelectorProps) {
    const { botId, setBotId } = useBot();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const bots = Object.values(BOTS) as BotProfile[];
    const current = (userEmail ?? "").trim().toLowerCase();

    // Get current bot label
    const selectedBot = bots.find(bot => bot.id === botId);
    const selectedLabel = selectedBot ? selectedBot.label : "Select Bot";

    // Handle bot selection
    const handleBotSelect = (selectedBotId: string) => {
        setBotId(selectedBotId);
        setIsOpen(false);
        onChange(selectedBotId);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className={`${styles.botSelector} ${className}`} ref={dropdownRef}>
            <button className={styles.botSelectorButton} onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-haspopup="listbox">
                <span className={styles.botIcon}>🤖</span>
                <span className={styles.botLabel}>{selectedLabel}</span>
                <span className={`${styles.botArrow} ${isOpen ? styles.open : ""}`}>▾</span>
            </button>

            {isOpen && (
                <div className={styles.botDropdown}>
                    {bots.map(bot => {
                        const allowed =
                            bot.id === "ava" || bot.allowed_emails.length === 0 || bot.allowed_emails.map(e => e.trim().toLowerCase()).includes(current);

                        return (
                            <button
                                key={bot.id}
                                className={`${styles.botOption} ${botId === bot.id ? styles.selected : ""} ${!allowed ? styles.disabled : ""}`}
                                onClick={() => allowed && handleBotSelect(bot.id)}
                                disabled={!allowed}
                            >
                                {bot.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
