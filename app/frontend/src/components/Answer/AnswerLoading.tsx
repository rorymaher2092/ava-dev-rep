import { Stack } from "@fluentui/react";
import { animated, useSpring } from "@react-spring/web";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";

import styles from "./Answer.module.css";
import avaLogo from "../../assets/ava.svg"; // Import your Ava logo
import { BotProfile, BOTS } from "../../config/botConfig";
import { useBot } from "../../contexts/BotContext";

export const AnswerLoading = () => {
    const { t, i18n } = useTranslation();
    const [showStillThinking, setShowStillThinking] = useState(false);

    const animatedStyles = useSpring({
        from: { opacity: 0 },
        to: { opacity: 1 }
    });

    // Set up timer to change message after 5 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowStillThinking(true);
        }, 5000); // 5000 milliseconds = 5 seconds

        // Clean up the timer if the component unmounts before 5 seconds
        return () => clearTimeout(timer);
    }, []); // Empty dependency array means this runs once when component mounts

    // Get the bot profile (same logic as in your Answer component)
    const { botId } = useBot();
    const botProfile: BotProfile = BOTS[botId] ?? BOTS["ava"];

    return (
        <animated.div style={{ ...animatedStyles }}>
            <Stack className={styles.answerContainer} verticalAlign="space-between">
                <div className={styles.answerLogo}>
                    {/* Replace the Sparkle icon with your bot logo */}
                    <div
                        style={{
                            width: "28px", // Same size as the Sparkle28Filled icon
                            height: "28px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}
                    >
                        <img
                            src={botProfile?.logo || avaLogo}
                            alt={botProfile?.label || "Bot"}
                            style={{
                                width: "28px",
                                height: "28px"
                            }}
                        />
                    </div>
                </div>
                <Stack.Item grow>
                    <p className={styles.answerText}>
                        {showStillThinking ? "Still thinking" : t("generatingAnswer")}
                        <span className={styles.loadingdots} />
                    </p>
                </Stack.Item>
            </Stack>
        </animated.div>
    );
};
