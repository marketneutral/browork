import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminStore } from "@/stores/admin";
import { Search, Shield, ChevronRight } from "lucide-react";

export function UsersPage() {
  const { users, loading, fetchUsers } = useAdminStore();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"lastActive" | "messageCount" | "sessionCount">("lastActive");
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = users
    .filter((u) => u.username.toLowerCase().includes(search.toLowerCase()) || u.displayName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "lastActive") return (b.lastActive ?? "").localeCompare(a.lastActive ?? "");
      return (b[sortBy] as number) - (a[sortBy] as number);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Users</h2>
        <span className="text-sm text-foreground-secondary">{users.length} total</span>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-tertiary" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background-secondary py-2 pl-10 pr-4 text-sm outline-none focus-glow"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="rounded-lg border border-border bg-background-secondary px-3 py-2 text-sm text-foreground outline-none"
        >
          <option value="lastActive">Last Active</option>
          <option value="messageCount">Messages</option>
          <option value="sessionCount">Sessions</option>
        </select>
      </div>

      {/* Table */}
      {loading.users && !users.length ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass rounded-lg h-14 animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-secondary">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium text-right">Sessions</th>
                <th className="px-4 py-3 font-medium text-right">Messages</th>
                <th className="px-4 py-3 font-medium text-right">Last Active</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => navigate(`/users/${user.id}`)}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-surface-glass-hover"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">
                          {user.displayName}
                          {user.isAdmin && (
                            <Shield className="ml-1.5 inline h-3.5 w-3.5 text-primary" />
                          )}
                        </p>
                        <p className="text-xs text-foreground-tertiary">{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{user.sessionCount}</td>
                  <td className="px-4 py-3 text-right font-mono">{user.messageCount}</td>
                  <td className="px-4 py-3 text-right text-foreground-secondary">
                    {user.lastActive ? formatRelative(user.lastActive) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-foreground-tertiary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-foreground-secondary">No users found</div>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
