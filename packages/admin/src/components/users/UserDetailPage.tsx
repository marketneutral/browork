import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminApi, type AdminUserDetail } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { ArrowLeft, Shield, FolderOpen, MessageSquare, HardDrive, Trash2, Zap, Pencil, X, Check } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);

  const isSelf = currentUser?.id === id;

  const handleDelete = async () => {
    if (!id || isSelf) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await adminApi.deleteUser(id);
      navigate("/users");
    } catch (e: any) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminApi
      .user(id)
      .then(setUser)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass h-32 rounded-xl animate-shimmer" />
        <div className="glass h-64 rounded-xl animate-shimmer" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="text-center text-destructive">
        <p>{error || "User not found"}</p>
        <button onClick={() => navigate("/users")} className="mt-4 text-primary hover:underline">
          Back to users
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <button
        onClick={() => navigate("/users")}
        className="flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </button>

      <div className="glass rounded-xl p-6 animate-fade-in-up">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {user.displayName}
              {user.isAdmin && <Shield className="ml-2 inline h-4 w-4 text-primary" />}
            </h2>
            <p className="text-sm text-foreground-secondary">@{user.username}</p>
            <p className="text-xs text-foreground-tertiary">
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Totals */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-surface-glass p-3">
            <FolderOpen className="h-5 w-5 text-success" />
            <div>
              <p className="text-lg font-bold">{user.totals.sessions}</p>
              <p className="text-xs text-foreground-secondary">Sessions</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-surface-glass p-3">
            <MessageSquare className="h-5 w-5 text-warning" />
            <div>
              <p className="text-lg font-bold">{user.totals.messages}</p>
              <p className="text-xs text-foreground-secondary">Messages</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-surface-glass p-3">
            <HardDrive className="h-5 w-5 text-foreground-secondary" />
            <div>
              <p className="text-lg font-bold">{formatBytes(user.totals.storageBytes)}</p>
              <p className="text-xs text-foreground-secondary">Storage</p>
            </div>
          </div>
        </div>
      </div>

      {/* Token Usage & Budget */}
      {user.tokenUsage && (
        <div className="glass rounded-xl p-6 animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground-secondary flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" /> Token Usage (This Week)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg bg-surface-glass p-3">
              <p className="text-lg font-bold">{formatTokens(user.tokenUsage.thisWeek.totalTokens)}</p>
              <p className="text-xs text-foreground-secondary">Tokens used</p>
            </div>
            <div className="rounded-lg bg-surface-glass p-3">
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold">
                  {user.tokenUsage.budget.limit > 0 ? formatTokens(user.tokenUsage.budget.limit) : "Unlimited"}
                </p>
                {!editingBudget && (
                  <button
                    onClick={() => {
                      setEditingBudget(true);
                      setBudgetInput(user.tokenUsage!.budget.limit > 0 ? String(user.tokenUsage!.budget.limit) : "");
                    }}
                    className="p-1 rounded hover:bg-surface-glass-hover text-foreground-tertiary hover:text-foreground"
                    title="Edit budget"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-foreground-secondary">
                Weekly limit{user.tokenUsage.budget.isCustom ? " (custom)" : " (default)"}
              </p>
            </div>
          </div>

          {/* Budget progress bar */}
          {user.tokenUsage.budget.limit > 0 && (() => {
            const pct = (user.tokenUsage!.thisWeek.totalTokens / user.tokenUsage!.budget.limit) * 100;
            const color = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
            return (
              <div className="mb-4">
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-foreground-tertiary text-right">{pct.toFixed(1)}%</p>
              </div>
            );
          })()}

          {/* Inline budget editor */}
          {editingBudget && (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="0 = unlimited"
                className="w-40 rounded-lg border border-border bg-surface-glass px-3 py-1.5 text-sm focus-glow"
              />
              <button
                disabled={budgetSaving}
                onClick={async () => {
                  setBudgetSaving(true);
                  try {
                    const val = parseInt(budgetInput, 10);
                    if (!budgetInput || val <= 0) {
                      await adminApi.removeUserBudget(id!);
                    } else {
                      await adminApi.setUserBudget(id!, val);
                    }
                    // Refresh user data
                    const fresh = await adminApi.user(id!);
                    setUser(fresh);
                    setEditingBudget(false);
                  } catch { /* ignore */ } finally {
                    setBudgetSaving(false);
                  }
                }}
                className="p-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setEditingBudget(false)}
                className="p-1.5 rounded-lg bg-surface-glass text-foreground-secondary hover:bg-surface-glass-hover"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="text-xs text-foreground-tertiary">
            Input: {formatTokens(user.tokenUsage.thisWeek.inputTokens)} · Output: {formatTokens(user.tokenUsage.thisWeek.outputTokens)}
            {user.tokenUsage.thisWeek.cost > 0 && ` · Cost: $${user.tokenUsage.thisWeek.cost.toFixed(4)}`}
          </div>
        </div>
      )}

      {/* Sessions table */}
      <div className="glass overflow-hidden rounded-xl animate-fade-in-up stagger-3">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground-secondary">Sessions ({user.sessions.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-secondary">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium text-right">Messages</th>
              <th className="px-4 py-2.5 font-medium text-right">Tokens</th>
              <th className="px-4 py-2.5 font-medium text-right">Storage</th>
              <th className="px-4 py-2.5 font-medium text-right">Created</th>
              <th className="px-4 py-2.5 font-medium text-right">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {user.sessions.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5 text-right font-mono">{s.messageCount}</td>
                <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">
                  {formatTokens(s.totalTokens)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">
                  {formatBytes(s.workspaceSizeBytes)}
                </td>
                <td className="px-4 py-2.5 text-right text-foreground-secondary">
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right text-foreground-secondary">
                  {new Date(s.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {user.sessions.length === 0 && (
          <div className="py-6 text-center text-foreground-secondary">No sessions yet</div>
        )}
      </div>

      {/* Delete User */}
      {!isSelf && (
        <div className="glass rounded-xl p-6 animate-fade-in-up stagger-4">
          <h3 className="text-sm font-semibold text-destructive mb-3">Danger Zone</h3>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" /> Delete User
            </button>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="mb-3 text-sm">
                This will permanently delete <strong>{user.displayName}</strong> (@{user.username}) and all their data:
              </p>
              <ul className="mb-4 ml-4 list-disc text-sm text-foreground-secondary">
                <li>{user.totals.sessions} session{user.totals.sessions !== 1 ? "s" : ""}</li>
                <li>{user.totals.messages} message{user.totals.messages !== 1 ? "s" : ""}</li>
                <li>{formatBytes(user.totals.storageBytes)} of storage</li>
              </ul>
              {deleteError && (
                <p className="mb-3 text-sm text-destructive">{deleteError}</p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Yes, Delete User"}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); }}
                  className="rounded-lg bg-surface-glass px-4 py-2 text-sm text-foreground-secondary hover:bg-surface-glass-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
