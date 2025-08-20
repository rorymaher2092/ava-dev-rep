// components/Attachments/AttachmentMenu.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* ─────────────────── Types ─────────────────── */

export interface JiraTicketData {
  id: string;
  key: string;
  summary: string;
  url: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  issue_type?: string;
  created?: string;
  updated?: string;
}

export interface ConfluencePageData {
  id: string;
  url: string;
  title: string;
  space_key: string;
  space_name?: string;
  content?: string;
  version?: number;
  last_modified?: string;
}

export interface AttachmentState {
  jira_tickets: JiraTicketData[];
  confluence_pages: ConfluencePageData[];
  session_id: string;
  total_attachments: number;
}

/* ────────────── Helpers (robust fetch) ────────────── */

// Reads as text first, then tries JSON, so HTML 500 pages don't crash JSON.parse
async function fetchJSONSafe(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const err = data?.error || txt || `Request failed (${res.status})`;
    throw new Error(err);
  }
  return data ?? {};
}

/* ────────────── Attachment pills (optional) ────────────── */

const AttachmentDisplay: React.FC<{
  attachments: AttachmentState;
  loading: boolean;
  onRemoveJira: (key: string) => void;
  onRemoveConfluence: (url: string) => void;
}> = ({ attachments, loading, onRemoveJira, onRemoveConfluence }) => {
  if (!attachments.jira_tickets.length && !attachments.confluence_pages.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0" }}>
      {attachments.jira_tickets.map(t => (
        <Tooltip key={t.key} relationship="description" content={
          <div style={{ maxWidth: 300 }}>
            <strong>{t.summary}</strong>
            <div>Status: {t.status ?? "—"}</div>
            <div>Priority: {t.priority ?? "—"}</div>
            <div>Assignee: {t.assignee ?? "Unassigned"}</div>
          </div>
        }>
          <Badge size="large" appearance="outline" style={{ cursor: "default", padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}>
            <Bug24Regular style={{ fontSize: 16 }} />
            <span>{t.key}</span>
            <Button
              icon={<Dismiss16Regular />}
              aria-label={`Remove ${t.key}`}
              appearance="transparent"
              size="small"
              disabled={loading}
              onClick={() => onRemoveJira(t.key)}
              style={{ minWidth: 20, padding: 2 }}
            />
          </Badge>
        </Tooltip>
      ))}

      {attachments.confluence_pages.map(p => (
        <Tooltip key={p.url} relationship="description" content={
          <div style={{ maxWidth: 300 }}>
            <strong>{p.title}</strong>
            <div>Space: {p.space_name || p.space_key}</div>
            {p.last_modified && <div>Modified: {new Date(p.last_modified).toLocaleDateString()}</div>}
          </div>
        }>
          <Badge size="large" appearance="outline" style={{ cursor: "default", padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}>
            <PlugConnected24Regular style={{ fontSize: 16 }} />
            <span>{p.title}</span>
            <Button
              icon={<Dismiss16Regular />}
              aria-label={`Remove ${p.title}`}
              appearance="transparent"
              size="small"
              disabled={loading}
              onClick={() => onRemoveConfluence(p.url)}
              style={{ minWidth: 20, padding: 2 }}
            />
          </Badge>
        </Tooltip>
      ))}
    </div>
  );
};

/* ─────────────────── Main component ─────────────────── */

export const AttachmentMenu: React.FC<{
  disabled?: boolean;
  /** fire whenever the full attachment state changes (for UI chips / debugging) */
  onAttachmentsChange?: (a: AttachmentState) => void;
  /** bubble up "busy" so the Send button can be disabled while adds/removes are in-flight */
  onBusyChange?: (busy: boolean) => void;
  /** render inline pills (default false so you can show chips above the input in QuestionInput) */
  showInlineBadges?: boolean;
}> = ({ disabled, onAttachmentsChange, onBusyChange, showInlineBadges = false }) => {
  const [attachments, setAttachments] = useState<AttachmentState>({
    jira_tickets: [],
    confluence_pages: [],
    session_id: "",
    total_attachments: 0,
  });

  const [error, setError] = useState<string | null>(null);
  const [busyCount, setBusyCount] = useState(0);
  const busy = busyCount > 0;

  // dialogs
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraKey, setJiraKey] = useState("");
  const [confOpen, setConfOpen] = useState(false);
  const [confUrl, setConfUrl] = useState("");
  const [confTitle, setConfTitle] = useState("");

  // track mounted
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // notify parent of busy changes
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  // Listen for attachment consumption event
  useEffect(() => {
    const handleAttachmentsConsumed = () => {
      console.log("🔄 Attachments consumed, clearing UI state");
      setAttachments(prev => ({
        ...prev,
        jira_tickets: [],
        confluence_pages: [],
        total_attachments: 0
      }));
    };

    document.addEventListener("attachments-consumed", handleAttachmentsConsumed);
    return () => document.removeEventListener("attachments-consumed", handleAttachmentsConsumed);
  }, []);

  // helper to wrap async actions with busy+error handling
  const withBusy = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusyCount(c => c + 1);
    try {
      setError(null);
      return await fn();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      throw e;
    } finally {
      if (mounted.current) setBusyCount(c => Math.max(0, c - 1));
    }
  }, []);

  // initial load of session attachments (if any)
  useEffect(() => {
    withBusy(async () => {
      const data = await fetchJSONSafe("/api/attachments/", { credentials: "include" });
      if (!mounted.current) return;
      setAttachments({
        jira_tickets: data.jira_tickets ?? [],
        confluence_pages: data.confluence_pages ?? [],
        session_id: data.session_id ?? "",
        total_attachments: data.total_attachments ?? ((data.jira_tickets?.length || 0) + (data.confluence_pages?.length || 0)),
      });
    }).catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bubble the full state up, and also emit a compatibility event some parts of the app still listen for
  useEffect(() => {
    onAttachmentsChange?.(attachments);
    // compatibility event for old Chat.tsx listeners
    const detail = {
      tickets: attachments.jira_tickets.map(t => ({ key: t.key })),
      confluencePages: attachments.confluence_pages.map(p => ({ url: p.url, title: p.title })),
      files: [] as any[],
      jira_tickets: attachments.jira_tickets,
      confluence_pages: attachments.confluence_pages,
      session_id: attachments.session_id,
      total_attachments: attachments.total_attachments
    };
    document.dispatchEvent(new CustomEvent("question-attachments", { detail }));
  }, [attachments, onAttachmentsChange]);

  /* ────────────── Actions ────────────── */

  const attachJira = useCallback(() => withBusy(async () => {
    const key = jiraKey.trim().toUpperCase();
    if (!key) return;
    const data = await fetchJSONSafe("/api/attachments/jira", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ticketKey: key }),
    });

    setAttachments(prev => {
      // avoid dupes if user double-clicks
      if (prev.jira_tickets.some(t => t.key === data.ticket?.key)) return prev;
      const jira_tickets = [...prev.jira_tickets, data.ticket];
      const total = data.total_attachments ?? (jira_tickets.length + prev.confluence_pages.length);
      return { ...prev, jira_tickets, total_attachments: total, session_id: data.session_id ?? prev.session_id };
    });

    setJiraKey("");
    setJiraOpen(false);
  }), [jiraKey, withBusy]);

  const removeJira = useCallback((ticketKey: string) => withBusy(async () => {
    const data = await fetchJSONSafe(`/api/attachments/jira/${encodeURIComponent(ticketKey)}`, {
      method: "DELETE",
      credentials: "include",
    });

    setAttachments(prev => {
      const jira_tickets = prev.jira_tickets.filter(t => t.key !== ticketKey);
      const total = data.total_attachments ?? (jira_tickets.length + prev.confluence_pages.length);
      return { ...prev, jira_tickets, total_attachments: total };
    });
  }), [withBusy]);

  const attachConfluence = useCallback(() => withBusy(async () => {
    const url = confUrl.trim();
    if (!url) throw new Error("Please enter a Confluence page URL.");
    try { new URL(url); } catch { throw new Error("Please enter a valid URL."); }

    const data = await fetchJSONSafe("/api/attachments/confluence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pageUrl: url, title: confTitle.trim() || undefined }),
    });

    setAttachments(prev => {
      if (prev.confluence_pages.some(p => p.url === data.page?.url)) return prev;
      const confluence_pages = [...prev.confluence_pages, data.page];
      const total = data.total_attachments ?? (prev.jira_tickets.length + confluence_pages.length);
      return { ...prev, confluence_pages, total_attachments: total, session_id: data.session_id ?? prev.session_id };
    });

    setConfUrl("");
    setConfTitle("");
    setConfOpen(false);
  }), [confUrl, confTitle, withBusy]);

  const removeConfluence = useCallback((pageUrl: string) => withBusy(async () => {
    const data = await fetchJSONSafe("/api/attachments/confluence", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pageUrl }),
    });

    setAttachments(prev => {
      const confluence_pages = prev.confluence_pages.filter(p => p.url !== pageUrl);
      const total = data.total_attachments ?? (prev.jira_tickets.length + confluence_pages.length);
      return { ...prev, confluence_pages, total_attachments: total };
    });
  }), [withBusy]);

  const clearAll = useCallback(() => withBusy(async () => {
    await fetchJSONSafe("/api/attachments/all", { method: "DELETE", credentials: "include" });
    setAttachments(prev => ({ ...prev, jira_tickets: [], confluence_pages: [], total_attachments: 0 }));
  }), [withBusy]);

  const total = attachments.total_attachments;

  /* ────────────── Render ────────────── */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {error && (
        <div style={{ padding: 8, background: "#FFE9E9", color: "#8B0000", borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Optional inline pills. Leave this off and render chips above in QuestionInput instead. */}
      {showInlineBadges && (
        <AttachmentDisplay
          attachments={attachments}
          loading={busy}
          onRemoveJira={removeJira}
          onRemoveConfluence={removeConfluence}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Menu positioning="above-start">
          <MenuTrigger disableButtonEnhancement>
            <Button
              icon={<Attach24Regular />}
              appearance="subtle"
              aria-label="Attach"
              disabled={disabled || busy}
            >
              {total > 0 && (
                <Badge size="small" appearance="filled" style={{ marginLeft: 6 }}>
                  {total}
                </Badge>
              )}
            </Button>
          </MenuTrigger>
          <MenuPopover style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
            <MenuList>
              <MenuItem icon={<PlugConnected24Regular />} onClick={() => setConfOpen(true)}>
                Add Confluence page
              </MenuItem>
              <MenuItem icon={<Bug24Regular />} onClick={() => setJiraOpen(true)}>
                Add Jira ticket
              </MenuItem>
              {total > 0 && (
                <>
                  <div style={{ borderTop: "1px solid #eee", margin: "4px 0" }} />
                  <MenuItem onClick={clearAll} style={{ color: "#b00020" }}>
                    Clear all attachments
                  </MenuItem>
                </>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>

        {busy && <Spinner size="tiny" />}
        {total > 0 && <span style={{ fontSize: 12, color: "#666" }}>{total} attachment{total !== 1 ? "s" : ""}</span>}
      </div>

      {/* Jira dialog */}
      <Dialog open={jiraOpen} onOpenChange={(_, d) => setJiraOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Add Jira ticket</DialogTitle>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12, opacity: .8 }}>Issue key (e.g., PROJ-123)</label>
              <Input
                placeholder="PROJ-123"
                value={jiraKey}
                onChange={(_, v) => setJiraKey(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && attachJira()}
                disabled={busy}
              />
            </div>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setJiraOpen(false)} disabled={busy}>Cancel</Button>
              <Button appearance="primary" onClick={attachJira} disabled={busy || !jiraKey.trim()}>
                {busy ? <Spinner size="tiny" /> : "Attach"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Confluence dialog */}
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
              <label style={{ fontSize: 12, opacity: .8 }}>Title (optional)</label>
              <Input
                placeholder="Page title"
                value={confTitle}
                onChange={(_, v) => setConfTitle(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && attachConfluence()}
                disabled={busy}
              />
            </div>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfOpen(false)} disabled={busy}>Cancel</Button>
              <Button appearance="primary" onClick={attachConfluence} disabled={busy || !confUrl.trim()}>
                {busy ? <Spinner size="tiny" /> : "Attach"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};