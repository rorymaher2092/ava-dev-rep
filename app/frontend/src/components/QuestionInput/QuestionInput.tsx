// components/QuestionInput/QuestionInput.tsx - Simplified version
import { useState, useEffect, useContext } from "react";
import { Stack, TextField } from "@fluentui/react";
import { Button } from "@fluentui/react-components";
import { Send28Filled, Dismiss16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import styles from "./QuestionInput.module.css";
import { SpeechInput } from "./SpeechInput";
import { LoginContext } from "../../loginContext";
import { requireLogin, getToken } from "../../authConfig";
import { CompactArtifactSelector } from "../ArtifactSelector/CompactArtitfactSelector";
import { useBot } from "../../contexts/BotContext"
import { AttachmentMenu, JiraTicketData, ConfluencePageData } from "../Attachments/AttachmentMenu";
import { removeJiraTicket, removeConfluencePage } from "../../api";

interface Props {
    onSend: (question: string) => void;
    disabled: boolean;
    initQuestion?: string;
    placeholder?: string;
    clearOnSend?: boolean;
    showSpeechInput?: boolean;
    followupQuestions?: string[];
    onFollowupQuestionClicked?: (question: string) => void;
}

// Chip component for displaying attachments
const Chip = ({
  prefix,
  href,
  title,
  onRemove
}: {
  prefix?: React.ReactNode;
  href?: string;
  title: string;
  onRemove?: () => void;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      border: "1px solid var(--colorNeutralStroke1, #e1e1e1)",
      borderRadius: 999,
      padding: "6px 10px",
      background: "var(--colorNeutralBackground1, #fff)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
    }}
  >
    {prefix ? <span style={{ opacity: 0.7 }}>{prefix}</span> : null}
    {href ? (
      <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }} title={title}>
        {title}
      </a>
    ) : (
      <span title={title}>{title}</span>
    )}
    {onRemove && (
      <Button size="small" appearance="subtle" icon={<Dismiss16Regular />} onClick={onRemove} aria-label="Remove" />
    )}
  </div>
);

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

    // Local state for displaying attached items (UI only)
    const [attachedTickets, setAttachedTickets] = useState<JiraTicketData[]>([]);
    const [attachedConfluencePages, setAttachedConfluencePages] = useState<ConfluencePageData[]>([]);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

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
            // Optionally clear attachment display after sending
            // setAttachedTickets([]);
            // setAttachedConfluencePages([]);
            // setAttachedFiles([]);
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

    // Attachment handlers - these now just update local display state
    const handleAddJiraTicket = (ticket: JiraTicketData) => {
        setAttachedTickets(prev => (
            prev.some(t => t.key === ticket.key) ? prev : [...prev, ticket]
        ));
    };

    const handleRemoveJiraTicket = async (ticketKey: string) => {
        try {
            await removeJiraTicket(ticketKey);
            setAttachedTickets(prev => prev.filter(t => t.key !== ticketKey));
        } catch (error) {
            console.error('Failed to remove Jira ticket:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to remove ticket';
            alert(errorMessage);
        }
    };

    const handleAddConfluencePage = (page: ConfluencePageData) => {
        setAttachedConfluencePages(prev => (
            prev.some(p => p.url === page.url) ? prev : [...prev, page]
        ));
    };

    const handleRemoveConfluencePage = async (pageUrl: string) => {
        try {
            await removeConfluencePage(pageUrl);
            setAttachedConfluencePages(prev => prev.filter(p => p.url !== pageUrl));
        } catch (error) {
            console.error('Failed to remove Confluence page:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to remove page';
            alert(errorMessage);
        }
    };

    const handleFilesAdd = (files: FileList) => {
        const arr = Array.from(files || []);
        if (!arr.length) return;
        setAttachedFiles(prev => {
            const map = new Map(prev.map(f => [f.name + ":" + f.size, f]));
            for (const f of arr) map.set(f.name + ":" + f.size, f);
            return Array.from(map.values());
        });
    };

    const handleRemoveFile = (name: string, size: number) => {
        setAttachedFiles(prev => prev.filter(f => !(f.name === name && f.size === size)));
    };

    return (
        <div className={styles.questionInputWrapper}>
            
            {botId === 'ba' && <CompactArtifactSelector />}
            
            {/* Follow-up questions */}
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

            {/* Attachment chips row */}
            {(attachedTickets.length > 0 || attachedConfluencePages.length > 0 || attachedFiles.length > 0) && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {attachedTickets.map(t => (
                  <Chip
                    key={t.key}
                    prefix={<span style={{ fontWeight: 600 }}>[{t.key}]</span>}
                    href={t.url}
                    title={t.summary || t.key}
                    onRemove={() => handleRemoveJiraTicket(t.key)}
                  />
                ))}
                {attachedConfluencePages.map(p => (
                  <Chip
                    key={p.url}
                    prefix={<span style={{ fontWeight: 600 }}>Confluence</span>}
                    href={p.url}
                    title={p.title || p.url}
                    onRemove={() => handleRemoveConfluencePage(p.url)}
                  />
                ))}
                {attachedFiles.map(f => (
                  <Chip
                    key={f.name + ":" + f.size}
                    title={f.name}
                    onRemove={() => handleRemoveFile(f.name, f.size)}
                  />
                ))}
              </div>
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
                    {/* AttachmentMenu handles the backend calls */}
                    <AttachmentMenu
                      disabled={sendQuestionDisabled}
                      onJiraAdded={handleAddJiraTicket}
                      onConfluenceAdded={handleAddConfluencePage}
                      onFilesAdd={handleFilesAdd}
                    />

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