import { useState, useRef, useCallback, useEffect } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { FilePanel } from "../files/FilePanel";
import { SessionSidebar } from "./SessionSidebar";
import { StatusPanel } from "./StatusPanel";
import { Menu, FolderOpen, PanelLeftOpen, LogOut } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../api/client";
import type { ConnectionStatus } from "../../hooks/useWebSocket";
import { APP_NAME } from "../../config";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(true);
  const [filesPanelWidth, setFilesPanelWidth] = useState(320);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = filesPanelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizing(true);
  }, [filesPanelWidth]);

  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.min(Math.max(dragStartWidth.current + delta, 200), 1200);
      setFilesPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Transparent overlay to prevent iframes from stealing mouse events during resize */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      {/* Subtle warm gradient backdrop */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-[#1a1917] to-[#141413]" />

      {/* Sessions sidebar */}
      <SessionSidebar
        onNewSession={onNewSession}
        onSelectSession={(id) => {
          onSelectSession(id);
          // Auto-close sidebar on mobile after selection
          if (window.innerWidth < 768) setSidebarCollapsed(true);
        }}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
        onForkSession={onForkSession}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Backdrop for mobile sidebar */}
      {!sidebarCollapsed && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Center: header + chat */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 bg-background">
        {/* Top bar — mobile: always shown; desktop: only when sidebar collapsed */}
        <div className={`flex items-center gap-2 p-2 border-b border-border bg-background-secondary ${
          sidebarCollapsed ? "" : "md:hidden"
        }`}>
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-1.5 rounded-md hover:bg-surface-glass-hover text-muted-foreground"
            title="Open sessions"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-lg font-medium truncate flex-1 text-gradient" style={{ fontFamily: "var(--font-display)" }}>{APP_NAME}</span>
          <button
            onClick={() => setFilesPanelOpen((v) => !v)}
            className="p-1.5 rounded-md hover:bg-surface-glass-hover text-muted-foreground lg:hidden"
            title="Toggle files"
          >
            <FolderOpen size={20} />
          </button>
        </div>

        <ChatPanel onSendMessage={onSendMessage} onInvokeSkill={onInvokeSkill} onAbort={onAbort} />
      </main>

      {/* Right panel: drag handle + files + status footer */}
      <>
        {/* Drag handle — only when files panel is open */}
        {filesPanelOpen && (
          <div
            onMouseDown={handleResizeStart}
            className="shrink-0 w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors max-lg:hidden lg:block relative z-10"
            title="Drag to resize"
          />
        )}
        <aside
          className="shrink-0 bg-background-secondary max-lg:hidden lg:flex lg:flex-col relative z-10"
          style={{ width: filesPanelWidth }}
        >
          {/* File panel (collapsible) */}
          {filesPanelOpen && (
            <div className="flex-1 min-h-0">
              <FilePanel />
            </div>
          )}
          {/* Spacer when files hidden */}
          {!filesPanelOpen && <div className="flex-1" />}

          {/* Always-visible footer */}
          <RightPanelFooter connectionStatus={connectionStatus} />
        </aside>
      </>

      {/* File panel overlay on tablet (when toggled via button) */}
      {filesPanelOpen && (
        <aside className="lg:hidden max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-80 max-lg:shadow-lg max-lg:bg-background-secondary max-lg:border-l max-lg:border-border hidden max-md:hidden md:max-lg:block">
          <div className="flex items-center justify-between p-2 border-b border-border md:hidden">
            <span className="text-sm font-medium">Session Files</span>
            <button
              onClick={() => setFilesPanelOpen(false)}
              className="p-1 rounded-md hover:bg-surface-glass-hover text-muted-foreground"
            >
              &times;
            </button>
          </div>
          <FilePanel />
        </aside>
      )}

    </div>
  );
}

// ── Right-panel footer: connection status + capabilities + user ──

function RightPanelFooter({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    api.auth.logout().catch(() => {});
    logout();
  };

  return (
    <div className="shrink-0">
      {/* Connection status */}
      <div className="px-3 py-2 border-t border-border text-xs text-foreground-secondary">
        {connectionStatus === "connected" && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success" />
            Agent server connected
          </span>
        )}
        {connectionStatus === "connecting" && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            Connecting to agent server...
          </span>
        )}
        {connectionStatus === "disconnected" && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            Agent server disconnected
          </span>
        )}
      </div>

      {/* Workflows + MCP servers */}
      <StatusPanel />

      {/* User / logout */}
      {user && (
        <div className="px-3 py-2 border-t border-border flex items-center justify-between">
          <span className="text-sm font-medium truncate">
            {user.displayName}
          </span>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 rounded-md hover:bg-surface-glass-hover text-foreground-secondary hover:text-foreground transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
