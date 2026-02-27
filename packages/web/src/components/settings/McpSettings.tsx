import { useState, useEffect, useCallback } from "react";
import { api, type McpServerMeta, type McpToolMeta } from "../../api/client";
import {
  Plus,
  Trash2,
  Server,
  ToggleLeft,
  ToggleRight,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Wrench,
} from "lucide-react";

interface McpSettingsProps {
  onClose: () => void;
}

export function McpSettings({ onClose }: McpSettingsProps) {
  const [servers, setServers] = useState<McpServerMeta[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    api.mcp.list().then(setServers).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
    // Auto-refresh every 5s while modal is open
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleToggle = (name: string, enabled: boolean) => {
    api.mcp
      .update(name, { enabled })
      .then(refresh)
      .catch((e) => setError(e.message));
  };

  const handleDelete = (name: string) => {
    api.mcp
      .delete(name)
      .then(refresh)
      .catch((e) => setError(e.message));
  };

  const handleReconnect = (name: string) => {
    api.mcp
      .reconnect(name)
      .then(() => {
        // Refresh after a short delay to pick up new status
        setTimeout(refresh, 1000);
      })
      .catch((e) => setError(e.message));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-background-tertiary border border-border rounded-[var(--radius-xl)] shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Server size={20} />
            <h2 className="text-lg font-semibold">MCP Servers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-glass-hover text-foreground-secondary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-sm text-foreground-secondary">
            Connect to remote MCP servers to give the AI agent access to
            databases, APIs, and other tools.
          </p>

          {servers.length === 0 && !showAdd && (
            <div className="text-center py-8 text-foreground-secondary text-sm">
              No MCP servers configured yet.
            </div>
          )}

          {servers.map((server) => (
            <McpServerCard
              key={server.name}
              server={server}
              onToggle={(enabled) => handleToggle(server.name, enabled)}
              onDelete={() => handleDelete(server.name)}
              onReconnect={() => handleReconnect(server.name)}
            />
          ))}

          {showAdd && (
            <AddServerForm
              onAdd={(s) => {
                api.mcp
                  .add(s)
                  .then(() => {
                    refresh();
                    setShowAdd(false);
                    setError("");
                  })
                  .catch((e) => setError(e.message));
              }}
              onCancel={() => setShowAdd(false)}
            />
          )}
        </div>

        {/* Footer */}
        {!showAdd && (
          <div className="p-4 border-t border-border">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gradient-primary text-white rounded-md hover:brightness-110 transition-all"
            >
              <Plus size={16} /> Add Server
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Status indicator ──

const statusColors: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning animate-pulse",
  disconnected: "bg-foreground-tertiary",
  error: "bg-destructive",
};

const statusLabels: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
  error: "Error",
};

// ── Server card ──

function McpServerCard({
  server,
  onToggle,
  onDelete,
  onReconnect,
}: {
  server: McpServerMeta;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onReconnect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tools, setTools] = useState<McpToolMeta[]>([]);

  useEffect(() => {
    if (expanded && server.toolCount > 0) {
      api.mcp.tools(server.name).then(setTools).catch(console.error);
    }
  }, [expanded, server.name, server.toolCount]);

  return (
    <div className="border border-border rounded-lg">
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-foreground-secondary"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[server.status] ?? statusColors.disconnected}`}
          title={statusLabels[server.status] ?? "Unknown"}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{server.name}</span>
            {server.toolCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full">
                <Wrench size={10} />
                {server.toolCount}
              </span>
            )}
          </div>
          <div className="text-xs text-foreground-secondary truncate">
            {server.url}
          </div>
        </div>

        <button
          onClick={() => onToggle(!server.enabled)}
          title={server.enabled ? "Disable" : "Enable"}
          className="text-foreground-secondary hover:text-foreground"
        >
          {server.enabled ? (
            <ToggleRight size={20} className="text-success" />
          ) : (
            <ToggleLeft size={20} />
          )}
        </button>

        <button
          onClick={onDelete}
          title="Remove server"
          className="text-foreground-secondary hover:text-destructive"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 text-xs space-y-2 border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div>
                <span className="font-medium">URL:</span> {server.url}
              </div>
              <div>
                <span className="font-medium">Transport:</span>{" "}
                {server.transport === "streamable-http" ? "Streamable HTTP" : "SSE"}
              </div>
              <div>
                <span className="font-medium">Status:</span>{" "}
                {statusLabels[server.status] ?? "Unknown"}
                {server.error && (
                  <span className="text-destructive ml-1">({server.error})</span>
                )}
              </div>
            </div>
            <button
              onClick={onReconnect}
              title="Reconnect"
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md glass glass-hover"
            >
              <RefreshCw size={12} /> Reconnect
            </button>
          </div>

          {Object.keys(server.headers).length > 0 && (
            <div>
              <span className="font-medium">Headers:</span>
              <div className="ml-2 mt-1 space-y-0.5">
                {Object.entries(server.headers).map(([k, v]) => (
                  <div key={k} className="font-mono">
                    {k}: {v.length > 30 ? v.slice(0, 30) + "..." : v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tools.length > 0 && (
            <div>
              <span className="font-medium">Tools:</span>
              <div className="ml-2 mt-1 space-y-0.5">
                {tools.map((t) => (
                  <div key={t.name} className="flex gap-2">
                    <span className="font-mono text-primary">{t.name}</span>
                    {t.description && (
                      <span className="text-foreground-tertiary truncate">
                        {t.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add server form ──

function AddServerForm({
  onAdd,
  onCancel,
}: {
  onAdd: (server: {
    name: string;
    url: string;
    transport?: "sse" | "streamable-http";
    headers?: Record<string, string>;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<"sse" | "streamable-http">("sse");
  const [headersStr, setHeadersStr] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const headers: Record<string, string> = {};
    for (const line of headersStr.split("\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) {
        headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }
    }

    onAdd({
      name,
      url,
      transport,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border rounded-lg p-4 space-y-3 bg-muted"
    >
      <h3 className="text-sm font-semibold">Add MCP Server</h3>

      <div>
        <label className="block text-xs font-medium mb-1 text-foreground-secondary">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. my-tools"
          required
          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-foreground-secondary">URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="e.g. http://localhost:3002/sse"
          required
          type="url"
          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-foreground-secondary">Transport</label>
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as "sse" | "streamable-http")}
          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="sse">SSE</option>
          <option value="streamable-http">Streamable HTTP</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-foreground-secondary">
          Headers (Key: Value, one per line)
        </label>
        <textarea
          value={headersStr}
          onChange={(e) => setHeadersStr(e.target.value)}
          placeholder={"Authorization: Bearer sk-..."}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="glass glass-hover px-3 py-1.5 text-sm rounded-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 text-sm bg-gradient-primary text-white rounded-md hover:brightness-110 transition-all"
        >
          Add Server
        </button>
      </div>
    </form>
  );
}
