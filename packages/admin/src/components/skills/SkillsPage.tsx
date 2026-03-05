import { useEffect, useState } from "react";
import { adminApi, type SystemSkill, type UserSkillGroup } from "@/api/client";
import { Sparkles, Trash2, Users, RefreshCw } from "lucide-react";

export function SkillsPage() {
  const [systemSkills, setSystemSkills] = useState<SystemSkill[]>([]);
  const [userSkills, setUserSkills] = useState<UserSkillGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [sys, usr] = await Promise.all([adminApi.skills(), adminApi.skillUsers()]);
      setSystemSkills(sys);
      setUserSkills(usr);
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
        <button onClick={fetchData} className="flex items-center gap-2 rounded-lg bg-surface-glass px-3 py-1.5 text-sm hover:bg-surface-glass-hover">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
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
              User-Installed Skills
            </h3>
          </div>
        </div>
        {userSkills.length === 0 ? (
          <div className="py-6 text-center text-foreground-secondary">No users have installed skills</div>
        ) : (
          <div className="divide-y divide-border/50">
            {userSkills.map((group) => (
              <div key={group.userId} className="px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {group.username[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{group.displayName}</span>
                  <span className="text-xs text-foreground-tertiary">@{group.username}</span>
                </div>
                <div className="ml-8 space-y-1">
                  {group.skills.map((s) => (
                    <div key={s.name} className="flex items-center gap-3 text-sm">
                      <code className="text-xs font-medium text-primary">{s.name}</code>
                      <span className="text-xs text-foreground-secondary">{s.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
