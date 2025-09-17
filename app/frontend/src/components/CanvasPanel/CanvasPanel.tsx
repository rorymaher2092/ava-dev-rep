import { useState, useRef, useEffect } from "react";
import styles from "./CanvasPanel.module.css";
import * as XLSX from 'xlsx';

interface CanvasPanelProps {
    htmlContent: string;
    isOpen: boolean;
    onClose: () => void;
    title?: string;
}

export const CanvasPanel = ({ htmlContent, isOpen, onClose, title = "Story Map" }: CanvasPanelProps) => {
    const [versions, setVersions] = useState<Record<string, number>>({});
    const [lastContent, setLastContent] = useState("");
    const [lastTitle, setLastTitle] = useState("");
    const [width, setWidth] = useState(50); // percentage
    const panelRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);

    const exportToExcel = () => {
        const table = document.querySelector('.canvas-content table');
        if (!table) return;
        
        const wb = XLSX.utils.table_to_book(table, { sheet: "Story Map" });
        XLSX.writeFile(wb, "story-map.xlsx");
    };

    const copyTable = () => {
        const table = document.querySelector('.canvas-content table');
        if (!table) return;
        
        const cleanTable = table.cloneNode(true) as HTMLTableElement;
        cleanTable.removeAttribute('style');
        cleanTable.style.borderCollapse = 'collapse';
        
        const allElements = cleanTable.querySelectorAll('*');
        allElements.forEach(el => {
            el.removeAttribute('style');
            el.removeAttribute('class');
            if (el.tagName === 'TD' || el.tagName === 'TH') {
                (el as HTMLElement).style.border = '1px solid #000';
                (el as HTMLElement).style.padding = '4px';
            }
        });
        
        const html = cleanTable.outerHTML;
        navigator.clipboard.write([
            new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([cleanTable.innerText], { type: 'text/plain' })
            })
        ]);
    };

    // Handle version updates with useEffect
    useEffect(() => {
        if (htmlContent !== lastContent) {
            // Only increment version if this is the same title with genuinely different content
            if (lastContent !== "" && title === lastTitle) {
                // Extract text content to compare actual data, not HTML formatting
                const getTextContent = (html: string) => {
                    const div = document.createElement('div');
                    div.innerHTML = html;
                    return div.textContent || div.innerText || '';
                };
                
                const currentText = getTextContent(htmlContent);
                const lastText = getTextContent(lastContent);
                
                // Only increment if the actual text content has changed
                if (currentText !== lastText) {
                    setVersions(prev => ({
                        ...prev,
                        [title]: (prev[title] || 0) + 1
                    }));
                }
            }
            setLastContent(htmlContent);
        }
        if (title !== lastTitle) {
            setLastTitle(title);
        }
    }, [htmlContent, title, lastContent, lastTitle]);
    
    // Calculate display title
    const currentVersion = versions[title] || 0;
    const displayTitle = currentVersion > 0 ? `${title} v${currentVersion + 1}` : title;

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.max(30, Math.min(80, 100 - (e.clientX / window.innerWidth) * 100));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleResizeStart = () => {
        isResizing.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    };

    if (!isOpen) return null;

    return (
        <div 
            ref={panelRef}
            className={styles.canvasPanel}
            style={{ width: `${width}%` }}
        >
            <div 
                className={styles.resizeHandle}
                onMouseDown={handleResizeStart}
            />
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h2>📋 {displayTitle}</h2>
                    <span>Interactive Visualization</span>
                </div>
                <div className={styles.headerRight}>
                    <button 
                        className={styles.btn}
                        onClick={copyTable}
                        title="Copy table to clipboard"
                    >
                        Copy
                    </button>
                    <button 
                        className={styles.btn}
                        onClick={exportToExcel}
                        title="Export to Excel"
                    >
                        Export Excel
                    </button>
                    <button 
                        className={styles.closeBtn}
                        onClick={onClose}
                        title="Close canvas"
                    >
                        ✕
                    </button>
                </div>
            </div>
            <div 
                className={`${styles.content} canvas-content`}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
        </div>
    );
};