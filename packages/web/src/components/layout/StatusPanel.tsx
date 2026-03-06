import { useState } from "react";
import { useSkillsStore, type McpServerStatus, type SkillMeta } from "../../stores/skills";
import { useSessionStore } from "../../stores/session";
import { api } from "../../api/client";
import { Zap, Server, ChevronDown, ChevronRight, ArrowUp, ArrowDown, X } from "lucide-react";

export function StatusPanel() {
  const skills = useSkillsStore((s) => s.skills);
  const userSkills = useSkillsStore((s) => s.userSkills);
  const sessionSkills = useSkillsStore((s) => s.sessionSkills);
  const mcpServers = useSkillsStore((s) => s.mcpServers);
  const mcpTools = useSkillsStore((s) => s.mcpTools);
  const sessionId = useSessionStore((s) => s.sessionId);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSkills = skills.length + userSkills.length + sessionSkills.length;
  const serverCount = mcpServers.length;

  if (totalSkills === 0 && serverCount === 0) return null;

  const allServersHealthy = serverCount > 0 && mcpServers.every((s) => s.status === "connected");
  const mcpDotColor = serverCount === 0 ? null : allServersHealthy ? "bg-success" : "bg-destructive";

  const parts: string[] = [];
  if (serverCount > 0) parts.push(`${serverCount} MCP server${serverCount !== 1 ? "s" : ""}`);
  if (totalSkills > 0) parts.push(`${totalSkills} skill${totalSkills !== 1 ? "s" : ""}`);

  const handlePromote = async (dirName: string) => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.skills.promote(sessionId, dirName);
      const [user, session] = await Promise.all([
        api.skills.listUser(),
        api.skills.listSession(sessionId),
      ]);
      useSkillsStore.getState().setUserSkills(user);
      useSkillsStore.getState().setSessionSkills(session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to promote skill");
    } finally {
      setBusy(false);
    }
  };

  const handleDemote = async (dirName: string) => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.skills.demote(sessionId, dirName);
      const [user, session] = await Promise.all([
        api.skills.listUser(),
        api.skills.listSession(sessionId),
      ]);
      useSkillsStore.getState().setUserSkills(user);
      useSkillsStore.getState().setSessionSkills(session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to demote skill");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (dirName: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.skills.deleteUser(dirName);
      const user = await api.skills.listUser();
      useSkillsStore.getState().setUserSkills(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete skill");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-foreground transition-colors"
      >
        {mcpDotColor && <span className={`w-2 h-2 rounded-full shrink-0 ${mcpDotColor}`} />}
        {!mcpDotColor && <Zap size={12} className="shrink-0" />}
        <span className="truncate">{parts.join(" · ")}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2 text-xs max-h-[40vh] overflow-y-auto">
          {error && (
            <p className="text-destructive text-[11px] py-1">{error}</p>
          )}
          {/* Built-in (admin) skills */}
          {skills.length > 0 && (
            <SkillGroup label="Built-in Skills" skills={skills} />
          )}

          {/* User-installed cross-session skills */}
          {userSkills.length > 0 && (
            <SkillGroup
              label="My Private Skills"
              skills={userSkills}
              actions={(skill) => (
                <>
                  <ActionButton
                    title="Edit in session"
                    onClick={() => handleDemote(skill.dirName)}
                    disabled={busy}
                  >
                    <ArrowDown size={10} />
                  </ActionButton>
                  <ActionButton
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) {
                        handleDeleteUser(skill.dirName);
                      }
                    }}
                    className="hover:text-destructive"
                    disabled={busy}
                  >
                    <X size={10} />
                  </ActionButton>
                </>
              )}
            />
          )}

          {/* Session-local skills */}
          {sessionSkills.length > 0 && (
            <SkillGroup
              label="My Private Skills (this session only)"
              skills={sessionSkills}
              actions={(skill) => (
                <ActionButton
                  title="Install for all sessions"
                  onClick={() => handlePromote(skill.dirName)}
                  disabled={busy}
                >
                  <ArrowUp size={10} />
                </ActionButton>
              )}
            />
          )}

          {/* MCP Servers */}
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

// ── Skill group section ──

function SkillGroup({
  label,
  skills,
  actions,
}: {
  label: string;
  skills: SkillMeta[];
  actions?: (skill: SkillMeta) => React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-foreground-secondary font-medium mb-0.5">
        <Zap size={10} />
        {label}
      </div>
      {skills.map((s) => (
        <TipRow key={s.name} text={s.description}>
          <div className="pl-3.5 text-foreground-secondary truncate py-0.5 flex items-center gap-1">
            <span className="truncate">{s.name}</span>
            {actions && (
              <span className="ml-auto flex items-center gap-0.5 shrink-0">
                {actions(s)}
              </span>
            )}
          </div>
        </TipRow>
      ))}
    </div>
  );
}

// ── Small action button ──

function ActionButton({
  title,
  onClick,
  className = "",
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`p-0.5 rounded hover:bg-surface-glass text-foreground-tertiary hover:text-foreground transition-colors ${disabled ? "opacity-40 pointer-events-none" : ""} ${className}`}
    >
      {children}
    </button>
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
            width: 400,
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
