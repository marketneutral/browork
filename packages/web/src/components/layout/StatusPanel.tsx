import { useState } from "react";
import { useSkillsStore, type McpServerStatus } from "../../stores/skills";
import { Zap, Server, ChevronDown, ChevronRight } from "lucide-react";

export function StatusPanel() {
  const skills = useSkillsStore((s) => s.skills);
  const mcpServers = useSkillsStore((s) => s.mcpServers);
  const mcpTools = useSkillsStore((s) => s.mcpTools);
  const [expanded, setExpanded] = useState(false);

  const skillCount = skills.length;
  const serverCount = mcpServers.length;

  if (skillCount === 0 && serverCount === 0) return null;

  const parts: string[] = [];
  if (skillCount > 0) parts.push(`${skillCount} workflow${skillCount !== 1 ? "s" : ""}`);
  if (serverCount > 0) parts.push(`${serverCount} MCP server${serverCount !== 1 ? "s" : ""}`);

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors"
      >
        <Zap size={12} className="shrink-0" />
        <span className="truncate">{parts.join(" · ")}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2 text-xs">
          {skillCount > 0 && (
            <div>
              <div className="flex items-center gap-1 text-foreground-secondary font-medium mb-0.5">
                <Zap size={10} />
                Workflows
              </div>
              {skills.map((s) => (
                <TipRow key={s.name} text={s.description}>
                  <div className="pl-3.5 text-foreground-secondary truncate py-0.5">
                    {s.name}
                  </div>
                </TipRow>
              ))}
            </div>
          )}

          {serverCount > 0 && (
            <div>
              <div className="flex items-center gap-1 text-foreground-secondary font-medium mb-0.5">
                <Server size={10} />
                MCP Servers
              </div>
              {mcpServers.map((server) => (
                <McpServerItem
                  key={server.name}
                  server={server}
                  tools={mcpTools.filter((t) => t.serverName === server.name)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tooltip row: CSS-only hover, positioned left ──

function TipRow({ text, children }: { text: string; children: React.ReactNode }) {
  if (!text) return <>{children}</>;

  return (
    <div className="group/tip relative">
      {children}
      {/* Tooltip — positioned to the left of the panel */}
      <div
        className="hidden group-hover/tip:block absolute right-full top-1/2 -translate-y-1/2 mr-3 z-[9999] w-max"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="text-[11px] leading-snug rounded-md px-2.5 py-1.5 shadow-lg whitespace-normal"
          style={{
            background: "#1c1c1c",
            border: "1px solid #333",
            color: "#ccc",
            width: 600,
            maxWidth: "50vw",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

// ── MCP server row ──

function McpServerItem({
  server,
  tools,
}: {
  server: McpServerStatus;
  tools: { name: string; description: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const isHealthy = server.status === "connected";
  const dotColor = isHealthy ? "bg-success" : "bg-destructive";
  const statusTip = `${server.url}\n${server.status === "connected" ? "Connected" : server.status === "connecting" ? "Connecting..." : server.error ? "Error: " + server.error : "Disconnected"}`;

  return (
    <div className="pl-1.5">
      <TipRow text={statusTip}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 w-full text-left text-foreground-secondary hover:text-foreground transition-colors py-0.5"
        >
          {tools.length > 0 ? (
            expanded ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />
          ) : (
            <span className="w-2.5 shrink-0" />
          )}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="truncate">{server.name}</span>
          {tools.length > 0 && (
            <span className="text-foreground-tertiary ml-auto shrink-0">{tools.length}</span>
          )}
        </button>
      </TipRow>

      {expanded && tools.length > 0 && (
        <div className="pl-5 mt-0.5 space-y-px">
          {tools.map((t) => (
            <TipRow key={t.name} text={t.description}>
              <div className="text-foreground-tertiary truncate py-0.5">
                {t.name}
              </div>
            </TipRow>
          ))}
        </div>
      )}
    </div>
  );
}
