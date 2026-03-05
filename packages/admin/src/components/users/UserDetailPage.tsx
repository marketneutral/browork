import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminApi, type AdminUserDetail } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { ArrowLeft, Shield, FolderOpen, MessageSquare, HardDrive, Trash2 } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
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

  const isSelf = currentUser?.id === id;

  const handleDelete = async () => {
    if (!id || isSelf) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await adminApi.deleteUser(id);
      navigate("/admin/users");
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
        <button onClick={() => navigate("/admin/users")} className="mt-4 text-primary hover:underline">
          Back to users
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <button
        onClick={() => navigate("/admin/users")}
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

      {/* Sessions table */}
      <div className="glass overflow-hidden rounded-xl animate-fade-in-up stagger-2">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground-secondary">Sessions ({user.sessions.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-secondary">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium text-right">Messages</th>
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
        <div className="glass rounded-xl p-6 animate-fade-in-up stagger-3">
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
