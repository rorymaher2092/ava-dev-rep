// components/Attachments/AttachmentMenu.tsx
import React, { useState, useRef, useEffect } from "react";
import {
    Button,
    Menu,
    MenuTrigger,
    MenuPopover,
    MenuList,
    MenuItem,
    Dialog,
    DialogSurface,
    DialogTitle,
    DialogBody,
    DialogActions,
    Input,
    Spinner,
    Badge,
    Tooltip,
    ProgressBar
} from "@fluentui/react-components";
import {
    Attach24Regular,
    PlugConnected24Regular,
    Bug24Regular,
    Dismiss16Regular,
    Document24Regular,
    DocumentPdf24Regular,
    DocumentTable24Regular,
    DocumentText24Regular
} from "@fluentui/react-icons";
import uploadIcon from "../../assets/upload-icon.png";
import { useBot } from "../../contexts/BotContext";

/* ─────────────────── Types ─────────────────── */

export interface AttachmentRef {
    type: "jira" | "confluence" | "document";
    // Loading state
    isLoading?: boolean;
    loadingProgress?: number;
    tempId?: string; // temporary ID for loading attachments
    // Jira fields
    key?: string;
    // Confluence fields
    url?: string;
    title?: string;
    summary?: string;
    status?: string;
    priority?: string;
    space_name?: string;
    // Document fields
    id?: string;
    filename?: string;
    fileType?: string;
    size?: number;
    blob_path?: string;
    uploaded_at?: string;
}

interface SimpleAttachmentMenuProps {
    disabled?: boolean;
    attachments: AttachmentRef[];
    onAttachmentsChange: (attachments: AttachmentRef[]) => void;
    onBusyChange?: (busy: boolean) => void;
    hideAttachmentCount?: boolean;
    hideChips?: boolean;
}

// Helper to get document icon
const getFileIcon = (fileType?: string) => {
    if (!fileType) return <Document24Regular style={{ fontSize: 14 }} />;
    if (fileType === ".pdf") return <DocumentPdf24Regular style={{ fontSize: 14 }} />;
    if ([".xlsx", ".xls", ".csv"].includes(fileType)) return <DocumentTable24Regular style={{ fontSize: 14 }} />;
    if ([".txt", ".docx"].includes(fileType)) return <DocumentText24Regular style={{ fontSize: 14 }} />;
    return <Document24Regular style={{ fontSize: 14 }} />;
};

// Format file size
const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return Math.round(bytes / 1024) + " KB";
    return Math.round(bytes / 1048576) + " MB";
};

// Chip component for attachments
const Chip = ({
    prefix,
    href,
    title,
    onRemove,
    disabled = false,
    icon,
    isLoading = false,
    loadingProgress = 0
}: {
    prefix?: React.ReactNode;
    href?: string;
    title: string;
    onRemove?: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
    isLoading?: boolean;
    loadingProgress?: number;
}) => (
    <div
        style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid var(--border, #e1e1e1)",
            borderRadius: 999,
            padding: "6px 10px",
            background: isLoading ? "var(--surface, #f8f9fa)" : "var(--surface-elevated, #fff)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            opacity: disabled || isLoading ? 0.6 : 1,
            transition: "all 0.2s ease",
            position: "relative",
            overflow: "hidden"
        }}
    >
        {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}
        {prefix && <span style={{ opacity: 0.7 }}>{prefix}</span>}
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
        {isLoading && (
            <div
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    height: 2,
                    width: `${loadingProgress}%`,
                    background: "var(--primary)",
                    transition: "width 0.3s ease"
                }}
            />
        )}
        {onRemove && (
            <Button
                size="small"
                appearance="subtle"
                icon={<Dismiss16Regular />}
                onClick={onRemove}
                aria-label="Remove"
                disabled={disabled || isLoading}
                style={{ minWidth: 20, padding: 2, marginLeft: 4 }}
            />
        )}
    </div>
);

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
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);

    // Dialog states
    const [jiraOpen, setJiraOpen] = useState(false);
    const [jiraKey, setJiraKey] = useState("");
    const [confOpen, setConfOpen] = useState(false);
    const [confUrl, setConfUrl] = useState("");

    // File input ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Update parent about busy state
    useEffect(() => {
        onBusyChange?.(busy || isUploading);
    }, [busy, isUploading, onBusyChange]);

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

    // Validate and add JIRA ticket
    const addJiraTicket = async () => {
        await withBusy(async () => {
            const input = jiraKey.trim();
            if (!input) return;

            // Extract ticket key for duplicate check
            const extractedKey = input.includes("/browse/") 
                ? input.split("/browse/")[1]?.split("?")[0]?.split("#")[0]?.toUpperCase()
                : input.toUpperCase();

            if (attachments.some(a => a.type === "jira" && a.key === extractedKey)) {
                setError(`Ticket ${extractedKey} is already attached`);
                return;
            }

            const response = await fetch("/api/attachments/validate/jira", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ ticketKey: input })
            });

            if (!response.ok) {
                const data = await response.json();
                setError(data.error || "Failed to validate ticket");
                return;
            }

            const result = await response.json();

            const newAttachment: AttachmentRef = {
                type: "jira",
                key: result.key,
                title: result.summary,
                summary: result.summary,
                status: result.status,
                priority: result.priority,
                url: result.url
            };

            onAttachmentsChange([...attachments, newAttachment]);
            setJiraKey("");
            setJiraOpen(false);
            setError(null);
        });
    };

    // Validate and add Confluence page
    const addConfluencePage = async () => {
        await withBusy(async () => {
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

            if (attachments.some(a => a.type === "confluence" && a.url === url)) {
                setError("This page is already attached");
                return;
            }

            const response = await fetch("/api/attachments/validate/confluence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ pageUrl: url })
            });

            if (!response.ok) {
                const data = await response.json();
                setError(data.error || "Failed to validate page");
                return;
            }

            const result = await response.json();

            const newAttachment: AttachmentRef = {
                type: "confluence",
                url: result.url,
                title: result.title,
                space_name: result.space_name
            };

            onAttachmentsChange([...attachments, newAttachment]);
            setConfUrl("");
            setConfOpen(false);
            setError(null);
        });
    };

    // Handle document upload
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const maxSize = 25 * 1024 * 1024; // 25MB

        if (file.size > maxSize) {
            setError(`File too large. Maximum size is 25MB.`);
            return;
        }

        // Create loading attachment immediately
        const tempId = `temp-${Date.now()}`;
        const loadingAttachment: AttachmentRef = {
            type: "document",
            tempId,
            filename: file.name,
            fileType: `.${file.name.split('.').pop()?.toLowerCase() || ''}`,
            size: file.size,
            isLoading: true,
            loadingProgress: 0
        };

        // Add loading attachment to list
        const attachmentsWithLoading = [...attachments, loadingAttachment];
        onAttachmentsChange(attachmentsWithLoading);

        setIsUploading(true);
        setUploadProgress(0);

        try {
            // Update progress periodically
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    const newProgress = Math.min(prev + 10, 90);
                    // Update the loading attachment's progress
                    const updatedAttachments = attachmentsWithLoading.map(att => 
                        att.tempId === tempId ? { ...att, loadingProgress: newProgress } : att
                    );
                    onAttachmentsChange(updatedAttachments);
                    return newProgress;
                });
            }, 200);

            const formData = new FormData();
            formData.append("file", file);

            // First upload the file to blob storage
            const uploadResponse = await fetch("/upload", {
                method: "POST",
                body: formData,
                credentials: "include"
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error || "Upload failed");
            }

            const uploadData = await uploadResponse.json();
            
            // Then store metadata as attachment with UUID
            const storeResponse = await fetch("/api/attachments/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    type: "document",
                    id: `doc-${Date.now()}`,
                    blob_path: file.name, // Use filename - backend will validate
                    filename: file.name,
                    fileType: `.${file.name.split('.').pop()?.toLowerCase() || ''}`,
                    size: file.size,
                    uploaded_at: new Date().toISOString()
                })
            });

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (!storeResponse.ok) {
                const errorData = await storeResponse.json();
                throw new Error(errorData.error || "Store failed");
            }

            // Replace loading attachment with completed one
            const completedAttachment: AttachmentRef = {
                type: "document",
                id: uploadData.attachment_id,// Use UUID from store response
                filename: file.name,
                fileType: `.${file.name.split('.').pop()?.toLowerCase() || ''}`,
                size: file.size,
                blob_path: file.name,
                uploaded_at: new Date().toISOString()
            };

            const finalAttachments = attachmentsWithLoading
                .filter(att => att.tempId !== tempId)
                .concat(completedAttachment);
            onAttachmentsChange(finalAttachments);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            setError(null);
        } catch (error: any) {
            // Remove failed loading attachment
            const failedAttachments = attachmentsWithLoading.filter(att => att.tempId !== tempId);
            onAttachmentsChange(failedAttachments);
            setError(error.message || "Failed to upload document");
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const removeAttachment = (index: number) => {
        const newAttachments = attachments.filter((_, i) => i !== index);
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
                <div
                    style={{
                        padding: 8,
                        background: "var(--colorPaletteRedBackground2, #FFE9E9)",
                        color: "var(--colorPaletteRedForeground1, #8B0000)",
                        borderRadius: 6,
                        fontSize: 12,
                        border: "1px solid var(--colorPaletteRedBorder2, #ffcccc)"
                    }}
                >
                    {error}
                </div>
            )}

            {isUploading && (
                <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Uploading document...</div>
                    <ProgressBar value={uploadProgress} max={100} />
                </div>
            )}

            {/* Attachment Chips Display */}
            {!hideChips && totalAttachments > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0" }}>
                    {attachments.map((attachment, index) => {
                        if (attachment.type === "jira") {
                            return (
                                <Chip
                                    key={`jira-${attachment.key}-${index}`}
                                    prefix={
                                        <span
                                            style={{
                                                fontWeight: 600,
                                                color: "#0066cc",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4
                                            }}
                                        >
                                            <Bug24Regular style={{ fontSize: 14 }} />[{attachment.key}]
                                        </span>
                                    }
                                    title={attachment.summary || attachment.key || "JIRA Ticket"}
                                    onRemove={() => removeAttachment(index)}
                                    disabled={busy}
                                />
                            );
                        } else if (attachment.type === "confluence") {
                            return (
                                <Chip
                                    key={`confluence-${attachment.url}-${index}`}
                                    prefix={
                                        <span
                                            style={{
                                                fontWeight: 600,
                                                color: "#0052cc",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4
                                            }}
                                        >
                                            <PlugConnected24Regular style={{ fontSize: 14 }} />
                                            Confluence
                                        </span>
                                    }
                                    href={attachment.url}
                                    title={attachment.title || attachment.url || "Confluence Page"}
                                    onRemove={() => removeAttachment(index)}
                                    disabled={busy}
                                />
                            );
                        } else {
                            // Document type
                            return (
                                <Chip
                                    key={`doc-${attachment.id || attachment.tempId}-${index}`}
                                    prefix={
                                        <span
                                            style={{
                                                fontWeight: 600,
                                                color: "var(--primary, #1ac01a)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4
                                            }}
                                        >
                                            {getFileIcon(attachment.fileType)}
                                            Document
                                        </span>
                                    }
                                    title={`${attachment.filename || "Document"}${attachment.size ? ` (${formatFileSize(attachment.size)})` : ""}`}
                                    onRemove={() => removeAttachment(index)}
                                    disabled={busy || isUploading}
                                    isLoading={attachment.isLoading}
                                    loadingProgress={attachment.loadingProgress || 0}
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
                            disabled={disabled || busy || isUploading}
                            style={{
                                backgroundColor: "var(--primary)",
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
                    <MenuPopover
                        style={{
                            background: "var(--surface-elevated, #fff)",
                            border: "1px solid var(--border, #ddd)",
                            borderRadius: 8,
                            boxShadow: "0 8px 24px rgba(0,0,0,.12)"
                        }}
                    >
                        <MenuList>
                            <MenuItem icon={<img src={uploadIcon} alt="Upload" style={{ width: '24px', height: '24px' }} />} onClick={() => fileInputRef.current?.click()} disabled={busy || isUploading}>
                                Upload Document
                            </MenuItem>
                            <MenuItem icon={<PlugConnected24Regular />} onClick={() => setConfOpen(true)} disabled={busy || isUploading}>
                                Add Confluence page
                            </MenuItem>
                            <MenuItem icon={<Bug24Regular />} onClick={() => setJiraOpen(true)} disabled={busy || isUploading}>
                                Add Jira ticket
                            </MenuItem>
                            {totalAttachments > 0 && (
                                <>
                                    <div style={{ borderTop: "1px solid var(--border-light, #eee)", margin: "4px 0" }} />
                                    <MenuItem onClick={clearAll} style={{ color: "#b00020" }} disabled={busy || isUploading}>
                                        Clear all attachments
                                    </MenuItem>
                                </>
                            )}
                        </MenuList>
                    </MenuPopover>
                </Menu>

                {(busy || isUploading) && <Spinner size="tiny" />}
                {!hideAttachmentCount && totalAttachments > 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted, #666)" }}>
                        {totalAttachments} attachment{totalAttachments !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.pptx"
                onChange={handleFileUpload}
                disabled={busy || isUploading}
            />

            {/* JIRA Dialog - Same as before */}
            <Dialog open={jiraOpen} onOpenChange={(_, d) => setJiraOpen(d.open)}>
                <DialogSurface>
                    <DialogBody>
                        <DialogTitle>Add Jira ticket</DialogTitle>
                        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            <label style={{ fontSize: 12, opacity: 0.8 }}>Issue key or URL (e.g., PROJ-123 or https://vocus.atlassian.net/browse/PROJ-123)</label>
                            <Input
                                placeholder="PROJ-123 or https://vocus.atlassian.net/browse/PROJ-123"
                                value={jiraKey}
                                onChange={(_, v) => setJiraKey(v.value)}
                                onKeyDown={e => e.key === "Enter" && !busy && addJiraTicket()}
                                disabled={busy}
                            />
                        </div>
                        <DialogActions>
                            <Button appearance="secondary" onClick={() => setJiraOpen(false)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button appearance="primary" onClick={addJiraTicket} disabled={busy || !jiraKey.trim()}>
                                {busy ? <Spinner size="tiny" /> : "Attach"}
                            </Button>
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>

            {/* Confluence Dialog - Same as before */}
            <Dialog open={confOpen} onOpenChange={(_, d) => setConfOpen(d.open)}>
                <DialogSurface>
                    <DialogBody>
                        <DialogTitle>Add Confluence page</DialogTitle>
                        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            <label style={{ fontSize: 12, opacity: 0.8 }}>Page URL</label>
                            <Input
                                placeholder="https://vocus.atlassian.net/wiki/pages/123456/Some+Page"
                                value={confUrl}
                                onChange={(_, v) => setConfUrl(v.value)}
                                onKeyDown={e => e.key === "Enter" && !busy && addConfluencePage()}
                                disabled={busy}
                            />
                        </div>
                        <DialogActions>
                            <Button appearance="secondary" onClick={() => setConfOpen(false)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button appearance="primary" onClick={addConfluencePage} disabled={busy || !confUrl.trim()}>
                                {busy ? <Spinner size="tiny" /> : "Attach"}
                            </Button>
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>
        </div>
    );
};
