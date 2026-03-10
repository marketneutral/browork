import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSessionStore, type SessionListItem } from "../../stores/session";
import {
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  GitBranch,
  Check,
  X,
  PanelLeftClose,
  Star,
  Send,
} from "lucide-react";
import { SessionSkeleton } from "../ui/Skeleton";
import { APP_NAME } from "../../config";
import { api } from "../../api/client";

interface SessionSidebarProps {
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onForkSession: (id: string) => void;
  onStarSession: (id: string, starred: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function SessionSidebar({
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onForkSession,
  onStarSession,
  collapsed,
  onToggleCollapse,
}: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.sessionId);
  const isLoading = useSessionStore((s) => s.isLoading);
  const runningSessions = useSessionStore((s) => s.runningSessions);
  const runningPreviews = useSessionStore((s) => s.runningPreviews);

  const starred = sessions.filter((s) => s.starred);
  const unstarred = sessions.filter((s) => !s.starred);

  return (
    <aside className={`shrink-0 border-r bg-background-secondary flex flex-col max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-lg transition-all duration-300 ease-in-out overflow-hidden relative z-10 ${
      collapsed ? "w-0 opacity-0 border-r-0" : "w-64 opacity-100 border-r-border"
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl text-gradient" style={{ fontFamily: "var(--font-display)" }}>{APP_NAME}</h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNewSession}
            title="New session"
            className="rounded-md p-1.5 hover:bg-surface-glass-hover text-foreground-secondary hover:text-foreground transition-colors"
          >
            <Plus size={18} />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Close sidebar"
              className="rounded-md p-1.5 hover:bg-surface-glass-hover text-foreground-secondary hover:text-foreground transition-colors"
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
          <div className="p-4 text-sm text-foreground-secondary">
            No sessions yet
          </div>
        )}
        {starred.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary flex items-center gap-1">
              <Star size={10} className="fill-current" />
              Starred
            </div>
            {starred.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeId}
                isRunning={runningSessions.has(session.id)}
                runningPreview={runningPreviews.get(session.id)}
                onSelect={() => onSelectSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
                onRename={(name) => onRenameSession(session.id, name)}
                onFork={() => onForkSession(session.id)}
                onStar={() => onStarSession(session.id, !session.starred)}
              />
            ))}
          </>
        )}
        {starred.length > 0 && unstarred.length > 0 && (
          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">
            Recent
          </div>
        )}
        {unstarred.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeId}
            isRunning={runningSessions.has(session.id)}
            runningPreview={runningPreviews.get(session.id)}
            onSelect={() => onSelectSession(session.id)}
            onDelete={() => onDeleteSession(session.id)}
            onRename={(name) => onRenameSession(session.id, name)}
            onFork={() => onForkSession(session.id)}
            onStar={() => onStarSession(session.id, !session.starred)}
          />
        ))}
      </div>
    </aside>
  );
}

// ── Session list item ──

interface SessionItemProps {
  session: SessionListItem;
  isActive: boolean;
  isRunning: boolean;
  runningPreview?: string;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onFork: () => void;
  onStar: () => void;
}

function SessionItem({
  session,
  isActive,
  isRunning,
  runningPreview,
  onSelect,
  onDelete,
  onRename,
  onFork,
  onStar,
}: SessionItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
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
          ? "border-l-primary bg-primary/10"
          : "border-l-transparent hover:bg-surface-glass-hover"
      }`}
      onClick={() => !isRenaming && !isConfirmingDelete && onSelect()}
    >
      {isConfirmingDelete ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-destructive">
            Delete &ldquo;{session.name}&rdquo; and all files?
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-[10px] font-medium text-destructive hover:underline shrink-0"
            >
              Delete
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirmingDelete(false);
              }}
              className="text-[10px] font-medium text-foreground-secondary hover:underline shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isRenaming ? (
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
            className="flex-1 text-sm bg-muted text-foreground border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={handleRenameSubmit} className="p-0.5 text-success">
            <Check size={14} />
          </button>
          <button onClick={handleRenameCancel} className="p-0.5 text-destructive">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {isRunning ? (
                <span className="shrink-0 relative flex h-2.5 w-2.5 ml-0.5 mr-0.5" title="Agent running">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
              ) : (
                <MessageSquare size={14} className="shrink-0 text-foreground-secondary" />
              )}
              <span className="text-sm font-medium truncate">{session.name}</span>
            </div>
            <div className={`${session.starred ? "flex" : "hidden group-hover:flex"} items-center gap-0.5`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStar();
                }}
                title={session.starred ? "Unstar" : "Star"}
                className={`p-1 rounded hover:bg-surface-glass-hover ${session.starred ? "text-amber-400" : "text-foreground-secondary"}`}
              >
                <Star size={12} className={session.starred ? "fill-current" : ""} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(session.name);
                  setIsRenaming(true);
                }}
                title="Rename"
                className={`p-1 rounded hover:bg-surface-glass-hover text-foreground-secondary ${session.starred ? "hidden group-hover:block" : ""}`}
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFork();
                }}
                title="Branch conversation"
                className={`p-1 rounded hover:bg-surface-glass-hover text-foreground-secondary ${session.starred ? "hidden group-hover:block" : ""}`}
              >
                <GitBranch size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSendDialog(true);
                }}
                title="Send to user"
                className={`p-1 rounded hover:bg-surface-glass-hover text-foreground-secondary ${session.starred ? "hidden group-hover:block" : ""}`}
              >
                <Send size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsConfirmingDelete(true);
                }}
                title="Delete"
                className={`p-1 rounded hover:bg-surface-glass-hover text-destructive ${session.starred ? "hidden group-hover:block" : ""}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {(isRunning && runningPreview ? runningPreview : session.lastMessage) && (
            <p className={`text-xs truncate mt-0.5 ml-5 ${isRunning && runningPreview ? "text-primary/70 italic" : "text-foreground-secondary"}`}>
              {isRunning && runningPreview ? runningPreview : session.lastMessage}
            </p>
          )}
          <p className="text-[10px] text-foreground-tertiary mt-0.5 ml-5">
            {timeAgo}
          </p>
        </>
      )}
      {showSendDialog && createPortal(
        <SendToUserDialog
          sessionId={session.id}
          sessionName={session.name}
          onClose={() => setShowSendDialog(false)}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Send to User dialog ──

interface SendToUserDialogProps {
  sessionId: string;
  sessionName: string;
  onClose: () => void;
}

function SendToUserDialog({ sessionId, sessionName, onClose }: SendToUserDialogProps) {
  const [users, setUsers] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!selectedUserId) return;
    setSending(true);
    try {
      const result = await api.sessions.sendTo(sessionId, selectedUserId);
      setSuccessMsg(`Sent to ${result.targetUser}`);
      setTimeout(onClose, 1500);
    } catch (err) {
      setSending(false);
      alert(err instanceof Error ? err.message : "Failed to send");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-xl w-80 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Send to User</h3>
          <p className="text-xs text-foreground-secondary mt-0.5 truncate">
            &ldquo;{sessionName}&rdquo;
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {loading ? (
            <p className="text-xs text-foreground-secondary p-2">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-foreground-secondary p-2">No other users found</p>
          ) : successMsg ? (
            <p className="text-xs text-success p-2 font-medium">{successMsg}</p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedUserId === u.id
                    ? "bg-primary/15 text-foreground"
                    : "hover:bg-surface-glass-hover text-foreground-secondary"
                }`}
              >
                <span className="font-medium">{u.displayName}</span>
                <span className="text-foreground-tertiary text-xs ml-1.5">@{u.username}</span>
              </button>
            ))
          )}
        </div>
        {!successMsg && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded hover:bg-surface-glass-hover text-foreground-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!selectedUserId || sending}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        )}
      </div>
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
