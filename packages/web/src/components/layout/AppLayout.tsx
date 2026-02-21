import { ChatPanel } from "../chat/ChatPanel";
import { FilePanel } from "../files/FilePanel";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface AppLayoutProps {
  connectionStatus: ConnectionStatus;
  onSendMessage: (text: string) => void;
  onAbort: () => void;
}

export function AppLayout({
  connectionStatus,
  onSendMessage,
  onAbort,
}: AppLayoutProps) {
  return (
    <div className="flex h-screen">
      {/* Sessions sidebar — Phase 4 */}
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--muted)] flex flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <h1 className="text-lg font-semibold">Browork</h1>
        </div>
        <div className="flex-1 p-4 text-sm text-[var(--muted-foreground)]">
          Sessions sidebar (Phase 4)
        </div>
        <div className="p-3 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
          {connectionStatus === "connected" && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Connected
            </span>
          )}
          {connectionStatus === "connecting" && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Connecting...
            </span>
          )}
          {connectionStatus === "disconnected" && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Disconnected
            </span>
          )}
        </div>
      </aside>

      {/* Chat panel — center */}
      <main className="flex-1 flex flex-col">
        <ChatPanel onSendMessage={onSendMessage} onAbort={onAbort} />
      </main>

      {/* File panel */}
      <aside className="w-80 border-l border-[var(--border)] bg-[var(--muted)]">
        <FilePanel />
      </aside>
    </div>
  );
}
