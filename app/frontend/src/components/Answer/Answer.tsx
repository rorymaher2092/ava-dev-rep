import { useMemo, useState } from "react";
import { Stack, IconButton, Dialog, DialogType, DialogFooter, PrimaryButton, DefaultButton, TextField } from "@fluentui/react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useMsal } from "@azure/msal-react";

import styles from "./Answer.module.css";
import { ChatAppResponse, getCitationFilePath, SpeechConfig, submitFeedbackApi } from "../../api";
import { parseAnswerToHtml } from "./AnswerParser";
import avaLogo from "../../assets/ava.svg"; // Ava logo import
import { SpeechOutputBrowser } from "./SpeechOutputBrowser";
import { SpeechOutputAzure } from "./SpeechOutputAzure";

interface Props {
    answer: ChatAppResponse;
    index: number;
    speechConfig: SpeechConfig;
    isSelected?: boolean;
    isStreaming: boolean;
    onCitationClicked: (filePath: string) => void;
    onThoughtProcessClicked: () => void;
    onSupportingContentClicked: () => void;
    //onFollowupQuestionClicked?: (question: string) => void;
    //showFollowupQuestions?: boolean;
    showSpeechOutputBrowser?: boolean;
    showSpeechOutputAzure?: boolean;
}

export const Answer = ({
    answer,
    index,
    speechConfig,
    isSelected,
    isStreaming,
    onCitationClicked,
    onThoughtProcessClicked,
    onSupportingContentClicked,
    //onFollowupQuestionClicked,
    //showFollowupQuestions,
    showSpeechOutputAzure,
    showSpeechOutputBrowser
}: Props) => {
    const followupQuestions = answer.context?.followup_questions;
    const parsedAnswer = useMemo(() => parseAnswerToHtml(answer, isStreaming, onCitationClicked), [answer]);
    const { t } = useTranslation();
    const sanitizedAnswerHtml = DOMPurify.sanitize(parsedAnswer.answerHtml);
    const [copied, setCopied] = useState(false);
    
    // Feedback state
    const [feedbackGiven, setFeedbackGiven] = useState(false);
    const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
    const [feedbackType, setFeedbackType] = useState<"positive" | "negative" | null>(null);
    const [feedbackComments, setFeedbackComments] = useState("");
    const { instance } = useMsal();

    const handleCopy = () => {
        // Single replace to remove all HTML tags to remove the citations
        const textToCopy = sanitizedAnswerHtml.replace(/<a [^>]*><sup>\d+<\/sup><\/a>|<[^>]+>/g, "");

        navigator.clipboard
            .writeText(textToCopy)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => console.error("Failed to copy text: ", err));
    };
    
    // Feedback handling functions
    const handleFeedback = async (type: "positive" | "negative") => {
        setFeedbackType(type);
        if (type === "positive") {
            // For positive feedback, submit directly without comments
            try {
                const token = await instance.acquireTokenSilent({
                    scopes: ["User.Read"],
                    account: instance.getActiveAccount() || undefined
                }).catch(() => null);
                
                await submitFeedbackApi(
                    `answer-${index}`, 
                    type, 
                    "", 
                    token?.accessToken
                );
                setFeedbackGiven(true);
            } catch (error) {
                console.error("Error submitting feedback:", error);
            }
        } else {
            // For negative feedback, open dialog to collect comments
            setShowFeedbackDialog(true);
        }
    };
    
    const submitFeedback = async () => {
        if (!feedbackType) return;
        
        try {
            const token = await instance.acquireTokenSilent({
                scopes: ["User.Read"],
                account: instance.getActiveAccount() || undefined
            }).catch(() => null);
            
            await submitFeedbackApi(
                `answer-${index}`, 
                feedbackType, 
                feedbackComments, 
                token?.accessToken
            );
            setFeedbackGiven(true);
            setShowFeedbackDialog(false);
        } catch (error) {
            console.error("Error submitting feedback:", error);
        }
    };

    // Dialog configuration
    const dialogContentProps = {
        type: DialogType.normal,
        title: "Provide Feedback",
        subText: "Please let us know how we can improve this response."
    };

    return (
        <Stack className={`${styles.answerContainer} ${isSelected && styles.selected}`} verticalAlign="space-between">
            <Stack.Item>
                <Stack horizontal horizontalAlign="space-between">
                    {/* Replace the AnswerIcon with Ava logo */}
                    <img src={avaLogo} alt="Ava Logo" style={{ width: "30px", height: "30px", marginRight: "10px", filter: "var(--logo-filter, none)" }} />
                    <div>
                        <IconButton
                            style={{ color: "var(--text)" }}
                            iconProps={{ iconName: copied ? "CheckMark" : "Copy" }}
                            title={copied ? t("tooltips.copied") : t("tooltips.copy")}
                            ariaLabel={copied ? t("tooltips.copied") : t("tooltips.copy")}
                            onClick={handleCopy}
                        />
                        <IconButton
                            style={{ 
                                color: "var(--text)",
                                backgroundColor: isStreaming ? "transparent" : undefined
                            }}
                            iconProps={{ iconName: "Lightbulb" }}
                            title={t("tooltips.showThoughtProcess")}
                            ariaLabel={t("tooltips.showThoughtProcess")}
                            onClick={() => onThoughtProcessClicked()}
                            disabled={!answer.context.thoughts?.length || isStreaming}
                        />
                        <IconButton
                            style={{ 
                                color: "var(--text)",
                                backgroundColor: isStreaming ? "transparent" : undefined
                            }}
                            iconProps={{ iconName: "ClipboardList" }}
                            title={t("tooltips.showSupportingContent")}
                            ariaLabel={t("tooltips.showSupportingContent")}
                            onClick={() => onSupportingContentClicked()}
                            disabled={!answer.context.data_points || isStreaming}
                        />
                        {showSpeechOutputAzure && (
                            <SpeechOutputAzure answer={sanitizedAnswerHtml} index={index} speechConfig={speechConfig} isStreaming={isStreaming} />
                        )}
                        {showSpeechOutputBrowser && <SpeechOutputBrowser answer={sanitizedAnswerHtml} />}
                    </div>
                </Stack>
            </Stack.Item>

            <Stack.Item grow>
                <div className={styles.answerText}>
                    <ReactMarkdown children={sanitizedAnswerHtml} rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]} />
                </div>
            </Stack.Item>

            {/* Feedback buttons */}
            {!isStreaming && !feedbackGiven && (
                <Stack.Item>
                    <Stack horizontal tokens={{ childrenGap: 10 }} style={{ marginTop: '10px' }}>
                        <span>Was this response helpful?</span>
                        <IconButton
                            iconProps={{ iconName: "Like" }}
                            title="This was helpful"
                            onClick={() => handleFeedback("positive")}
                        />
                        <IconButton
                            iconProps={{ iconName: "Dislike" }}
                            title="This needs improvement"
                            onClick={() => handleFeedback("negative")}
                        />
                    </Stack>
                </Stack.Item>
            )}

            {/* Thank you message after feedback */}
            {feedbackGiven && (
                <Stack.Item>
                    <div style={{ marginTop: '10px', color: 'var(--text)' }}>
                        Thank you for your feedback!
                    </div>
                </Stack.Item>
            )}

            {/* Citations */}
            {!!parsedAnswer.citations.length && (
                <Stack.Item>
                    <Stack horizontal wrap tokens={{ childrenGap: 5 }}>
                        <span className={styles.citationLearnMore}>{t("citationWithColon")}</span>
                        {parsedAnswer.citations.map((x, i) => {
                            const path = getCitationFilePath(x);
                            return (
                                <a key={i} className={styles.citation} title={x} onClick={() => onCitationClicked(path)}>
                                    {`${++i}. ${x}`}
                                </a>
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}

            {/* Feedback dialog */}
            <Dialog
                hidden={!showFeedbackDialog}
                onDismiss={() => setShowFeedbackDialog(false)}
                dialogContentProps={dialogContentProps}
                modalProps={{ isBlocking: false }}
            >
                <TextField
                    label="Comments"
                    multiline
                    rows={4}
                    value={feedbackComments}
                    onChange={(_, newValue) => setFeedbackComments(newValue || "")}
                    placeholder="Please tell us how we can improve this response..."
                />
                <DialogFooter>
                    <PrimaryButton onClick={submitFeedback} text="Submit" />
                    <DefaultButton onClick={() => setShowFeedbackDialog(false)} text="Cancel" />
                </DialogFooter>
            </Dialog>
        </Stack>
    );
};