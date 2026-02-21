import { useState, useRef, useEffect } from "react";
import { useSessionStore, type SessionListItem } from "../../stores/session";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../api/client";
import {
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  GitBranch,
  Check,
  X,
  LogOut,
  Settings,
  PanelLeftClose,
} from "lucide-react";
import { SessionSkeleton } from "../ui/Skeleton";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface SessionSidebarProps {
  connectionStatus: ConnectionStatus;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onForkSession: (id: string) => void;
  onOpenSettings: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function SessionSidebar({
  connectionStatus,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onForkSession,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
}: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.sessionId);
  const isLoading = useSessionStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    api.auth.logout().catch(() => {});
    logout();
  };

  if (collapsed) return null;

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--border)] bg-[var(--muted)] flex flex-col max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-lg">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <h1 className="text-lg font-semibold">Browork</h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNewSession}
            title="New session"
            className="rounded-md p-1.5 hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <Plus size={18} />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Close sidebar"
              className="rounded-md p-1.5 hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors md:hidden"
            >
              <PanelLeftClose size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && sessions.length === 0 && (
          <>
            <SessionSkeleton />
            <SessionSkeleton />
            <SessionSkeleton />
          </>
        )}
        {!isLoading && sessions.length === 0 && (
          <div className="p-4 text-sm text-[var(--muted-foreground)]">
            No sessions yet
          </div>
        )}
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeId}
            onSelect={() => onSelectSession(session.id)}
            onDelete={() => onDeleteSession(session.id)}
            onRename={(name) => onRenameSession(session.id, name)}
            onFork={() => onForkSession(session.id)}
          />
        ))}
      </div>

      {/* Connection status */}
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

      {/* User / settings / logout */}
      {user && (
        <div className="p-3 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-sm font-medium truncate">
            {user.displayName}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="p-1.5 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// ── Session list item ──

interface SessionItemProps {
  session: SessionListItem;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onFork: () => void;
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onFork,
}: SessionItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  const handleRenameCancel = () => {
    setEditName(session.name);
    setIsRenaming(false);
  };

  const timeAgo = formatTimeAgo(session.updatedAt);

  return (
    <div
      className={`group px-3 py-2.5 cursor-pointer border-l-2 transition-colors ${
        isActive
          ? "border-l-[var(--primary)] bg-[var(--accent)]"
          : "border-l-transparent hover:bg-[var(--accent)]/50"
      }`}
      onClick={() => !isRenaming && onSelect()}
    >
      {isRenaming ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") handleRenameCancel();
            }}
            onBlur={handleRenameSubmit}
            className="flex-1 text-sm bg-white border border-[var(--border)] rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button onClick={handleRenameSubmit} className="p-0.5 text-green-600">
            <Check size={14} />
          </button>
          <button onClick={handleRenameCancel} className="p-0.5 text-[var(--destructive)]">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquare size={14} className="shrink-0 text-[var(--muted-foreground)]" />
              <span className="text-sm font-medium truncate">{session.name}</span>
            </div>
            <div className="hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(session.name);
                  setIsRenaming(true);
                }}
                title="Rename"
                className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFork();
                }}
                title="Branch conversation"
                className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
              >
                <GitBranch size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete"
                className="p-1 rounded hover:bg-[var(--muted)] text-[var(--destructive)]"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {session.lastMessage && (
            <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5 ml-5">
              {session.lastMessage}
            </p>
          )}
          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 ml-5">
            {timeAgo}
          </p>
        </>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
