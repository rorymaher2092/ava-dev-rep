// components/AttachmentMenu/AttachmentMenu.tsx
import * as React from "react";
import {
  Button,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions,
  Input,
  Spinner
} from "@fluentui/react-components";
import {
  Attach24Regular,
  PlugConnected24Regular,
  Bug24Regular,
  ImageAdd24Regular
} from "@fluentui/react-icons";

import { addJiraTicket, addConfluencePage } from "../../api";
import { getToken } from "../../authConfig";

export interface JiraTicketData {
  id: string;
  key: string;
  summary: string;
  url: string;
  description?: string;
  status?: string;
  priority?: string;
}

export interface ConfluencePageData {
  id: string;
  url: string;
  title: string;
  spaceKey: string;
}

type Props = {
  disabled?: boolean;
  onJiraAdded: (t: JiraTicketData) => void;
  onConfluenceAdded: (p: ConfluencePageData) => void;
  onFilesAdd: (files: FileList) => void;
};

export const AttachmentMenu: React.FC<Props> = ({
  disabled,
  onJiraAdded,
  onConfluenceAdded,
  onFilesAdd
}) => {
  const [jiraOpen, setJiraOpen] = React.useState(false);
  const [jiraKey, setJiraKey] = React.useState("");
  const [jiraLoading, setJiraLoading] = React.useState(false);

  const [confOpen, setConfOpen] = React.useState(false);
  const [confUrl, setConfUrl] = React.useState("");
  const [confTitle, setConfTitle] = React.useState("");
  const [confLoading, setConfLoading] = React.useState(false);

  const filePickerRef = React.useRef<HTMLInputElement>(null);

  const attachJira = async () => {
    if (!jiraKey.trim()) return;
    
    setJiraLoading(true);
    try {
      const response = await addJiraTicket(jiraKey.trim());
      
      // Call the callback with the processed ticket data
      onJiraAdded(response.ticket);
      
      setJiraKey("");
      setJiraOpen(false);
      
    } catch (error) {
      console.error('Failed to add Jira ticket:', error);
      const errorMessage = error instanceof Error ? error.message : `Couldn't fetch "${jiraKey.trim()}". Check the key or your permissions.`;
      alert(errorMessage);
    } finally {
      setJiraLoading(false);
    }
  };

  const attachConfluence = async () => {
    if (!confUrl.trim()) {
      alert("Please enter a Confluence page URL.");
      return;
    }
    
    // Validate URL format
    try {
      new URL(confUrl.trim());
    } catch {
      alert("Please enter a valid URL.");
      return;
    }
    
    setConfLoading(true);
    try {
      const response = await addConfluencePage(confUrl.trim(), confTitle.trim() || undefined);
      
      // Call the callback with the processed page data
      onConfluenceAdded(response.page);
      
      setConfUrl("");
      setConfTitle("");
      setConfOpen(false);
      
    } catch (error) {
      console.error('Failed to add Confluence page:', error);
      const errorMessage = error instanceof Error ? error.message : `Couldn't fetch page. Check the URL or your permissions.`;
      alert(errorMessage);
    } finally {
      setConfLoading(false);
    }
  };

  return (
    <>
      <Menu positioning="above-start">
        <MenuTrigger disableButtonEnhancement>
          <Button
            icon={<Attach24Regular />}
            appearance="subtle"
            aria-label="Attach"
            disabled={disabled}
          />
        </MenuTrigger>

        <MenuPopover
          style={{
            backgroundColor: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            padding: "4px 0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            minWidth: 220
          }}
        >
          <MenuList style={{ padding: 0 }}>
            <MenuItem
              icon={<PlugConnected24Regular />}
              style={{ padding: "8px 12px" }}
              onClick={() => setConfOpen(true)}
            >
              Add Confluence page
            </MenuItem>
            <MenuItem
              icon={<Bug24Regular />}
              style={{ padding: "8px 12px" }}
              onClick={() => setJiraOpen(true)}
            >
              Add Jira ticket
            </MenuItem>
            <MenuItem
              icon={<ImageAdd24Regular />}
              style={{ padding: "8px 12px" }}
              onClick={() => filePickerRef.current?.click()}
            >
              Add files (coming soon)
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      {/* Hidden file input */}
      <input
        ref={filePickerRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => e.target.files && onFilesAdd(e.target.files)}
      />

      {/* Jira dialog */}
      <Dialog open={jiraOpen} onOpenChange={(_, d) => setJiraOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Add Jira ticket</DialogTitle>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Issue key (e.g., PROJ-123)</label>
              <Input
                placeholder="PROJ-123"
                value={jiraKey}
                onChange={(_, v) => setJiraKey(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !jiraLoading && attachJira()}
                disabled={jiraLoading}
              />
            </div>
            <DialogActions>
              <Button 
                appearance="secondary" 
                onClick={() => setJiraOpen(false)}
                disabled={jiraLoading}
              >
                Cancel
              </Button>
              <Button 
                appearance="primary" 
                onClick={attachJira}
                disabled={jiraLoading || !jiraKey.trim()}
              >
                {jiraLoading ? <Spinner size="tiny" /> : "Attach"}
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
              <label style={{ fontSize: 12, opacity: 0.8 }}>Page URL</label>
              <Input
                placeholder="https://confluence.company.com/pages/123456/Page+Title"
                value={confUrl}
                onChange={(_, v) => setConfUrl(v.value)}
                disabled={confLoading}
              />
              <label style={{ fontSize: 12, opacity: 0.8 }}>Title (optional)</label>
              <Input
                placeholder="Page title"
                value={confTitle}
                onChange={(_, v) => setConfTitle(v.value)}
                onKeyDown={(e) => e.key === "Enter" && !confLoading && attachConfluence()}
                disabled={confLoading}
              />
            </div>
            <DialogActions>
              <Button 
                appearance="secondary" 
                onClick={() => setConfOpen(false)}
                disabled={confLoading}
              >
                Cancel
              </Button>
              <Button 
                appearance="primary" 
                onClick={attachConfluence}
                disabled={confLoading || !confUrl.trim()}
              >
                {confLoading ? <Spinner size="tiny" /> : "Attach"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
};