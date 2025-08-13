import { useState, useEffect, useContext } from "react";
import { Stack, TextField } from "@fluentui/react";
import { Button, Tooltip } from "@fluentui/react-components";
import { Send28Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import styles from "./QuestionInput.module.css";
import { SpeechInput } from "./SpeechInput";
import { LoginContext } from "../../loginContext";
import { requireLogin } from "../../authConfig";
import { CompactArtifactSelector } from "../ArtifactSelector/CompactArtitfactSelector";
import { useBot } from "../../contexts/BotContext"

interface Props {
    onSend: (question: string) => void;
    disabled: boolean;
    initQuestion?: string;
    placeholder?: string;
    clearOnSend?: boolean;
    showSpeechInput?: boolean;
    // adding imports for followupQuestions
    followupQuestions?: string[]; // Array of follow-up questions
    onFollowupQuestionClicked?: (question: string) => void; // Callback for follow-up question click
}

export const QuestionInput = ({
    onSend,
    disabled,
    placeholder,
    clearOnSend,
    initQuestion,
    showSpeechInput,
    followupQuestions,
    onFollowupQuestionClicked
}: Props) => {
    const [question, setQuestion] = useState<string>("");
    const { loggedIn } = useContext(LoginContext);
    const { botId } = useBot();
    const { t } = useTranslation();
    const [isComposing, setIsComposing] = useState(false);

    useEffect(() => {
        initQuestion && setQuestion(initQuestion);
    }, [initQuestion]);

    const sendQuestion = () => {
        if (disabled || !question.trim()) {
            return;
        }

        onSend(question);

        if (clearOnSend) {
            setQuestion("");
        }
    };

    const onEnterPress = (ev: React.KeyboardEvent<Element>) => {
        if (isComposing) return;

        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            sendQuestion();
        }
    };

    const handleCompositionStart = () => {
        setIsComposing(true);
    };
    const handleCompositionEnd = () => {
        setIsComposing(false);
    };

    const onQuestionChange = (_ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        if (!newValue) {
            setQuestion("");
        } else if (newValue.length <= 1000) {
            setQuestion(newValue);
        }
    };

    const disableRequiredAccessControl = requireLogin && !loggedIn;
    const sendQuestionDisabled = disabled || !question.trim() || disableRequiredAccessControl;

    if (disableRequiredAccessControl) {
        placeholder = "Please login to continue...";
    }

    return (
        <div className={styles.questionInputWrapper}>
            
            {botId === 'ba' && <CompactArtifactSelector />}
            {/* Follow-up questions above the input box */}
            {!!followupQuestions?.length && (
                <Stack horizontal wrap tokens={{ childrenGap: 16 }} className={styles.followupQuestionsWrapper}>
                    {followupQuestions.map((question, index) => (
                        <button 
                            key={index} 
                            className={styles.followupQuestion} 
                            title={question} 
                            onClick={() => onFollowupQuestionClicked?.(question)}
                            type="button"
                        >
                            {question}
                        </button>
                    ))}
                </Stack>
            )}

            {/* Input container */}
            <Stack horizontal className={styles.questionInputContainer}>
                <TextField
                    className={styles.questionInputTextArea}
                    disabled={disableRequiredAccessControl}
                    placeholder={placeholder}
                    multiline
                    resizable={false}
                    borderless
                    value={question}
                    onChange={onQuestionChange}
                    onKeyDown={onEnterPress}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    aria-label={placeholder || "Ask a question"}
                    maxLength={1000}
                />
                <div className={styles.questionInputButtonsContainer}>
                    <div className={styles.customTooltip}>{t("tooltips.submitQuestion")}</div>
                    <Button
                        size="large"
                        icon={<Send28Filled primaryFill="rgba(115, 118, 225, 1)" />}
                        disabled={sendQuestionDisabled}
                        onClick={sendQuestion}
                        aria-label={t("tooltips.submitQuestion")}
                    />
                </div>
                {showSpeechInput && <SpeechInput updateQuestion={setQuestion} />}
            </Stack>
        </div>
    );
};
