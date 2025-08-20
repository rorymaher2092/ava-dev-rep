// components/QuestionInput/QuestionInput.tsx (Updated with SimpleAttachmentMenu)
import { useState, useEffect, useContext } from "react";
import { Stack, TextField } from "@fluentui/react";
import { Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions, Input, Spinner } from "@fluentui/react-components";
import { Send28Filled, Attach24Regular, PlugConnected24Regular, Bug24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import styles from "./QuestionInput.module.css";
import { SpeechInput } from "./SpeechInput";
import { LoginContext } from "../../loginContext";
import { requireLogin } from "../../authConfig";
import { CompactArtifactSelector } from "../ArtifactSelector/CompactArtitfactSelector";
import { useBot } from "../../contexts/BotContext";
import { SimpleAttachmentMenu, AttachmentRef } from "../Attachments/AttachmentMenu";

interface Props {
  onSend: (question: string, attachmentRefs?: AttachmentRef[]) => void;
  disabled: boolean;
  initQuestion?: string;
  placeholder?: string;
  clearOnSend?: boolean;
  showSpeechInput?: boolean;
  followupQuestions?: string[];
  onFollowupQuestionClicked?: (question: string) => void;
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
  const [isComposing, setIsComposing] = useState(false);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  
  // Dialog states for attachment modals
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraKey, setJiraKey] = useState("");
  const [confOpen, setConfOpen] = useState(false);
  const [confUrl, setConfUrl] = useState("");
  const [confTitle, setConfTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { loggedIn } = useContext(LoginContext);
  const { botId } = useBot();
  const { t } = useTranslation();

  useEffect(() => {
    if (initQuestion) setQuestion(initQuestion);
  }, [initQuestion]);

  const disableRequiredAccessControl = requireLogin && !loggedIn;
  const sendDisabled = disabled || attachmentsBusy || !question.trim() || disableRequiredAccessControl;

  // Attachment validation functions
  const validateJiraTicket = async (ticketKey: string) => {
    try {
      const response = await fetch('/api/attachments/validate/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ticketKey: ticketKey.trim().toUpperCase() })
      });
      
      const result = await response.json();
      return response.ok ? { valid: true, data: result } : { valid: false, error: result.error };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  };

  const validateConfluencePage = async (pageUrl: string) => {
    try {
      const response = await fetch('/api/attachments/validate/confluence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pageUrl: pageUrl.trim() })
      });
      
      const result = await response.json();
      return response.ok ? { valid: true, data: result } : { valid: false, error: result.error };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  };

  const addJiraTicket = async () => {
    setAttachmentsBusy(true);
    setError(null);
    try {
      const key = jiraKey.trim().toUpperCase();
      if (!key) return;
      
      if (attachments.some(a => a.type === 'jira' && a.key === key)) {
        setError(`Ticket ${key} is already attached`);
        return;
      }
      
      const result = await validateJiraTicket(key);
      if (!result.valid) {
        setError(result.error || 'Failed to validate ticket');
        return;
      }
      
      const newAttachment: AttachmentRef = {
        type: 'jira',
        key: result.data.key,
        title: result.data.summary,
        summary: result.data.summary,
        status: result.data.status,
        priority: result.data.priority,
        url: result.data.url
      };
      
      setAttachments([...attachments, newAttachment]);
      setJiraKey("");
      setJiraOpen(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setAttachmentsBusy(false);
    }
  };

  const addConfluencePage = async () => {
    setAttachmentsBusy(true);
    setError(null);
    try {
      const url = confUrl.trim();
      if (!url) {
        setError("Please enter a Confluence page URL");
        return;
      }
      
      try {
        new URL(url);
      } catch {
        setError("Please enter a valid URL");
        return;
      }
      
      if (attachments.some(a => a.type === 'confluence' && a.url === url)) {
        setError("This page is already attached");
        return;
      }
      
      const result = await validateConfluencePage(url);
      if (!result.valid) {
        setError(result.error || 'Failed to validate page');
        return;
      }
      
      const newAttachment: AttachmentRef = {
        type: 'confluence',
        url: result.data.url,
        title: confTitle.trim() || result.data.title,
        space_name: result.data.space_name
      };
      
      setAttachments([...attachments, newAttachment]);
      setConfUrl("");
      setConfTitle("");
      setConfOpen(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setAttachmentsBusy(false);
    }
  };

  const doSend = () => {
    if (sendDisabled) return;
    
    // Pass both question and attachment references to parent
    onSend(question.trim(), attachments.length > 0 ? attachments : undefined);
    
    if (clearOnSend) {
      setQuestion("");
      // Clear attachments after sending
      setAttachments([]);
    }
  };

  const onEnterPress = (ev: React.KeyboardEvent<Element>) => {
    if (isComposing) return;
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      doSend();
    }
  };

  const effectivePlaceholder = disableRequiredAccessControl 
    ? "Please login to continue..." 
    : (placeholder || "");

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

      {/* Show attachment chips above input ONLY when attachments exist */}
      {attachments.length > 0 && (
        <div style={{ 
          display: "flex", 
          flexWrap: "wrap", 
          gap: 8, 
          padding: "8px 0",
          marginBottom: 8
        }}>
          {attachments.map((attachment, index) => {
            if (attachment.type === 'jira') {
              return (
                <div
                  key={`jira-${attachment.key}-${index}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid var(--colorNeutralStroke1, #e1e1e1)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "var(--colorNeutralBackground1, #fff)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    transition: "all 0.2s ease"
                  }}
                >
                  <span style={{ 
                    fontWeight: 600, 
                    color: "#0066cc",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    opacity: 0.7
                  }}>
                    🐛 [{attachment.key}]
                  </span>
                  {attachment.url ? (
                    <a 
                      href={attachment.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ 
                        textDecoration: "none", 
                        color: "inherit",
                        fontSize: "0.875rem",
                        fontWeight: 500
                      }} 
                      title={attachment.summary || attachment.key || 'JIRA Ticket'}
                    >
                      {attachment.summary || attachment.key}
                    </a>
                  ) : (
                    <span 
                      title={attachment.summary || attachment.key || 'JIRA Ticket'}
                      style={{ 
                        fontSize: "0.875rem",
                        fontWeight: 500
                      }}
                    >
                      {attachment.summary || attachment.key}
                    </span>
                  )}
                  <Button 
                    size="small" 
                    appearance="subtle" 
                    icon={<span>×</span>} 
                    onClick={() => {
                      const newAttachments = attachments.filter((_, i) => i !== index);
                      setAttachments(newAttachments);
                    }} 
                    aria-label="Remove"
                    disabled={attachmentsBusy}
                    style={{ 
                      minWidth: 20, 
                      padding: 2,
                      marginLeft: 4
                    }}
                  />
                </div>
              );
            } else {
              return (
                <div
                  key={`confluence-${attachment.url}-${index}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid var(--colorNeutralStroke1, #e1e1e1)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "var(--colorNeutralBackground1, #fff)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    transition: "all 0.2s ease"
                  }}
                >
                  <span style={{ 
                    fontWeight: 600, 
                    color: "#0052cc",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    opacity: 0.7
                  }}>
                    🔗 Confluence
                  </span>
                  {attachment.url ? (
                    <a 
                      href={attachment.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ 
                        textDecoration: "none", 
                        color: "inherit",
                        fontSize: "0.875rem",
                        fontWeight: 500
                      }} 
                      title={attachment.title || attachment.url || 'Confluence Page'}
                    >
                      {attachment.title || attachment.url}
                    </a>
                  ) : (
                    <span 
                      title={attachment.title || attachment.url || 'Confluence Page'}
                      style={{ 
                        fontSize: "0.875rem",
                        fontWeight: 500
                      }}
                    >
                      {attachment.title || attachment.url}
                    </span>
                  )}
                  <Button 
                    size="small" 
                    appearance="subtle" 
                    icon={<span>×</span>} 
                    onClick={() => {
                      const newAttachments = attachments.filter((_, i) => i !== index);
                      setAttachments(newAttachments);
                    }} 
                    aria-label="Remove"
                    disabled={attachmentsBusy}
                    style={{ 
                      minWidth: 20, 
                      padding: 2,
                      marginLeft: 4
                    }}
                  />
                </div>
              );
            }
          })}
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
          {/* Clean pink attachment button above send button */}
          <div style={{ marginBottom: "8px" }}>
            <Menu positioning="above-start">
              <MenuTrigger disableButtonEnhancement>
                <Button
                  icon={<Attach24Regular />}
                  appearance="subtle"
                  aria-label="Attach"
                  disabled={sendDisabled}
                  style={{
                    backgroundColor: "#e91e63",
                    color: "white",
                    border: "none",
                    minWidth: "40px",
                    height: "40px"
                  }}
                />
              </MenuTrigger>
              <MenuPopover style={{ 
                background: "#fff", 
                border: "1px solid #ddd", 
                borderRadius: 8, 
                boxShadow: "0 8px 24px rgba(0,0,0,.12)" 
              }}>
                <MenuList>
                  <MenuItem 
                    icon={<PlugConnected24Regular />} 
                    onClick={() => setConfOpen(true)}
                    disabled={attachmentsBusy}
                  >
                    Add Confluence page
                  </MenuItem>
                  <MenuItem 
                    icon={<Bug24Regular />} 
                    onClick={() => setJiraOpen(true)}
                    disabled={attachmentsBusy}
                  >
                    Add Jira ticket
                  </MenuItem>
                  {attachments.length > 0 && (
                    <>
                      <div style={{ borderTop: "1px solid #eee", margin: "4px 0" }} />
                      <MenuItem 
                        onClick={() => setAttachments([])} 
                        style={{ color: "#b00020" }}
                        disabled={attachmentsBusy}
                      >
                        Clear all attachments
                      </MenuItem>
                    </>
                  )}
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
          
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

      {/* Error display */}
      {error && (
        <div style={{ 
          padding: 8, 
          background: "#FFE9E9", 
          color: "#8B0000", 
          borderRadius: 6, 
          fontSize: 12,
          border: "1px solid #ffcccc",
          marginTop: 8
        }}>
          {error}
        </div>
      )}

      {/* JIRA Dialog */}
      <Dialog open={jiraOpen} onOpenChange={(_, d) => setJiraOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Add Jira ticket</DialogTitle>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12, opacity: .8 }}>
                Issue key (e.g., PROJ-123)
              </label>
              <Input
                placeholder="PROJ-123"
                value={jiraKey}
                onChange={(_, v) => setJiraKey(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !attachmentsBusy && addJiraTicket()}
                disabled={attachmentsBusy}
              />
            </div>
            <DialogActions>
              <Button 
                appearance="secondary" 
                onClick={() => setJiraOpen(false)} 
                disabled={attachmentsBusy}
              >
                Cancel
              </Button>
              <Button 
                appearance="primary" 
                onClick={addJiraTicket} 
                disabled={attachmentsBusy || !jiraKey.trim()}
              >
                {attachmentsBusy ? <Spinner size="tiny" /> : "Attach"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Confluence Dialog */}
      <Dialog open={confOpen} onOpenChange={(_, d) => setConfOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Add Confluence page</DialogTitle>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12, opacity: .8 }}>Page URL</label>
              <Input
                placeholder="https://vocus.atlassian.net/wiki/pages/123456/Some+Page"
                value={confUrl}
                onChange={(_, v) => setConfUrl(v.value)}
                disabled={attachmentsBusy}
              />
              <label style={{ fontSize: 12, opacity: .8 }}>
                Title (optional - will use page title if empty)
              </label>
              <Input
                placeholder="Custom display title"
                value={confTitle}
                onChange={(_, v) => setConfTitle(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !attachmentsBusy && addConfluencePage()}
                disabled={attachmentsBusy}
              />
            </div>
            <DialogActions>
              <Button 
                appearance="secondary" 
                onClick={() => setConfOpen(false)} 
                disabled={attachmentsBusy}
              >
                Cancel
              </Button>
              <Button 
                appearance="primary" 
                onClick={addConfluencePage} 
                disabled={attachmentsBusy || !confUrl.trim()}
              >
                {attachmentsBusy ? <Spinner size="tiny" /> : "Attach"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};