import { Stack } from "@fluentui/react";
import { animated, useSpring } from "@react-spring/web";
import { useTranslation } from "react-i18next";
import { Sparkle28Filled } from "@fluentui/react-icons";

import styles from "./Answer.module.css";

export const AnswerLoading = () => {
    const { t, i18n } = useTranslation();
    const animatedStyles = useSpring({
        from: { opacity: 0 },
        to: { opacity: 1 }
    });

    return (
        <animated.div style={{ ...animatedStyles }}>
            <Stack className={styles.answerContainer} verticalAlign="space-between">
                <div className={styles.answerLogo}>
                    <Sparkle28Filled primaryFill={"rgba(115, 118, 225, 1)"} aria-hidden="true" aria-label="Answer logo" />
                </div>
                <Stack.Item grow>
                    <p className={styles.answerText}>
                        {t("generatingAnswer")}
                        <span className={styles.loadingdots} />
                    </p>
                </Stack.Item>
            </Stack>
        </animated.div>
    );
};
