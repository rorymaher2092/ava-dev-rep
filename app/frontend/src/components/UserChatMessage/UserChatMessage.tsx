import styles from "./UserChatMessage.module.css";
import { AttachmentRef } from "../Attachments/AttachmentMenu";
import confluenceLogo from "../../assets/confluence-logo.png";
import jiraLogo from "../../assets/jira-logo.png";
import {
    Document24Regular,
    DocumentPdf24Regular,
    DocumentTable24Regular,
    DocumentText24Regular
} from "@fluentui/react-icons";

interface Props {
    message: string;
    attachmentRefs?: AttachmentRef[];
}

// Helper to get document icon
const getFileIcon = (fileType?: string) => {
    if (!fileType) return <Document24Regular style={{ fontSize: 16, color: '#666' }} />;
    if (fileType === ".pdf") return <DocumentPdf24Regular style={{ fontSize: 16, color: '#d32f2f' }} />;
    if ([".xlsx", ".xls", ".csv"].includes(fileType)) return <DocumentTable24Regular style={{ fontSize: 16, color: '#2e7d32' }} />;
    if ([".txt", ".docx"].includes(fileType)) return <DocumentText24Regular style={{ fontSize: 16, color: '#1976d2' }} />;
    return <Document24Regular style={{ fontSize: 16, color: '#666' }} />;
};

// Format file size
const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return Math.round(bytes / 1024) + " KB";
    return Math.round(bytes / 1048576) + " MB";
};

const AttachmentChip = ({ attachment }: { attachment: AttachmentRef }) => {
    if (attachment.type === 'document') {
        return (
            <div className={styles.attachmentChip}>
                <div className={styles.attachmentIcon}>
                    {getFileIcon(attachment.fileType)}
                </div>
                <div className={styles.attachmentContent}>
                    <span className={styles.attachmentTitle} title={attachment.filename}>
                        {attachment.filename || "Document"}
                    </span>
                    {attachment.size && (
                        <span className={styles.attachmentSize}>
                            {formatFileSize(attachment.size)}
                        </span>
                    )}
                </div>
            </div>
        );
    }
    
    if (attachment.type === 'jira') {
        return (
            <div className={styles.attachmentChip}>
                <div className={styles.attachmentIcon}>
                    <img 
                        src={jiraLogo} 
                        alt="Jira" 
                        width="16" 
                        height="16" 
                    />
                </div>
                <div className={styles.attachmentContent}>
                    <span className={styles.attachmentKey}>[{attachment.key}]</span>
                    {attachment.url ? (
                        <a 
                            href={attachment.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className={styles.attachmentTitle}
                            title={attachment.summary}
                        >
                            {attachment.summary || attachment.key}
                        </a>
                    ) : (
                        <span className={styles.attachmentTitle} title={attachment.summary}>
                            {attachment.summary || attachment.key}
                        </span>
                    )}
                </div>
            </div>
        );
    }
    
    // Confluence type
    return (
        <div className={styles.attachmentChip}>
            <div className={styles.attachmentIcon}>
                <img 
                    src={confluenceLogo} 
                    alt="Confluence" 
                    width="16" 
                    height="16" 
                />
            </div>
            <div className={styles.attachmentContent}>
                <a 
                    href={attachment.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className={styles.attachmentTitle}
                    title={attachment.title}
                >
                    <span className={styles.attachmentPrefix}>Confluence:</span>
                    {attachment.title || "Page"}
                </a>
            </div>
        </div>
    );
};

export const UserChatMessage = ({ message, attachmentRefs }: Props) => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '16px',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px'
        }}>
            {/* Show attachments above the message */}
            {attachmentRefs && attachmentRefs.length > 0 && (
                <div className={styles.attachmentsContainer}>
                    <div className={styles.attachmentsHeader}>
                        <span className={styles.attachmentsLabel}>
                            Referenced {attachmentRefs.length} attachment{attachmentRefs.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className={styles.attachmentsList}>
                        {attachmentRefs.map((attachment, index) => (
                            <AttachmentChip 
                                key={`${attachment.type}-${attachment.key || attachment.url}-${index}`} 
                                attachment={attachment} 
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* EXACT ORIGINAL MESSAGE COMPONENT - NO CHANGES */}
            <div className={styles.userMessage}>
                <div style={{
                    fontSize: '15px',
                    lineHeight: '1.4',
                    wordWrap: 'break-word'
                }}>
                    <span>{message}</span>
                </div>
                
                {/* User indicator */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    marginTop: '8px',
                    gap: '6px'
                }}>
                    <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 'bold'
                    }}>
                        👤
                    </div>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: '500',
                        opacity: 0.8
                    }}>
                        You
                    </span>
                </div>
            </div>
        </div>
    );
};