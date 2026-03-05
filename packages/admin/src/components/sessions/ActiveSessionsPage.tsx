import { useEffect, useState, useRef } from "react";
import { adminApi, type ActiveSessionInfo } from "@/api/client";
import { Radio, RefreshCw } from "lucide-react";

function StatusIndicator({ session }: { session: ActiveSessionInfo }) {
  if (session.isRunning) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        Running
      </span>
    );
  }
  if (session.hasSocket) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Idle
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground-tertiary/15 px-2.5 py-0.5 text-xs font-medium text-foreground-tertiary">
      <span className="h-1.5 w-1.5 rounded-full bg-foreground-tertiary" />
      Disconnected
    </span>
  );
}

export function ActiveSessionsPage() {
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchSessions = () => {
    adminApi
      .activeSessions()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchSessions, 5000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass h-12 rounded-xl animate-shimmer" />
        <div className="glass h-64 rounded-xl animate-shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Active Sessions</h1>
          <span className="text-sm text-foreground-secondary">({sessions.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchSessions}
            className="flex items-center gap-2 rounded-lg bg-surface-glass px-3 py-1.5 text-sm hover:bg-surface-glass-hover"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-foreground-secondary">
          No active sessions
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-secondary">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Session</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Tool Calls</th>
                <th className="px-4 py-2.5 font-medium text-right">Buffer</th>
                <th className="px-4 py-2.5 font-medium text-right">Connected</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId} className="border-b border-border/50">
                  <td className="px-4 py-2.5">
                    {s.username ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {s.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{s.displayName ?? s.username}</p>
                          <p className="text-xs text-foreground-tertiary">@{s.username}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-foreground-tertiary">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{s.sessionName ?? "Untitled"}</p>
                    <p className="font-mono text-xs text-foreground-tertiary">{s.sessionId.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusIndicator session={s} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {s.toolCallsInProgress > 0 ? (
                      <span className="text-warning">{s.toolCallsInProgress} in progress</span>
                    ) : (
                      <span className="text-foreground-tertiary">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">
                    {s.bufferLength > 0 ? `${s.bufferLength} chars` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.hasSocket ? (
                      <span className="text-success">Yes</span>
                    ) : (
                      <span className="text-foreground-tertiary">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
