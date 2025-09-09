import React, { useState } from "react";
import {
  Button,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Input, Spinner, Badge, Tooltip
} from "@fluentui/react-components";
import {
  Attach24Regular,
  PlugConnected24Regular,
  Bug24Regular,
  Dismiss16Regular,
} from "@fluentui/react-icons";
import { useBot } from "../../contexts/BotContext";

/* ─────────────────── Types ─────────────────── */

export interface AttachmentRef {
  type: 'jira' | 'confluence';
  key?: string;       // For JIRA tickets
  url?: string;       // For Confluence pages
  title?: string;     // Display name
  summary?: string;   // For display purposes
  status?: string;    // For JIRA tickets
  priority?: string;  // For JIRA tickets
  space_name?: string; // For Confluence pages
}

interface SimpleAttachmentMenuProps {
  disabled?: boolean;
  attachments: AttachmentRef[];
  onAttachmentsChange: (attachments: AttachmentRef[]) => void;
  onBusyChange?: (busy: boolean) => void;
  hideAttachmentCount?: boolean;  // Hide the yellow "1 attachment" text
  hideChips?: boolean;            // Hide the styled chips display
}

/* ────────────── Validation API calls ────────────── */

async function validateJiraTicket(ticketKey: string, botId: string): Promise<{valid: boolean; data?: any; error?: string}> {
  try {
    const response = await fetch('/api/attachments/validate/jira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        ticketKey: ticketKey.trim().toUpperCase(),
        botId: botId 
      })
    });
    
    const result = await response.json();
    return response.ok ? { valid: true, data: result } : { valid: false, error: result.error };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

async function validateConfluencePage(pageUrl: string, botId: string): Promise<{valid: boolean; data?: any; error?: string}> {
  try {
    const response = await fetch('/api/attachments/validate/confluence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        pageUrl: pageUrl.trim(),
        botId: botId 
      })
    });
    
    const result = await response.json();
    return response.ok ? { valid: true, data: result } : { valid: false, error: result.error };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/* ────────────── Styled Chip Component (Dark Mode Fixed) ────────────── */

const Chip = ({
  prefix,
  href,
  title,
  onRemove,
  disabled = false
}: {
  prefix?: React.ReactNode;
  href?: string;
  title: string;
  onRemove?: () => void;
  disabled?: boolean;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      border: "1px solid var(--border, #e1e1e1)",
      borderRadius: 999,
      padding: "6px 10px",
      background: "var(--surface-elevated, #fff)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      opacity: disabled ? 0.6 : 1,
      transition: "all 0.2s ease"
    }}
  >
    {prefix ? <span style={{ opacity: 0.7 }}>{prefix}</span> : null}
    {href ? (
      <a 
        href={href} 
        target="_blank" 
        rel="noreferrer" 
        style={{ 
          textDecoration: "none", 
          color: "var(--text, inherit)",
          fontSize: "0.875rem",
          fontWeight: 500
        }} 
        title={title}
      >
        {title}
      </a>
    ) : (
      <span 
        title={title}
        style={{ 
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "var(--text, inherit)"
        }}
      >
        {title}
      </span>
    )}
    {onRemove && (
      <Button 
        size="small" 
        appearance="subtle" 
        icon={<Dismiss16Regular />} 
        onClick={onRemove} 
        aria-label="Remove"
        disabled={disabled}
        style={{ 
          minWidth: 20, 
          padding: 2,
          marginLeft: 4
        }}
      />
    )}
  </div>
);

/* ─────────────────── Main Component ─────────────────── */

export const SimpleAttachmentMenu: React.FC<SimpleAttachmentMenuProps> = ({ 
  disabled = false, 
  attachments, 
  onAttachmentsChange, 
  onBusyChange,
  hideAttachmentCount = false,
  hideChips = false
}) => {
  const { botId } = useBot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraKey, setJiraKey] = useState("");
  const [confOpen, setConfOpen] = useState(false);
  const [confUrl, setConfUrl] = useState("");
  const [confTitle, setConfTitle] = useState("");

  // Update parent about busy state
  React.useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const withBusy = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const addJiraTicket = async () => {
    await withBusy(async () => {
      const key = jiraKey.trim().toUpperCase();
      if (!key) return;
      
      // Check if already exists BEFORE validation
      if (attachments.some(a => a.type === 'jira' && a.key === key)) {
        setError(`Ticket ${key} is already attached`);
        return;
      }
      
      const result = await validateJiraTicket(key, botId);
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
      
      // Use functional update to prevent stale closures
      onAttachmentsChange([...attachments, newAttachment]);
      setJiraKey("");
      setJiraOpen(false);
      setError(null); // Clear any previous errors
    });
  };

  const addConfluencePage = async () => {
    await withBusy(async () => {
      const url = confUrl.trim();
      if (!url) {
        setError("Please enter a Confluence page URL");
        return;
      }
      
      // Basic URL validation
      try {
        new URL(url);
      } catch {
        setError("Please enter a valid URL");
        return;
      }
      
      // Check if already exists BEFORE validation
      if (attachments.some(a => a.type === 'confluence' && a.url === url)) {
        setError("This page is already attached");
        return;
      }
      
      const result = await validateConfluencePage(url, botId);
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
      
      // Use functional update to prevent stale closures
      onAttachmentsChange([...attachments, newAttachment]);
      setConfUrl("");
      setConfTitle("");
      setConfOpen(false);
      setError(null); // Clear any previous errors
    });
  };

  const removeAttachment = (index: number) => {
    console.log('Removing attachment at index:', index, 'from:', attachments);
    const newAttachments = attachments.filter((_, i) => i !== index);
    console.log('New attachments after removal:', newAttachments);
    onAttachmentsChange(newAttachments);
  };

  const clearAll = () => {
    onAttachmentsChange([]);
    setError(null);
  };

  const totalAttachments = attachments.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {error && (
        <div style={{ 
          padding: 8, 
          background: "var(--colorPaletteRedBackground2, #FFE9E9)", 
          color: "var(--colorPaletteRedForeground1, #8B0000)", 
          borderRadius: 6, 
          fontSize: 12,
          border: "1px solid var(--colorPaletteRedBorder2, #ffcccc)"
        }}>
          {error}
        </div>
      )}

      {/* Styled Attachment Chips Display - only show if not hidden */}
      {!hideChips && totalAttachments > 0 && (
        <div style={{ 
          display: "flex", 
          flexWrap: "wrap", 
          gap: 8, 
          padding: "8px 0" 
        }}>
          {attachments.map((attachment, index) => {
            if (attachment.type === 'jira') {
              return (
                <Chip
                  key={`jira-${attachment.key}-${index}`}
                  prefix={
                    <span style={{ 
                      fontWeight: 600, 
                      color: "#0066cc",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}>
                      <Bug24Regular style={{ fontSize: 14 }} />
                      [{attachment.key}]
                    </span>
                  }
                  title={attachment.summary || attachment.key || 'JIRA Ticket'}
                  onRemove={() => removeAttachment(index)}
                  disabled={busy}
                />
              );
            } else {
              return (
                <Chip
                  key={`confluence-${attachment.url}-${index}`}
                  prefix={
                    <span style={{ 
                      fontWeight: 600, 
                      color: "#0052cc",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}>
                      <PlugConnected24Regular style={{ fontSize: 14 }} />
                      Confluence
                    </span>
                  }
                  href={attachment.url}
                  title={attachment.title || attachment.url || 'Confluence Page'}
                  onRemove={() => removeAttachment(index)}
                  disabled={busy}
                />
              );
            }
          })}
        </div>
      )}

      {/* Menu Button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Menu positioning="above-start">
          <MenuTrigger disableButtonEnhancement>
            <Button
              icon={<Attach24Regular />}
              appearance="subtle"
              aria-label="Attach"
              disabled={disabled || busy}
              style={{
                backgroundColor: "#e91e63", // Pink background
                color: "white",
                border: "none"
              }}
            >
              {!hideAttachmentCount && totalAttachments > 0 && (
                <Badge size="small" appearance="filled" style={{ marginLeft: 6 }}>
                  {totalAttachments}
                </Badge>
              )}
            </Button>
          </MenuTrigger>
          <MenuPopover style={{ 
            background: "var(--surface-elevated, #fff)", 
            border: "1px solid var(--border, #ddd)", 
            borderRadius: 8, 
            boxShadow: "0 8px 24px rgba(0,0,0,.12)" 
          }}>
            <MenuList>
              <MenuItem 
                icon={<PlugConnected24Regular />} 
                onClick={() => setConfOpen(true)}
                disabled={busy}
              >
                Add Confluence page
              </MenuItem>
              <MenuItem 
                icon={<Bug24Regular />} 
                onClick={() => setJiraOpen(true)}
                disabled={busy}
              >
                Add Jira ticket
              </MenuItem>
              {totalAttachments > 0 && (
                <>
                  <div style={{ borderTop: "1px solid var(--border-light, #eee)", margin: "4px 0" }} />
                  <MenuItem 
                    onClick={clearAll} 
                    style={{ color: "#b00020" }}
                    disabled={busy}
                  >
                    Clear all attachments
                  </MenuItem>
                </>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>

        {busy && <Spinner size="tiny" />}
        {!hideAttachmentCount && totalAttachments > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-muted, #666)" }}>
            {totalAttachments} attachment{totalAttachments !== 1 ? "s" : ""}
          </span>
        )}
      </div>

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
                onKeyDown={(e) => e.key === "Enter" && !busy && addJiraTicket()}
                disabled={busy}
              />
            </div>
            <DialogActions>
              <Button 
                appearance="secondary" 
                onClick={() => setJiraOpen(false)} 
                disabled={busy}
              >
                Cancel
              </Button>
              <Button 
                appearance="primary" 
                onClick={addJiraTicket} 
                disabled={busy || !jiraKey.trim()}
              >
                {busy ? <Spinner size="tiny" /> : "Attach"}
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
                disabled={busy}
              />
              <label style={{ fontSize: 12, opacity: .8 }}>
                Title (optional - will use page title if empty)
              </label>
              <Input
                placeholder="Custom display title"
                value={confTitle}
                onChange={(_, v) => setConfTitle(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && addConfluencePage()}
                disabled={busy}
              />
            </div>
            <DialogActions>
              <Button 
                appearance="secondary" 
                onClick={() => setConfOpen(false)} 
                disabled={busy}
              >
                Cancel
              </Button>
              <Button 
                appearance="primary" 
                onClick={addConfluencePage} 
                disabled={busy || !confUrl.trim()}
              >
                {busy ? <Spinner size="tiny" /> : "Attach"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};