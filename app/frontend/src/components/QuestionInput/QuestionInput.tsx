import { useState, useEffect, useContext } from "react";
import { Stack, TextField } from "@fluentui/react";
import { Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions, Input, Spinner } from "@fluentui/react-components";
import { Send28Filled, Attach24Regular, Stop24Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import styles from "./QuestionInput.module.css";
import { SpeechInput } from "./SpeechInput";
import { LoginContext } from "../../loginContext";
import { requireLogin } from "../../authConfig";
import { CompactArtifactSelector } from "../ArtifactSelector/CompactArtitfactSelector";
import { useBot } from "../../contexts/BotContext";
import { SimpleAttachmentMenu, AttachmentRef } from "../Attachments/AttachmentMenu";

// Import logos
import confluenceLogo from "../../assets/confluence-logo.png";
import jiraLogo from "../../assets/jira-logo.png";

interface Props {
  onSend: (question: string, attachmentRefs?: AttachmentRef[]) => void;
  onCancel?: () => void;
  disabled: boolean;
  isGenerating?: boolean;
  initQuestion?: string;
  placeholder?: string;
  clearOnSend?: boolean;
  showSpeechInput?: boolean;
  followupQuestions?: string[];
  onFollowupQuestionClicked?: (question: string) => void;
}

export const QuestionInput = ({
  onSend,
  onCancel,
  disabled,
  isGenerating, 
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
  
  // Menu state management
  const [showJiraForm, setShowJiraForm] = useState(false);
  const [showConfluenceForm, setShowConfluenceForm] = useState(false);
  const [jiraKey, setJiraKey] = useState("");
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
  const attachmentDisabled = disabled || attachmentsBusy || disableRequiredAccessControl;

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
      setShowJiraForm(false);
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
      setShowConfluenceForm(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setAttachmentsBusy(false);
    }
  };

  const doSend = () => {
    if (sendDisabled) return;
    
    onSend(question.trim(), attachments.length > 0 ? attachments : undefined);
    
    if (clearOnSend) {
      setQuestion("");
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
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "var(--surface-elevated)",
                    boxShadow: "var(--shadow-sm)",
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
                    <img src={jiraLogo} alt="Jira" style={{ width: 16, height: 16 }} />
                    [{attachment.key}]
                  </span>
                  {attachment.url ? (
                    <a 
                      href={attachment.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ 
                        textDecoration: "none", 
                        color: "var(--text)",
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
                        fontWeight: 500,
                        color: "var(--text, inherit)"
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
                    disabled={attachmentDisabled}
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
                    border: "1px solid var(--border, #e1e1e1)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "var(--surface-elevated, #fff)",
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
                    <img src={confluenceLogo} alt="Confluence" style={{ width: 16, height: 16 }} />
                    Confluence
                  </span>
                  {attachment.url ? (
                    <a 
                      href={attachment.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      style={{ 
                        textDecoration: "none", 
                        color: "var(--text)",
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
                        fontWeight: 500,
                        color: "var(--text, inherit)"
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
                    disabled={attachmentDisabled}
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
          {/* Attachment button above send button */}
          <div style={{ marginBottom: "8px" }}>
            <Menu 
              positioning="above-start"
              onOpenChange={(e, data) => {
                if (!data.open) {
                  setShowJiraForm(false);
                  setShowConfluenceForm(false);
                  setError(null);
                }
              }}
            >
              <MenuTrigger disableButtonEnhancement>
                <Button
                  icon={<Attach24Regular />}
                  appearance="subtle"
                  aria-label="Attach"
                  disabled={attachmentDisabled}
                  style={{
                    minWidth: "40px",
                    height: "40px"
                  }}
                />
              </MenuTrigger>
              <MenuPopover style={{ 
                background: "var(--surface-elevated)", 
                border: "1px solid var(--border)", 
                borderRadius: "var(--radius-md)", 
                boxShadow: "var(--shadow-lg)",
                padding: "16px",
                minWidth: "320px"
              }}>
                {!showJiraForm && !showConfluenceForm ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "12px", 
                        padding: "12px 8px", 
                        borderRadius: "4px", 
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowConfluenceForm(true);
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <img src={confluenceLogo} alt="Confluence" style={{ width: 16, height: 16 }} />
                      <span style={{ color: "var(--text)" }}>Add Confluence page</span>
                    </div>
                    
                    <div 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "12px", 
                        padding: "12px 8px", 
                        borderRadius: "4px", 
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowJiraForm(true);
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <img src={jiraLogo} alt="Jira" style={{ width: 16, height: 16 }} />
                      <span style={{ color: "var(--text)" }}>Add Jira ticket</span>
                    </div>
                    
                    {attachments.length > 0 && (
                      <>
                        <div style={{ borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />
                        <div 
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "12px", 
                            padding: "12px 8px", 
                            borderRadius: "4px", 
                            cursor: "pointer",
                            transition: "background 0.2s",
                            color: "#b00020"
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAttachments([]);
                            setError(null);
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-hover)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <span>Clear all attachments</span>
                        </div>
                      </>
                    )}
                  </div>
                ) : showJiraForm ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <img src={jiraLogo} alt="Jira" style={{ width: 20, height: 20 }} />
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text)" }}>Add Jira Ticket</h3>
                    </div>
                    
                    <div>
                      <label style={{ fontSize: "12px", opacity: 0.8, display: "block", marginBottom: "4px", color: "var(--text-muted)" }}>
                        Issue key (e.g., PROJ-123)
                      </label>
                      <Input
                        placeholder="Enter JIRA ticket key here..."
                        value={jiraKey}
                        onChange={(_, v) => setJiraKey(v.value)}
                        onKeyDown={(e) => e.key === "Enter" && !attachmentsBusy && addJiraTicket()}
                        disabled={attachmentsBusy}
                        style={{ 
                          width: "100%",
                          opacity: jiraKey ? 1 : 0.7
                        }}
                      />
                    </div>

                    {error && (
                      <div style={{ 
                        padding: "8px", 
                        background: "var(--error)", 
                        color: "var(--vocus-white)", 
                        borderRadius: "var(--radius-sm)", 
                        fontSize: "12px",
                        border: "1px solid var(--error)"
                      }}>
                        {error}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <Button 
                        appearance="secondary" 
                        onClick={() => {
                          setShowJiraForm(false);
                          setJiraKey("");
                          setError(null);
                        }} 
                        disabled={attachmentsBusy}
                        size="small"
                      >
                        Cancel
                      </Button>
                      <Button 
                        appearance="primary" 
                        onClick={addJiraTicket} 
                        disabled={attachmentsBusy || !jiraKey.trim()}
                        size="small"
                      >
                        {attachmentsBusy ? <Spinner size="tiny" /> : "Attach"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <img src={confluenceLogo} alt="Confluence" style={{ width: 20, height: 20 }} />
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text)" }}>Add Confluence Page</h3>
                    </div>
                    
                    <div>
                      <label style={{ fontSize: "12px", opacity: 0.8, display: "block", marginBottom: "4px", color: "var(--text-muted)" }}>
                        Page URL
                      </label>
                      <Input
                        placeholder="Paste your Confluence page URL here..."
                        value={confUrl}
                        onChange={(_, v) => setConfUrl(v.value)}
                        disabled={attachmentsBusy}
                        style={{ 
                          width: "100%",
                          opacity: confUrl ? 1 : 0.7
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", opacity: 0.8, display: "block", marginBottom: "4px", color: "var(--text-muted)" }}>
                        Title (optional - will use page title if empty)
                      </label>
                      <Input
                        placeholder="Optional: Custom display name..."
                        value={confTitle}
                        onChange={(_, v) => setConfTitle(v.value)}
                        onKeyDown={(e) => e.key === "Enter" && !attachmentsBusy && addConfluencePage()}
                        disabled={attachmentsBusy}
                        style={{ 
                          width: "100%",
                          opacity: confTitle ? 1 : 0.7
                        }}
                      />
                    </div>

                    {error && (
                      <div style={{ 
                        padding: "8px", 
                        background: "var(--error)", 
                        color: "var(--vocus-white)", 
                        borderRadius: "var(--radius-sm)", 
                        fontSize: "12px",
                        border: "1px solid var(--error)"
                      }}>
                        {error}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <Button 
                        appearance="secondary" 
                        onClick={() => {
                          setShowConfluenceForm(false);
                          setConfUrl("");
                          setConfTitle("");
                          setError(null);
                        }} 
                        disabled={attachmentsBusy}
                        size="small"
                      >
                        Cancel
                      </Button>
                      <Button 
                        appearance="primary" 
                        onClick={addConfluencePage} 
                        disabled={attachmentsBusy || !confUrl.trim()}
                        size="small"
                      >
                        {attachmentsBusy ? <Spinner size="tiny" /> : "Attach"}
                      </Button>
                    </div>
                  </div>
                )}
              </MenuPopover>
            </Menu>
          </div>
          
          <div className={styles.customTooltip}>{t("tooltips.submitQuestion")}</div>
          <Button
            size="large"
            icon={isGenerating ? <Stop24Filled primaryFill="rgba(220, 53, 69, 1)" /> : <Send28Filled primaryFill="rgba(115, 118, 225, 1)" />}
            disabled={isGenerating ? false : sendDisabled}
            onClick={isGenerating ? onCancel : doSend}
            aria-label={isGenerating ? "Stop generation" : t("tooltips.submitQuestion")}
            appearance={isGenerating ? "subtle" : "primary"}
          />
        </div>
        {showSpeechInput && <SpeechInput updateQuestion={setQuestion} />}
      </Stack>
    </div>
  );
};