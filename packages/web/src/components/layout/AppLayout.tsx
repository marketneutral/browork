import { useState } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { FilePanel } from "../files/FilePanel";
import { SessionSidebar } from "./SessionSidebar";
import { McpSettings } from "../settings/McpSettings";
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

  return (
    <div className="flex h-screen">
      {/* Sessions sidebar */}
      <SessionSidebar
        connectionStatus={connectionStatus}
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
        onForkSession={onForkSession}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Chat panel — center */}
      <main className="flex-1 flex flex-col">
        <ChatPanel onSendMessage={onSendMessage} onInvokeSkill={onInvokeSkill} onAbort={onAbort} />
      </main>

      {/* File panel */}
      <aside className="w-80 border-l border-[var(--border)] bg-[var(--muted)]">
        <FilePanel />
      </aside>

      {/* MCP Settings modal */}
      {showSettings && <McpSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
