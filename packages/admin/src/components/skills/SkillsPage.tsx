import { useEffect, useState } from "react";
import { adminApi, type SystemSkill, type UserSkillGroup, type SkillUsageStat } from "@/api/client";
import { Sparkles, Trash2, Users, RefreshCw, BarChart3 } from "lucide-react";

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SkillsPage() {
  const [systemSkills, setSystemSkills] = useState<SystemSkill[]>([]);
  const [userSkills, setUserSkills] = useState<UserSkillGroup[]>([]);
  const [usage, setUsage] = useState<SkillUsageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [sys, usr, usageRes] = await Promise.all([
        adminApi.skills(),
        adminApi.skillUsers(),
        adminApi.skillUsage(),
      ]);
      setSystemSkills(sys);
      setUserSkills(usr);
      setUsage(usageRes.stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (name: string) => {
    setDeleting(name);
    try {
      await adminApi.deleteSkill(name);
      setSystemSkills((prev) => prev.filter((s) => s.name !== name));
      setConfirmDelete(null);
    } catch (e: any) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  // Find max count for bar scaling
  const maxCount = Math.max(1, ...usage.map((u) => u.count));

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
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Skills</h1>
        </div>
        <button
          onClick={async () => {
            setRefreshing(true);
            try {
              await adminApi.skillRescan();
              await fetchData();
            } catch (e) { console.error(e); }
            finally { setRefreshing(false); }
          }}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg bg-surface-glass px-3 py-1.5 text-sm hover:bg-surface-glass-hover disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Skill Usage */}
      <div className="glass overflow-hidden rounded-xl">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-foreground-secondary" />
            <h3 className="text-sm font-semibold text-foreground-secondary">
              Skill Invocations
            </h3>
          </div>
        </div>
        {usage.length === 0 ? (
          <div className="py-6 text-center text-foreground-secondary">No skill invocations recorded yet</div>
        ) : (
          <div className="divide-y divide-border/50">
            {usage.map((u) => (
              <div key={u.skill_name} className="flex items-center gap-4 px-4 py-3">
                <code className="w-32 shrink-0 text-sm font-medium text-primary">{u.skill_name}</code>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(u.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right font-mono text-sm">{u.count}</span>
                <span className="w-20 text-right text-xs text-foreground-tertiary">
                  {u.user_count} user{u.user_count !== 1 ? "s" : ""}
                </span>
                <span className="w-20 text-right text-xs text-foreground-tertiary">
                  {timeAgo(u.last_used)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Skills */}
      <div className="glass overflow-hidden rounded-xl">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground-secondary">
            System Skills ({systemSkills.length})
          </h3>
        </div>
        {systemSkills.length === 0 ? (
          <div className="py-6 text-center text-foreground-secondary">No system skills installed</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-secondary">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium">Directory</th>
                <th className="w-16 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {systemSkills.map((s) => (
                <tr key={s.name} className="border-b border-border/50">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 text-foreground-secondary">{s.description || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground-tertiary max-w-[300px] truncate">
                    {s.dirPath ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDelete === s.name ? (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleDelete(s.name)}
                          disabled={deleting === s.name}
                          className="rounded bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/25"
                        >
                          {deleting === s.name ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded bg-surface-glass px-2 py-1 text-xs text-foreground-secondary hover:bg-surface-glass-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(s.name)}
                        className="rounded p-1 text-foreground-tertiary hover:bg-destructive/10 hover:text-destructive"
                        title="Remove skill"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User Skills */}
      <div className="glass overflow-hidden rounded-xl">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-foreground-secondary" />
            <h3 className="text-sm font-semibold text-foreground-secondary">
              User-Installed Skills <span className="font-normal">(promoted cross-session only)</span>
            </h3>
          </div>
        </div>
        {userSkills.length === 0 ? (
          <div className="py-6 text-center text-foreground-secondary">No users have installed skills</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-secondary">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {userSkills.map((group) => (
                <>
                  <tr key={`user-${group.userId}`} className="border-b border-border/50 bg-surface-glass/50">
                    <td colSpan={2} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {group.username[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{group.displayName}</span>
                        <span className="text-xs text-foreground-tertiary">@{group.username}</span>
                      </div>
                    </td>
                  </tr>
                  {group.skills.map((s) => (
                    <tr key={`${group.userId}-${s.name}`} className="border-b border-border/50">
                      <td className="px-4 py-2.5 pl-12 font-medium">{s.name}</td>
                      <td className="px-4 py-2.5 text-foreground-secondary">{s.description || "—"}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
