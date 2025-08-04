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
import { submitContentSuggestion } from "../../api";

// Ensure you are importing the correct bot logo from your BotConfig
import { BotProfile, BOTS } from "../../config/botConfig";
import { useBot } from "../../contexts/BotContext";

// ADD THESE IMPORTS FOR YOUR NEW ICONS
import confluenceLogo from "../../assets/confluenec-logo.png";
import pdfIcon from "../../assets/pdf-icon.png"; // Replace with your actual PDF icon path
import { TextFieldBase } from "@fluentui/react";

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
    userQuestion?: string; // Pass the user's question to the component
    onContentSuggestion?: (suggestion: string, questionAsked: string) => void;
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
    showSpeechOutputBrowser,
    userQuestion,
    onContentSuggestion
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
    const getCitationDetails = (citation: string): { url: string; title: string; isConfluence: boolean } => {
        // Check for Confluence link marker
        if (citation.startsWith("CONFLUENCE_LINK|||")) {
            const parts = citation.substring("CONFLUENCE_LINK|||".length).split("|||");
            if (parts.length >= 2) {
                const url = parts[0];
                let title = parts[1];

                // Decode URL-encoded characters
                try {
                    title = decodeURIComponent(title.replace(/\+/g, " "));
                } catch (e) {
                    title = title.replace(/\+/g, " ");
                }

                return { url, title, isConfluence: true };
            }
        }

        // Everything else is Azure PDF
        const filename = citation.split("/").pop() || citation;
        return { url: citation, title: filename, isConfluence: false };
    };

    // Add this enhanced handleCitationClick function to your Answer component
    const handleCitationClick = (citation: string) => {
        console.log("Citation clicked:", citation);

        // Additional validation before processing
        if (!citation || citation.trim().length === 0) {
            console.error("Empty citation clicked");
            return;
        }

        const details = getCitationDetails(citation);

        // Validate the citation format one more time
        if (details.isConfluence) {
            // Validate Confluence URL
            try {
                const url = new URL(details.url);
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                    console.error("Invalid Confluence URL protocol:", details.url);
                    return;
                }

                // Check for valid Confluence domains (customize this list)
                const validDomains = ["atlassian.net", "confluence.com", "vocus.atlassian.net"];
                const isValidDomain = validDomains.some(domain => url.hostname.includes(domain));

                if (!isValidDomain) {
                    console.warn(`Opening external URL: ${url.hostname}`);
                    // You might want to show a confirmation dialog here
                }

                // Open Confluence links in a new tab
                window.open(details.url, "_blank", "noopener,noreferrer");
            } catch (error) {
                console.error("Invalid Confluence URL:", details.url, error);
                // Optionally show an error message to the user
                alert("Unable to open this link. The URL appears to be invalid.");
            }
        } else {
            // Validate Azure PDF citation
            const pdfRegex = /^[^\/\\]+\.pdf(?:#page=\d+)?$/i;
            if (!pdfRegex.test(citation)) {
                console.error("Invalid PDF citation format:", citation);
                return;
            }

            // Check if the citation looks like a URL (common mistake)
            if (citation.includes("http://") || citation.includes("https://") || citation.includes("|||")) {
                console.error("PDF citation contains invalid characters:", citation);
                return;
            }

            // Handle Azure PDFs with existing handler
            try {
                const path = getCitationFilePath(citation);
                onCitationClicked(path);
            } catch (error) {
                console.error("Error getting citation file path:", citation, error);
                // Optionally show an error message to the user
                alert("Unable to open this document. Please try again later.");
            }
        }
    };

    const [showContentSuggestion, setShowContentSuggestion] = useState(false);
    const [contentSuggestion, setContentSuggestion] = useState("");
    const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);

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

    const handleContentSuggestionSubmit = async () => {
        if (!contentSuggestion.trim()) return;

        setIsSubmittingSuggestion(true);

        try {
            // Get the original question from the conversation
            const userQuestion = answer.message.content; // You might need to pass this from parent

            // Call the API to save the suggestion
            if (onContentSuggestion) {
                await onContentSuggestion(contentSuggestion, userQuestion);
            }

            // Clear and close the form
            setContentSuggestion("");
            setShowContentSuggestion(false);

            // Show success message (you could also use a toast notification)
            alert("Thank you! Your content suggestion has been submitted.");
        } catch (error) {
            console.error("Error submitting content suggestion:", error);
            alert("Sorry, there was an error submitting your suggestion. Please try again.");
        } finally {
            setIsSubmittingSuggestion(false);
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
                marginBottom: "16px",
                minWidth: "webkit-fill-available"
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
                    position: "relative",
                    width: "85%"
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
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "12px"
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            {!feedbackGiven ? (
                                <>
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

                                    {/* Add Content button - only show if knowledge gap detected */}
                                    {parsedAnswer.hasKnowledgeGap && (
                                        <button
                                            onClick={() => setShowContentSuggestion(!showContentSuggestion)}
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
                                                e.currentTarget.style.backgroundColor = "rgba(0, 123, 255, 0.1)";
                                                e.currentTarget.style.borderColor = "#007bff";
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.backgroundColor = "transparent";
                                                e.currentTarget.style.borderColor = "var(--border)";
                                            }}
                                        >
                                            ➕ Content Suggetion
                                        </button>
                                    )}
                                </>
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

                        {/* Content suggestion dropdown */}
                        {showContentSuggestion && parsedAnswer.hasKnowledgeGap && (
                            <div
                                style={{
                                    width: "100%",
                                    marginTop: "12px",
                                    padding: "16px",
                                    backgroundColor: "var(--surface-hover)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "12px"
                                }}
                            >
                                <div style={{ marginBottom: "12px", color: "var(--text)", fontSize: "14px", fontWeight: "500" }}>
                                    Do you have a question you would like answered?!
                                </div>
                                <textarea
                                    value={contentSuggestion}
                                    onChange={e => setContentSuggestion(e.target.value)}
                                    placeholder="What Question would you like Ava to Answer..."
                                    style={{
                                        width: "100%",
                                        minHeight: "80px",
                                        padding: "8px 12px",
                                        border: "1px solid var(--border)",
                                        borderRadius: "8px",
                                        backgroundColor: "var(--surface)",
                                        color: "var(--text)",
                                        fontSize: "14px",
                                        resize: "vertical",
                                        fontFamily: "inherit"
                                    }}
                                />
                                <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                                    <button
                                        onClick={handleContentSuggestionSubmit}
                                        disabled={!contentSuggestion.trim() || isSubmittingSuggestion}
                                        style={{
                                            padding: "6px 16px",
                                            backgroundColor: "var(--primary)",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "6px",
                                            cursor: contentSuggestion.trim() && !isSubmittingSuggestion ? "pointer" : "not-allowed",
                                            fontSize: "14px",
                                            fontWeight: "500",
                                            opacity: !contentSuggestion.trim() || isSubmittingSuggestion ? 0.6 : 1,
                                            transition: "all 0.2s ease"
                                        }}
                                    >
                                        {isSubmittingSuggestion ? "Submitting..." : "Submit"}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowContentSuggestion(false);
                                            setContentSuggestion("");
                                        }}
                                        style={{
                                            padding: "6px 16px",
                                            backgroundColor: "transparent",
                                            color: "var(--text)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "6px",
                                            cursor: "pointer",
                                            fontSize: "14px",
                                            fontWeight: "500",
                                            transition: "all 0.2s ease"
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
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
                                const icon = details.isConfluence ? (
                                    <img
                                        src={confluenceLogo}
                                        alt="Confluence"
                                        style={{
                                            width: "16px",
                                            height: "16px",
                                            objectFit: "contain" // This ensures the image scales properly
                                        }}
                                    />
                                ) : (
                                    <img
                                        src={pdfIcon}
                                        alt="PDF"
                                        style={{
                                            width: "16px",
                                            height: "16px",
                                            objectFit: "contain" // This ensures the image scales properly
                                        }}
                                    />
                                );

                                // Truncate long titles
                                const maxTitleLength = 50;
                                let displayTitle = details.title;
                                if (displayTitle.length > maxTitleLength) {
                                    displayTitle = displayTitle.substring(0, maxTitleLength - 3) + "...";
                                }

                                const tooltipText = details.isConfluence ? `Open ${details.title} in new tab` : `View ${details.title}`;

                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleCitationClick(citation)}
                                        title={tooltipText}
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
                                        <span>{`${i + 1}. ${displayTitle}`}</span>
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
