import { useState } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { FilePanel } from "../files/FilePanel";
import { SessionSidebar } from "./SessionSidebar";
import { McpSettings } from "../settings/McpSettings";
import { Menu, FolderOpen } from "lucide-react";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface AppLayoutProps {
  connectionStatus: ConnectionStatus;
  onSendMessage: (text: string) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  onAbort: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onForkSession: (id: string) => void;
}

export function AppLayout({
  connectionStatus,
  onSendMessage,
  onInvokeSkill,
  onAbort,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onForkSession,
}: AppLayoutProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sessions sidebar */}
      <SessionSidebar
        connectionStatus={connectionStatus}
        onNewSession={onNewSession}
        onSelectSession={(id) => {
          onSelectSession(id);
          // Auto-close sidebar on mobile after selection
          if (window.innerWidth < 768) setSidebarCollapsed(true);
        }}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
        onForkSession={onForkSession}
        onOpenSettings={() => setShowSettings(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Backdrop for mobile sidebar */}
      {!sidebarCollapsed && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-30"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Center: mobile header + chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — only shown when sidebar is collapsed on mobile */}
        <div className="md:hidden flex items-center gap-2 p-2 border-b border-[var(--border)]">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-1.5 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
            title="Open sessions"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-medium truncate flex-1">Browork</span>
          <button
            onClick={() => setFilesPanelOpen((v) => !v)}
            className="p-1.5 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)] lg:hidden"
            title="Toggle files"
          >
            <FolderOpen size={20} />
          </button>
        </div>

        <ChatPanel onSendMessage={onSendMessage} onInvokeSkill={onInvokeSkill} onAbort={onAbort} />
      </main>

      {/* File panel — hidden on mobile, togglable on tablet */}
      {filesPanelOpen && (
        <aside className="w-80 shrink-0 border-l border-[var(--border)] bg-[var(--muted)] max-lg:hidden lg:block">
          <FilePanel />
        </aside>
      )}

      {/* File panel overlay on tablet (when toggled via button) */}
      {filesPanelOpen && (
        <aside className="lg:hidden max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-80 max-lg:shadow-lg max-lg:bg-[var(--muted)] max-lg:border-l max-lg:border-[var(--border)] hidden max-md:hidden md:max-lg:block">
          <div className="flex items-center justify-between p-2 border-b border-[var(--border)] md:hidden">
            <span className="text-sm font-medium">Files</span>
            <button
              onClick={() => setFilesPanelOpen(false)}
              className="p-1 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
            >
              &times;
            </button>
          </div>
          <FilePanel />
        </aside>
      )}

      {/* MCP Settings modal */}
      {showSettings && <McpSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
