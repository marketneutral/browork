import { useEffect } from "react";
import { useAdminStore } from "@/stores/admin";
import { StatCard } from "./StatCard";
import { Users, MessageSquare, FolderOpen, HardDrive } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  tooltipBg: "#21201f",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

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

export function OverviewPage() {
  const { overview, activity, loading, fetchOverview, fetchActivity } = useAdminStore();

  useEffect(() => {
    fetchOverview();
    fetchActivity(30);
  }, []);

  if (loading.overview && !overview) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Users"
          value={overview?.totalUsers ?? 0}
          icon={Users}
          color="text-primary"
          subtext={overview?.newUsersThisWeek ? `+${overview.newUsersThisWeek} this week` : undefined}
        />
        <StatCard
          label="Total Sessions"
          value={overview?.totalSessions ?? 0}
          icon={FolderOpen}
          color="text-success"
          subtext={overview?.todaySessions ? `${overview.todaySessions} today` : undefined}
        />
        <StatCard
          label="Total Messages"
          value={overview?.totalMessages ?? 0}
          icon={MessageSquare}
          color="text-warning"
          subtext={overview?.todayMessages ? `${overview.todayMessages} today` : undefined}
        />
        <StatCard
          label="Storage Used"
          value={formatBytes(overview?.totalStorageBytes ?? 0)}
          icon={HardDrive}
          color="text-foreground-secondary"
          subtext={`${overview?.activeTokens ?? 0} active tokens`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Activity chart */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-2">
          <h2 className="mb-4 text-sm font-semibold text-foreground-secondary">Activity (Last 30 Days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity?.sessions ?? []}>
                <defs>
                  <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="Sessions" stroke={CHART_COLORS.primary} fill="url(#gradSessions)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Messages chart */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-3">
          <h2 className="mb-4 text-sm font-semibold text-foreground-secondary">Messages (Last 30 Days)</h2>
          <div className="h-64">
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
      </div>

      {/* DAU + signups */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground-secondary">Daily Active Users</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity?.activeUsers ?? []}>
                <defs>
                  <linearGradient id="gradDAU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" name="Active Users" stroke={CHART_COLORS.success} fill="url(#gradDAU)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground-secondary">New Signups</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity?.signups ?? []}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Signups" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass rounded-xl p-5 h-28 animate-shimmer" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="glass rounded-xl p-5 h-72 animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
