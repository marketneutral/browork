import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = {
  primary: "#75B8DB",
  success: "#22c55e",
  warning: "#f59e0b",
  grid: "#2a2926",
  text: "#a8a29e",
};

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-foreground-secondary">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function ActivityPage() {
  const { activity, loading, fetchActivity } = useAdminStore();
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchActivity(days);
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Activity</h2>
        <div className="flex gap-1 rounded-lg border border-border bg-background-secondary p-1">
          {PERIODS.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground-secondary hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading.activity && !activity ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass rounded-xl h-72 animate-shimmer" />
          ))}
        </div>
      ) : (
        <>
          {/* Sessions */}
          <div className="glass rounded-xl p-5 animate-fade-in-up">
            <h3 className="mb-4 text-sm font-semibold text-foreground-secondary">Sessions Created</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activity?.sessions ?? []}>
                  <defs>
                    <linearGradient id="gradS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" name="Sessions" stroke={CHART_COLORS.primary} fill="url(#gradS)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Messages */}
          <div className="glass rounded-xl p-5 animate-fade-in-up stagger-2">
            <h3 className="mb-4 text-sm font-semibold text-foreground-secondary">Messages Sent</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity?.messages ?? []}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Messages" fill={CHART_COLORS.warning} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Active Users */}
          <div className="glass rounded-xl p-5 animate-fade-in-up stagger-3">
            <h3 className="mb-4 text-sm font-semibold text-foreground-secondary">Daily Active Users</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activity?.activeUsers ?? []}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" name="Active Users" stroke={CHART_COLORS.success} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS.success }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
