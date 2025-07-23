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

// Ensure you are importing the correct bot logo from your BotConfig
import { BotProfile, BOTS } from "../../config/botConfig";
import { useBot } from "../../contexts/BotContext";

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
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    //select correct bot image
    const { botId } = useBot(); // Access botId from the BotContext
    const botProfile: BotProfile = BOTS[botId] ?? BOTS["ava"]; // Default to Ava if botProfile is undefined

    // Feedback state
    const [feedbackGiven, setFeedbackGiven] = useState(false);
    const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
    const [feedbackType, setFeedbackType] = useState<"positive" | "negative" | null>(null);
    const [feedbackComments, setFeedbackComments] = useState("");
    const { instance } = useMsal();

    // Helper function to parse citation details
    const getCitationDetails = (citation: string): { url: string; title: string; isUrl: boolean } => {
        // Check for our special format: "url|||title"
        if (citation.includes("|||")) {
            const [url, title] = citation.split("|||");
            return { url, title, isUrl: true };
        }

        // Check if it's a plain URL
        try {
            new URL(citation);
            if (citation.startsWith("http://") || citation.startsWith("https://")) {
                return { url: citation, title: "Confluence Page", isUrl: true };
            }
        } catch {
            // Not a URL
        }

        // It's a file citation - extract filename
        const filename = citation.split("/").pop() || citation;
        return { url: citation, title: filename, isUrl: false };
    };

    // Update the handleCitationClick function
    const handleCitationClick = (citation: string) => {
        const details = getCitationDetails(citation);

        if (details.isUrl) {
            // Open URLs in a new tab
            window.open(details.url, "_blank", "noopener,noreferrer");
        } else {
            // Handle file citations with existing handler
            const path = getCitationFilePath(citation);
            onCitationClicked(path);
        }
    };

    const parsedAnswer = useMemo(() => parseAnswerToHtml(answer, isStreaming, handleCitationClick), [answer, isStreaming]);
    const sanitizedAnswerHtml = DOMPurify.sanitize(parsedAnswer.answerHtml);

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
                const token = await instance
                    .acquireTokenSilent({
                        scopes: ["User.Read"],
                        account: instance.getActiveAccount() || undefined
                    })
                    .catch(() => null);

                await submitFeedbackApi(`answer-${index}`, type, "", token?.accessToken);
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
            const token = await instance
                .acquireTokenSilent({
                    scopes: ["User.Read"],
                    account: instance.getActiveAccount() || undefined
                })
                .catch(() => null);

            await submitFeedbackApi(`answer-${index}`, feedbackType, feedbackComments, token?.accessToken);
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
        <div
            style={{
                display: "flex",
                justifyContent: "flex-start",
                marginBottom: "16px"
            }}
        >
            <div
                style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    padding: "20px",
                    maxWidth: "85%",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                    position: "relative"
                }}
            >
                {/* Header with logo and actions */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "16px"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                            style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "50%",
                                background: "var(--surface-hover)",
                                border: "2px solid var(--border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "6px"
                            }}
                        >
                            <img src={botProfile?.logo || avaLogo} alt={botProfile?.label || "Bot"} style={{ width: "28px", height: "28px" }} />
                        </div>
                        <div>
                            <div
                                style={{
                                    color: "var(--text)",
                                    fontWeight: "600",
                                    fontSize: "16px"
                                }}
                            >
                                {botProfile?.label || "Ava"}
                            </div>
                            <div
                                style={{
                                    color: "var(--text-secondary)",
                                    fontSize: "12px"
                                }}
                            >
                                AI Assistant
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: "4px" }}>
                        <button
                            onClick={handleCopy}
                            style={{
                                backgroundColor: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "8px",
                                color: "var(--text)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "12px",
                                transition: "all 0.2s ease"
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                            title={copied ? t("tooltips.copied") : t("tooltips.copy")}
                        >
                            {copied ? "✓" : "📋"}
                        </button>

                        <button
                            onClick={() => onThoughtProcessClicked()}
                            disabled={!answer.context.thoughts?.length || isStreaming}
                            style={{
                                backgroundColor: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "8px",
                                color: "var(--text)",
                                cursor: "pointer",
                                fontSize: "12px",
                                transition: "all 0.2s ease",
                                opacity: !answer.context.thoughts?.length || isStreaming ? 0.5 : 1
                            }}
                            onMouseEnter={e => {
                                if (!e.currentTarget.disabled) {
                                    e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                                }
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                            title={t("tooltips.showThoughtProcess")}
                        >
                            💡
                        </button>

                        <button
                            onClick={() => onSupportingContentClicked()}
                            disabled={!answer.context.data_points || isStreaming}
                            style={{
                                backgroundColor: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "8px",
                                color: "var(--text)",
                                cursor: "pointer",
                                fontSize: "12px",
                                transition: "all 0.2s ease",
                                opacity: !answer.context.data_points || isStreaming ? 0.5 : 1
                            }}
                            onMouseEnter={e => {
                                if (!e.currentTarget.disabled) {
                                    e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                                }
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                            title={t("tooltips.showSupportingContent")}
                        >
                            📄
                        </button>

                        {showSpeechOutputAzure && (
                            <SpeechOutputAzure answer={sanitizedAnswerHtml} index={index} speechConfig={speechConfig} isStreaming={isStreaming} />
                        )}
                        {showSpeechOutputBrowser && <SpeechOutputBrowser answer={sanitizedAnswerHtml} />}
                    </div>
                </div>

                {/* Answer content */}
                <div
                    style={{
                        color: "var(--text)",
                        lineHeight: "1.6",
                        fontSize: "15px"
                    }}
                >
                    <ReactMarkdown children={sanitizedAnswerHtml} rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]} />
                </div>

                {/* Feedback section */}
                {!isStreaming && (
                    <div
                        style={{
                            marginTop: "20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}
                    >
                        {!feedbackGiven ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Was this helpful?</span>
                                <button
                                    onClick={() => handleFeedback("positive")}
                                    style={{
                                        backgroundColor: "transparent",
                                        border: "1px solid var(--border)",
                                        borderRadius: "20px",
                                        padding: "6px 12px",
                                        color: "var(--text)",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        fontSize: "14px",
                                        transition: "all 0.2s ease"
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = "rgba(40, 167, 69, 0.1)";
                                        e.currentTarget.style.borderColor = "#28a745";
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                        e.currentTarget.style.borderColor = "var(--border)";
                                    }}
                                >
                                    👍 Yes
                                </button>
                                <button
                                    onClick={() => handleFeedback("negative")}
                                    style={{
                                        backgroundColor: "transparent",
                                        border: "1px solid var(--border)",
                                        borderRadius: "20px",
                                        padding: "6px 12px",
                                        color: "var(--text)",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        fontSize: "14px",
                                        transition: "all 0.2s ease"
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = "rgba(220, 53, 69, 0.1)";
                                        e.currentTarget.style.borderColor = "#dc3545";
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                        e.currentTarget.style.borderColor = "var(--border)";
                                    }}
                                >
                                    👎 No
                                </button>
                            </div>
                        ) : (
                            <div
                                style={{
                                    color: "var(--primary)",
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px"
                                }}
                            >
                                ✓ Thank you for your feedback!
                            </div>
                        )}
                    </div>
                )}

                {/* Citations with URL support */}
                {!!parsedAnswer.citations.length && (
                    <div style={{ marginTop: "16px" }}>
                        <div
                            style={{
                                color: "var(--text-secondary)",
                                fontSize: "12px",
                                marginBottom: "8px",
                                fontWeight: "600",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px"
                            }}
                        >
                            {t("citationWithColon")}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {parsedAnswer.citations.map((citation, i) => {
                                const details = getCitationDetails(citation);
                                const icon = details.isUrl ? "🔗" : "📄";

                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleCitationClick(citation)}
                                        title={details.isUrl ? `Open ${details.title} in new tab` : details.title}
                                        style={{
                                            backgroundColor: "var(--surface-hover)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "12px",
                                            padding: "6px 12px",
                                            color: "var(--primary)",
                                            cursor: "pointer",
                                            fontSize: "13px",
                                            fontWeight: "500",
                                            transition: "all 0.2s ease",
                                            maxWidth: "400px",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px"
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.backgroundColor = "var(--primary)";
                                            e.currentTarget.style.color = "white";
                                            e.currentTarget.style.transform = "translateY(-1px)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                                            e.currentTarget.style.color = "var(--primary)";
                                            e.currentTarget.style.transform = "translateY(0)";
                                        }}
                                    >
                                        <span>{icon}</span>
                                        <span>{`${i + 1}. ${details.title}`}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
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
            </div>
        </div>
    );
};
