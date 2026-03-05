import { useEffect, useState } from "react";
import { useAdminStore } from "@/stores/admin";
import { adminApi, type ContainersResponse } from "@/api/client";
import { Clock, Cpu, Database, Container, HardDrive, MemoryStick, Server, Check, X, AlertTriangle, RefreshCw, Skull } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return null;
  return (
    <div className="flex items-center gap-2">
      {ok ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
      <span className={ok ? "text-success" : "text-destructive"}>{label}</span>
    </div>
  );
}

function UsageBar({ percent, className }: { percent: number; className?: string }) {
  const color = percent > 90 ? "bg-destructive" : percent > 70 ? "bg-warning" : "bg-primary";
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-border ${className ?? ""}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function parsePercent(s: string): number {
  return parseFloat(s.replace("%", "")) || 0;
}

export function SystemPage() {
  const { system, loading, fetchSystem } = useAdminStore();
  const [containers, setContainers] = useState<ContainersResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmKill, setConfirmKill] = useState<string | null>(null);
  const [killing, setKilling] = useState<string | null>(null);

  useEffect(() => {
    fetchSystem();
    loadContainers();
  }, []);

  async function loadContainers() {
    try { setContainers(await adminApi.containers()); } catch {}
  }

  async function handleKill(userId: string) {
    setKilling(userId);
    try {
      await adminApi.killContainer(userId);
      setConfirmKill(null);
      await loadContainers();
    } catch (e) {
      console.error(e);
    } finally {
      setKilling(null);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try { await Promise.all([fetchSystem(), loadContainers()]); }
    finally { setRefreshing(false); }
  }

  if (loading.system && !system) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass rounded-xl h-40 animate-shimmer" />
        ))}
      </div>
    );
  }

  if (!system) return null;

  const { host } = system;
  const hostMemPercent = host.totalMemory > 0 ? (host.usedMemory / host.totalMemory) * 100 : 0;
  const loadPerCore = host.cpuCores > 0 ? host.loadAvg.load1 / host.cpuCores : 0;
  const loadPercent = Math.min(loadPerCore * 100, 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">System</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-surface-glass-hover hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Host Resources ── */}
      <h3 className="text-sm font-semibold text-foreground-secondary">Host</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Host CPU */}
        <div className="glass rounded-xl p-5 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <Cpu className="h-4 w-4" />
            <h3 className="text-sm font-semibold">CPU</h3>
          </div>
          <p className="text-3xl font-bold">{host.cpuCores} <span className="text-base font-normal text-foreground-secondary">cores</span></p>
          <p className="mt-1 truncate text-xs text-foreground-tertiary" title={host.cpuModel}>{host.cpuModel}</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-foreground-secondary">Load (1m)</span>
              <span className="font-mono">{host.loadAvg.load1.toFixed(2)}</span>
            </div>
            <UsageBar percent={loadPercent} />
            <div className="flex justify-between text-xs text-foreground-tertiary">
              <span>5m: {host.loadAvg.load5.toFixed(2)}</span>
              <span>15m: {host.loadAvg.load15.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Host Memory */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-1">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <MemoryStick className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Memory</h3>
          </div>
          <p className="text-3xl font-bold">{formatBytes(host.usedMemory)} <span className="text-base font-normal text-foreground-secondary">/ {formatBytes(host.totalMemory)}</span></p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground-secondary">Used</span>
              <span className="font-mono">{hostMemPercent.toFixed(1)}%</span>
            </div>
            <UsageBar percent={hostMemPercent} />
            <p className="text-xs text-foreground-tertiary">{formatBytes(host.freeMemory)} free</p>
          </div>
        </div>

        {/* Host Disk */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-2">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <HardDrive className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Disk</h3>
          </div>
          {host.disk ? (
            <>
              <p className="text-3xl font-bold">{formatBytes(host.disk.used)} <span className="text-base font-normal text-foreground-secondary">/ {formatBytes(host.disk.total)}</span></p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-secondary">Used</span>
                  <span className="font-mono">{host.disk.percent.toFixed(1)}%</span>
                </div>
                <UsageBar percent={host.disk.percent} />
                <p className="text-xs text-foreground-tertiary">{formatBytes(host.disk.available)} available</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-foreground-secondary italic">Disk info unavailable</p>
          )}
        </div>
      </div>

      {/* ── Process & Infrastructure ── */}
      <h3 className="text-sm font-semibold text-foreground-secondary">Process</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Uptime */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-3">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <Clock className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Uptime</h3>
          </div>
          <p className="text-2xl font-bold">{formatUptime(system.uptime)}</p>
          <div className="mt-2 space-y-1 text-xs text-foreground-secondary">
            <p>Node.js {system.nodeVersion}</p>
            <p>{system.platform}</p>
          </div>
        </div>

        {/* Node Memory */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-4">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <Server className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Node Heap</h3>
          </div>
          <p className="text-2xl font-bold">{formatBytes(system.memoryUsage.heapUsed)}</p>
          <div className="mt-2 text-xs text-foreground-secondary">
            <p>Heap total: {formatBytes(system.memoryUsage.heapTotal)}</p>
            <p>RSS: {formatBytes(system.memoryUsage.rss)}</p>
          </div>
          <UsageBar percent={(system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) * 100} className="mt-2" />
        </div>

        {/* Database */}
        <div className="glass rounded-xl p-5 animate-fade-in-up stagger-5">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <Database className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Database</h3>
          </div>
          <p className="text-2xl font-bold">{formatBytes(system.dbSizeBytes)}</p>
          <p className="mt-2 text-xs text-foreground-secondary">SQLite (WAL mode)</p>
        </div>

        {/* Sandbox */}
        <div className="glass rounded-xl p-5 animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2 text-foreground-secondary">
            <Container className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Sandbox</h3>
          </div>
          {system.sandbox.enabled ? (
            <>
              <p className="text-2xl font-bold">{system.sandbox.activeContainers}</p>
              <p className="text-xs text-foreground-secondary">Active containers</p>
              <div className="mt-2 space-y-1 text-xs">
                <StatusBadge ok={system.sandbox.dockerAvailable} label="Docker Engine" />
                <StatusBadge ok={system.sandbox.imageAvailable} label="Sandbox Image Built" />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-foreground-secondary">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm">Disabled</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Running Containers ── */}
      {containers?.enabled && (
        <>
          <h3 className="text-sm font-semibold text-foreground-secondary">Containers</h3>
          <div className="glass overflow-hidden rounded-xl animate-fade-in-up">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Container className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Running Containers</span>
              </div>
              <span className="text-xs text-foreground-secondary">
                {containers.containers.length} container{containers.containers.length !== 1 ? "s" : ""}
              </span>
            </div>

            {containers.containers.length === 0 ? (
              <div className="py-8 text-center text-sm text-foreground-secondary">
                No running containers
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-foreground-secondary">
                      <th className="px-4 py-2.5 font-medium">User</th>
                      <th className="px-4 py-2.5 font-medium">Container</th>
                      <th className="px-4 py-2.5 font-medium text-right">CPU</th>
                      <th className="px-4 py-2.5 font-medium text-right">Memory</th>
                      <th className="px-4 py-2.5 font-medium text-right">Mem %</th>
                      <th className="px-4 py-2.5 font-medium text-right">Limit</th>
                      <th className="px-4 py-2.5 font-medium text-right">Net I/O</th>
                      <th className="px-4 py-2.5 font-medium text-right">PIDs</th>
                      <th className="w-16 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {containers.containers.map((c) => {
                      const cpuPct = parsePercent(c.cpuPercent);
                      const memPct = parsePercent(c.memPercent);
                      return (
                        <tr key={c.containerId} className="border-b border-border/50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                                {(c.username ?? c.userId)[0]?.toUpperCase()}
                              </div>
                              <div>
                                <span className="font-medium">{c.displayName ?? c.username ?? c.userId}</span>
                                {c.username && <p className="text-xs text-foreground-tertiary">@{c.username}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-foreground-secondary">
                            {c.containerId.slice(0, 12)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                                <div
                                  className={`h-full rounded-full ${cpuPct > 80 ? "bg-destructive" : cpuPct > 50 ? "bg-warning" : "bg-success"}`}
                                  style={{ width: `${Math.min(cpuPct, 100)}%` }}
                                />
                              </div>
                              <span className="w-14 text-right font-mono">{c.cpuPercent}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{c.memUsage}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-border">
                                <div
                                  className={`h-full rounded-full ${memPct > 80 ? "bg-destructive" : memPct > 50 ? "bg-warning" : "bg-primary"}`}
                                  style={{ width: `${Math.min(memPct, 100)}%` }}
                                />
                              </div>
                              <span className="w-14 text-right font-mono">{c.memPercent}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">{c.memLimit}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-foreground-secondary">{c.netIO}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{c.pids}</td>
                          <td className="px-4 py-2.5 text-right">
                            {confirmKill === c.userId ? (
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => handleKill(c.userId)}
                                  disabled={killing === c.userId}
                                  className="rounded bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/25"
                                >
                                  {killing === c.userId ? "..." : "Kill"}
                                </button>
                                <button
                                  onClick={() => setConfirmKill(null)}
                                  className="rounded bg-surface-glass px-2 py-1 text-xs text-foreground-secondary hover:bg-surface-glass-hover"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmKill(c.userId)}
                                className="rounded p-1 text-foreground-tertiary hover:bg-destructive/10 hover:text-destructive"
                                title="Kill container"
                              >
                                <Skull className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
