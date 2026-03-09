import { useEffect, useState } from "react";
import { adminApi, type McpServerInfo, type McpToolInfo } from "@/api/client";
import { RefreshCw, ChevronDown, ChevronRight, Plug, Plus, Trash2 } from "lucide-react";

function StatusBadge({ status, error }: { status: string; error?: string }) {
  const colors: Record<string, string> = {
    connected: "bg-success/15 text-success",
    connecting: "bg-warning/15 text-warning",
    disconnected: "bg-foreground-tertiary/15 text-foreground-tertiary",
    error: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? colors.disconnected}`}
      title={error}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "connected"
            ? "bg-success"
            : status === "connecting"
              ? "bg-warning animate-pulse"
              : status === "error"
                ? "bg-destructive"
                : "bg-foreground-tertiary"
        }`}
      />
      {status}
    </span>
  );
}

function AddServerForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<"sse" | "streamable-http">("sse");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await adminApi.mcpAddServer({ name: name.trim(), url: url.trim(), transport });
      setName("");
      setUrl("");
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass rounded-xl p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground-secondary">Add MCP Server</h3>
      <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-3 items-end">
        <div>
          <label className="mb-1 block text-xs text-foreground-tertiary">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-server"
            className="w-full rounded-lg border border-border bg-surface-glass px-3 py-1.5 text-sm focus-glow"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-foreground-tertiary">URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            className="w-full rounded-lg border border-border bg-surface-glass px-3 py-1.5 text-sm focus-glow"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-foreground-tertiary">Transport</label>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as any)}
            className="rounded-lg border border-border bg-surface-glass px-3 py-1.5 text-sm"
          >
            <option value="sse">SSE</option>
            <option value="streamable-http">Streamable HTTP</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !url.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}

export function McpPage() {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, McpToolInfo[]>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchServers = () => {
    adminApi.mcpServers().then(setServers).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchServers(); }, []);

  const toggleExpand = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    if (!tools[name]) {
      const t = await adminApi.mcpTools(name).catch(() => []);
      setTools((prev) => ({ ...prev, [name]: t }));
    }
  };

  const handleReconnect = async (name: string) => {
    setBusy((p) => ({ ...p, [name]: true }));
    try {
      await adminApi.mcpReconnect(name);
      await new Promise((r) => setTimeout(r, 500));
      fetchServers();
    } catch (e: any) {
      console.error(e);
    } finally {
      setBusy((p) => ({ ...p, [name]: false }));
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    setBusy((p) => ({ ...p, [name]: true }));
    try {
      await adminApi.mcpToggle(name, enabled);
      fetchServers();
    } catch (e: any) {
      console.error(e);
    } finally {
      setBusy((p) => ({ ...p, [name]: false }));
    }
  };

  const handleDelete = async (name: string) => {
    setBusy((p) => ({ ...p, [name]: true }));
    try {
      await adminApi.mcpDeleteServer(name);
      setConfirmDelete(null);
      fetchServers();
    } catch (e: any) {
      console.error(e);
    } finally {
      setBusy((p) => ({ ...p, [name]: false }));
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
          <Plug className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">MCP Servers</h1>
          <span className="text-sm text-foreground-secondary">({servers.length})</span>
        </div>
        <button onClick={fetchServers} className="flex items-center gap-2 rounded-lg bg-surface-glass px-3 py-1.5 text-sm hover:bg-surface-glass-hover">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <AddServerForm onAdded={fetchServers} />

      {servers.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-foreground-secondary">
          No MCP servers configured
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground-secondary">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">URL</th>
                <th className="px-4 py-2.5 font-medium">Transport</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Tools</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <>
                  <tr key={s.name} className="border-b border-border/50 hover:bg-surface-glass/30">
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleExpand(s.name)} className="text-foreground-secondary hover:text-foreground">
                        {expanded === s.name ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground-secondary max-w-[300px] truncate" title={s.url}>{s.url}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-surface-glass px-2 py-0.5 text-xs">{s.transport}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={s.status} error={s.error} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{s.toolCount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(s.name, !s.enabled)}
                          disabled={busy[s.name]}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            s.enabled
                              ? "bg-success/15 text-success hover:bg-success/25"
                              : "bg-foreground-tertiary/15 text-foreground-tertiary hover:bg-foreground-tertiary/25"
                          }`}
                        >
                          {s.enabled ? "Enabled" : "Disabled"}
                        </button>
                        <button
                          onClick={() => handleReconnect(s.name)}
                          disabled={busy[s.name] || !s.enabled}
                          className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
                        >
                          <RefreshCw className={`h-3 w-3 ${busy[s.name] ? "animate-spin" : ""}`} />
                        </button>
                        {confirmDelete === s.name ? (
                          <>
                            <button
                              onClick={() => handleDelete(s.name)}
                              disabled={busy[s.name]}
                              className="rounded bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/25"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="rounded bg-surface-glass px-2 py-1 text-xs text-foreground-secondary hover:bg-surface-glass-hover"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(s.name)}
                            className="rounded p-1 text-foreground-tertiary hover:bg-destructive/10 hover:text-destructive"
                            title="Delete server"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === s.name && (
                    <tr key={`${s.name}-tools`}>
                      <td colSpan={7} className="bg-surface-glass/30 px-8 py-3">
                        {s.error && (
                          <p className="mb-2 text-xs text-destructive">{s.error}</p>
                        )}
                        {s.instructions && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-foreground-secondary mb-1">Server Instructions:</p>
                            <p className="whitespace-pre-wrap rounded-lg bg-surface-glass px-3 py-2 text-xs text-foreground-secondary">{s.instructions}</p>
                          </div>
                        )}
                        {(tools[s.name] ?? []).length === 0 ? (
                          <p className="text-xs text-foreground-tertiary">No tools available</p>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-foreground-secondary">Available Tools:</p>
                            {(tools[s.name] ?? []).map((t) => (
                              <div key={t.qualifiedName} className="flex items-start gap-3 rounded-lg bg-surface-glass px-3 py-2">
                                <code className="text-xs font-medium text-primary">{t.name}</code>
                                <span className="text-xs text-foreground-secondary">{t.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
