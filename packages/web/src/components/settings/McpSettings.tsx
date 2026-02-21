import { useState, useEffect, useCallback } from "react";
import { api, type McpServerMeta } from "../../api/client";
import {
  Plus,
  Trash2,
  Server,
  ToggleLeft,
  ToggleRight,
  X,
  ChevronDown,
  ChevronRight,
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Server size={20} />
            <h2 className="text-lg font-semibold">MCP Servers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="text-sm text-[var(--destructive)] bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-sm text-[var(--muted-foreground)]">
            Configure MCP (Model Context Protocol) servers to give the AI agent
            access to databases, APIs, and other tools.
          </p>

          {servers.length === 0 && !showAdd && (
            <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">
              No MCP servers configured yet.
            </div>
          )}

          {servers.map((server) => (
            <McpServerCard
              key={server.name}
              server={server}
              onToggle={(enabled) => handleToggle(server.name, enabled)}
              onDelete={() => handleDelete(server.name)}
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
          <div className="p-4 border-t border-[var(--border)]">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90"
            >
              <Plus size={16} /> Add Server
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Server card ──

function McpServerCard({
  server,
  onToggle,
  onDelete,
}: {
  server: McpServerMeta;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[var(--border)] rounded-lg">
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[var(--muted-foreground)]"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div
          className={`w-2 h-2 rounded-full ${server.enabled ? "bg-green-500" : "bg-gray-400"}`}
        />

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{server.name}</div>
          <div className="text-xs text-[var(--muted-foreground)] truncate">
            {server.command} {server.args.join(" ")}
          </div>
        </div>

        <button
          onClick={() => onToggle(!server.enabled)}
          title={server.enabled ? "Disable" : "Enable"}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          {server.enabled ? (
            <ToggleRight size={20} className="text-green-500" />
          ) : (
            <ToggleLeft size={20} />
          )}
        </button>

        <button
          onClick={onDelete}
          title="Remove server"
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 text-xs space-y-1 border-t border-[var(--border)] pt-2">
          <div>
            <span className="font-medium">Command:</span> {server.command}
          </div>
          {server.args.length > 0 && (
            <div>
              <span className="font-medium">Args:</span>{" "}
              {server.args.join(" ")}
            </div>
          )}
          {Object.keys(server.env).length > 0 && (
            <div>
              <span className="font-medium">Environment:</span>
              <div className="ml-2 mt-1 space-y-0.5">
                {Object.entries(server.env).map(([k, v]) => (
                  <div key={k} className="font-mono">
                    {k}={v.length > 20 ? v.slice(0, 20) + "..." : v}
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
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const [envStr, setEnvStr] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const args = argsStr
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean);

    const env: Record<string, string> = {};
    for (const line of envStr.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }

    onAdd({
      name,
      command,
      args: args.length > 0 ? args : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--border)] rounded-lg p-4 space-y-3 bg-[var(--muted)]"
    >
      <h3 className="text-sm font-semibold">Add MCP Server</h3>

      <div>
        <label className="block text-xs font-medium mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. postgres"
          required
          className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Command</label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g. npx"
          required
          className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          Arguments (space-separated)
        </label>
        <input
          value={argsStr}
          onChange={(e) => setArgsStr(e.target.value)}
          placeholder="e.g. -y @modelcontextprotocol/server-postgres"
          className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          Environment (KEY=VALUE, one per line)
        </label>
        <textarea
          value={envStr}
          onChange={(e) => setEnvStr(e.target.value)}
          placeholder={"DATABASE_URL=postgresql://localhost/mydb"}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--accent)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90"
        >
          Add Server
        </button>
      </div>
    </form>
  );
}
