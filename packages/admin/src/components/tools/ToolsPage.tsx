import { useEffect } from "react";
import { useAdminStore } from "@/stores/admin";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const CHART_COLORS = {
  primary: "#75B8DB",
  success: "#22c55e",
  warning: "#f59e0b",
  destructive: "#ef4444",
  grid: "#2a2926",
  text: "#a8a29e",
};

const TOOL_COLORS: Record<string, string> = {
  bash: "#75B8DB",
  read: "#22c55e",
  write: "#f59e0b",
  edit: "#a78bfa",
  web_search: "#f472b6",
  web_fetch: "#fb923c",
  ask_user: "#38bdf8",
};

function toolColor(name: string): string {
  if (name in TOOL_COLORS) return TOOL_COLORS[name];
  if (name.startsWith("mcp__")) return "#c084fc";
  return "#6b7280";
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{d.name}</p>
      <p className="text-foreground-secondary">
        Calls: <span className="font-semibold text-foreground">{d.count}</span>
      </p>
      {d.errorCount > 0 && (
        <p className="text-destructive">
          Errors: <span className="font-semibold">{d.errorCount}</span> ({((d.errorCount / d.count) * 100).toFixed(1)}%)
        </p>
      )}
    </div>
  );
}

export function ToolsPage() {
  const { tools, loading, fetchTools } = useAdminStore();

  useEffect(() => {
    fetchTools();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Tool Usage</h2>
        {tools && (
          <span className="text-sm text-foreground-secondary">
            {tools.totalCalls.toLocaleString()} total calls
          </span>
        )}
      </div>

      {loading.tools && !tools ? (
        <div className="glass rounded-xl h-80 animate-shimmer" />
      ) : (
        <>
          {/* Chart */}
          <div className="glass rounded-xl p-5 animate-fade-in-up">
            <h3 className="mb-4 text-sm font-semibold text-foreground-secondary">Usage Distribution</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tools?.tools ?? []} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {(tools?.tools ?? []).map((t) => (
                      <Cell key={t.name} fill={toolColor(t.name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="glass overflow-hidden rounded-xl animate-fade-in-up stagger-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-foreground-secondary">
                  <th className="px-4 py-3 font-medium">Tool</th>
                  <th className="px-4 py-3 font-medium text-right">Calls</th>
                  <th className="px-4 py-3 font-medium text-right">Errors</th>
                  <th className="px-4 py-3 font-medium text-right">Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {(tools?.tools ?? []).map((t) => (
                  <tr key={t.name} className="border-b border-border/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: toolColor(t.name) }} />
                        <span className="font-mono font-medium">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{t.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-destructive">
                      {t.errorCount > 0 ? t.errorCount.toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground-secondary">
                      {t.errorCount > 0 ? `${((t.errorCount / t.count) * 100).toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
