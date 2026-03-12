import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, type TokenUsageOverview } from "@/api/client";
import { Zap, AlertTriangle } from "lucide-react";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function UsagePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<TokenUsageOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .tokenUsage()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glass h-20 rounded-xl animate-shimmer" />
        <div className="glass h-64 rounded-xl animate-shimmer" />
      </div>
    );
  }

  const totalWeekly = data?.users.reduce((s, u) => s + u.totalTokens, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground-secondary">Weekly Tokens (All Users)</p>
              <p className="mt-1 text-3xl font-bold">{formatTokens(totalWeekly)}</p>
            </div>
            <div className="rounded-lg bg-surface-glass p-2.5 text-amber-400">
              <Zap className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-1">
          <p className="text-sm font-medium text-foreground-secondary">System Default Limit</p>
          <p className="mt-1 text-3xl font-bold">
            {data?.systemDefaultLimit ? formatTokens(data.systemDefaultLimit) : "Unlimited"}
          </p>
          <p className="mt-1 text-xs text-foreground-tertiary">Per user per week</p>
        </div>
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-2">
          <p className="text-sm font-medium text-foreground-secondary">Active Users</p>
          <p className="mt-1 text-3xl font-bold">{data?.users.length ?? 0}</p>
          <p className="mt-1 text-xs text-foreground-tertiary">With token usage this week</p>
        </div>
      </div>

      {/* Users table */}
      <div className="glass overflow-hidden rounded-xl animate-fade-in-up stagger-3">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground-secondary">Weekly Token Usage by User</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground-secondary">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium text-right">Tokens Used</th>
              <th className="px-4 py-2.5 font-medium text-right">Limit</th>
              <th className="px-4 py-2.5 font-medium" style={{ width: "30%" }}>Usage</th>
              <th className="px-4 py-2.5 font-medium text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => {
              const pct = u.limit > 0 ? (u.totalTokens / u.limit) * 100 : 0;
              const barColor = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
              return (
                <tr
                  key={u.userId}
                  className="border-b border-border/50 hover:bg-surface-glass-hover cursor-pointer"
                  onClick={() => navigate(`/users/${u.userId}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.displayName ?? u.username}</span>
                      {pct >= 100 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      {u.isCustomBudget && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">custom</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatTokens(u.totalTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">
                    {u.limit > 0 ? formatTokens(u.limit) : "\u221e"}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.limit > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-foreground-tertiary w-10 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-foreground-tertiary">No limit</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">
                    {u.cost > 0 ? `$${u.cost.toFixed(4)}` : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!data?.users || data.users.length === 0) && (
          <div className="py-8 text-center text-foreground-secondary">No token usage this week</div>
        )}
      </div>
    </div>
  );
}
