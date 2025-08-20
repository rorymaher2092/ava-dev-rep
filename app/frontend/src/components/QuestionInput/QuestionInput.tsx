// components/QuestionInput/QuestionInput.tsx
import { useState, useEffect, useContext, useCallback } from "react";
import { Stack, TextField } from "@fluentui/react";
import { Button } from "@fluentui/react-components";
import { Send28Filled, Dismiss16Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import styles from "./QuestionInput.module.css";
import { SpeechInput } from "./SpeechInput";
import { LoginContext } from "../../loginContext";
import { requireLogin } from "../../authConfig";
import { CompactArtifactSelector } from "../ArtifactSelector/CompactArtitfactSelector";
import { useBot } from "../../contexts/BotContext";
import {
  AttachmentMenu,
  AttachmentState,
  JiraTicketData,
  ConfluencePageData
} from "../Attachments/AttachmentMenu";
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

/* Small pill used for attachment chips */
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
  const [isComposing, setIsComposing] = useState(false);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentState | null>(null);

  const { loggedIn } = useContext(LoginContext);
  const { botId } = useBot();
  const { t } = useTranslation();

  useEffect(() => {
    if (initQuestion) setQuestion(initQuestion);
  }, [initQuestion]);

  const disableRequiredAccessControl = requireLogin && !loggedIn;
  const sendDisabled = disabled || attachmentsBusy || !question.trim() || disableRequiredAccessControl;

  const doSend = () => {
    if (sendDisabled) return;
    onSend(question.trim());
    if (clearOnSend) setQuestion("");
  };

  const onEnterPress = (ev: React.KeyboardEvent<Element>) => {
    if (isComposing) return;
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      doSend();
    }
  };

  const handleRemoveJira = useCallback(
    async (key: string) => {
      try {
        setAttachmentsBusy(true);
        await removeJiraTicket(key);
        setAttachments(prev =>
          prev
            ? {
                ...prev,
                jira_tickets: prev.jira_tickets.filter(t => t.key !== key),
                total_attachments: Math.max(
                  0,
                  prev.total_attachments - 1
                )
              }
            : prev
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to remove ticket";
        alert(msg);
      } finally {
        setAttachmentsBusy(false);
      }
    },
    []
  );

  const handleRemoveConfluence = useCallback(
    async (url: string) => {
      try {
        setAttachmentsBusy(true);
        await removeConfluencePage(url);
        setAttachments(prev =>
          prev
            ? {
                ...prev,
                confluence_pages: prev.confluence_pages.filter(p => p.url !== url),
                total_attachments: Math.max(
                  0,
                  prev.total_attachments - 1
                )
              }
            : prev
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to remove page";
        alert(msg);
      } finally {
        setAttachmentsBusy(false);
      }
    },
    []
  );

  const effectivePlaceholder = disableRequiredAccessControl ? "Please login to continue..." : (placeholder || "");

  return (
    <div className={styles.questionInputWrapper}>
      {botId === "ba" && <CompactArtifactSelector />}

      {!!followupQuestions?.length && (
        <Stack horizontal wrap tokens={{ childrenGap: 16 }} className={styles.followupQuestionsWrapper}>
          {followupQuestions.map((q, i) => (
            <button
              key={i}
              className={styles.followupQuestion}
              title={q}
              onClick={() => onFollowupQuestionClicked?.(q)}
              type="button"
            >
              {q}
            </button>
          ))}
        </Stack>
      )}

      {/* Attachment chips ABOVE the input */}
      {(attachments?.total_attachments ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {attachments?.jira_tickets.map((t: JiraTicketData) => (
            <Chip
              key={t.key}
              prefix={<span style={{ fontWeight: 600 }}>[{t.key}]</span>}
              href={t.url}
              title={t.summary || t.key}
              onRemove={() => handleRemoveJira(t.key)}
            />
          ))}
          {attachments?.confluence_pages.map((p: ConfluencePageData) => (
            <Chip
              key={p.url}
              prefix={<span style={{ fontWeight: 600 }}>Confluence</span>}
              href={p.url}
              title={p.title || p.url}
              onRemove={() => handleRemoveConfluence(p.url)}
            />
          ))}
        </div>
      )}

      {/* Input + controls */}
      <Stack horizontal className={styles.questionInputContainer}>
        <TextField
          className={styles.questionInputTextArea}
          disabled={disableRequiredAccessControl}
          placeholder={effectivePlaceholder}
          multiline
          resizable={false}
          borderless
          value={question}
          onChange={(_, newValue) => setQuestion(newValue ?? "")}
          onKeyDown={onEnterPress}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          aria-label={effectivePlaceholder || "Ask a question"}
          maxLength={1000}
        />
        <div className={styles.questionInputButtonsContainer}>
          {/* Menu handles session-backed add/remove; we mirror state for chips */}
          <AttachmentMenu
            disabled={sendDisabled}
            onAttachmentsChange={setAttachments}
            onBusyChange={setAttachmentsBusy}
            showInlineBadges={false} // keep chips above the input instead
          />

          <div className={styles.customTooltip}>{t("tooltips.submitQuestion")}</div>
          <Button
            size="large"
            icon={<Send28Filled primaryFill="rgba(115, 118, 225, 1)" />}
            disabled={sendDisabled}
            onClick={doSend}
            aria-label={t("tooltips.submitQuestion")}
          />
        </div>
        {showSpeechInput && <SpeechInput updateQuestion={setQuestion} />}
      </Stack>
    </div>
  );
};
