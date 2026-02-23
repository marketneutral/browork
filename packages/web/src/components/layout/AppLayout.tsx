import { useState, useRef, useCallback, useEffect } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { FilePanel } from "../files/FilePanel";
import { SessionSidebar } from "./SessionSidebar";
import { McpSettings } from "../settings/McpSettings";
import { Menu, FolderOpen, PanelLeftOpen } from "lucide-react";
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
  const [showSettings, setShowSettings] = useState(false);
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
  }, [filesPanelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.min(Math.max(dragStartWidth.current + delta, 200), 600);
      setFilesPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
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
      {/* Subtle warm gradient backdrop */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-[#1a1917] to-[#141413]" />

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
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Center: header + chat */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
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

      {/* Resizable file panel — hidden on mobile, togglable on tablet */}
      {filesPanelOpen && (
        <>
          {/* Drag handle */}
          <div
            onMouseDown={handleResizeStart}
            className="shrink-0 w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors max-lg:hidden lg:block relative z-10"
            title="Drag to resize"
          />
          <aside
            className="shrink-0 bg-background-secondary max-lg:hidden lg:block relative z-10"
            style={{ width: filesPanelWidth }}
          >
            <FilePanel />
          </aside>
        </>
      )}

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

      {/* MCP Settings modal */}
      {showSettings && <McpSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
