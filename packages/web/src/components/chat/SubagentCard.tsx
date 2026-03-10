import { useState } from "react";
import { useSessionStore, type SubagentState } from "../../stores/session";
import { ToolCallCard } from "./ToolCallCard";
import { Bot, ChevronDown, ChevronRight, Terminal, FileText, Pencil, FileOutput, Globe, Search, Puzzle, Wrench } from "lucide-react";

interface SubagentCardProps {
  /** Args from the parent tool call — used to find matching live state */
  args: Record<string, unknown>;
  /** Result from the parent tool call — used for restored state */
  result: unknown;
}

/** Find a live subagent state matching the given name+task */
function findLiveState(
  states: Map<string, SubagentState>,
  name: string,
  task: string,
): SubagentState | null {
  for (const state of states.values()) {
    if (state.name === name && state.task === task) return state;
  }
  return null;
}

const TOOL_META: Record<string, { icon: typeof Terminal; label: string }> = {
  read: { icon: FileText, label: "Read" },
  bash: { icon: Terminal, label: "Bash" },
  write: { icon: FileOutput, label: "Write" },
  edit: { icon: Pencil, label: "Edit" },
  web_search: { icon: Search, label: "Search" },
  web_fetch: { icon: Globe, label: "Fetch" },
};

function ToolPill({ tool }: { tool: string }) {
  const meta = TOOL_META[tool];
  const isMcp = tool.startsWith("mcp__");

  let Icon = meta?.icon || (isMcp ? Puzzle : Wrench);
  let label = meta?.label || (isMcp ? tool.replace(/^mcp__/, "").replace(/__/g, ": ") : tool);

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-foreground/5 text-foreground-tertiary text-[10px]">
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

export function SubagentCard({ args, result }: SubagentCardProps) {
  const subagentStates = useSessionStore((s) => s.subagentStates);
  const [toolsExpanded, setToolsExpanded] = useState(true);

  const name = (args.name as string) || "Sub-agent";
  const task = (args.task as string) || "";

  // Try live state first, then fall back to restored details from result
  const liveState = findLiveState(subagentStates, name, task);

  let state: SubagentState;
  if (liveState) {
    state = liveState;
  } else {
    // Build state from the persisted tool result details
    const details = (result && typeof result === "object" && "details" in (result as any))
      ? (result as any).details as Record<string, unknown>
      : null;
    const restoredToolCalls = (details?.toolCalls as Array<{ tool: string; args: unknown; result?: unknown; isError?: boolean }>) || [];
    state = {
      name,
      task,
      activeTools: (details?.activeTools as string[]) || [],
      toolCalls: restoredToolCalls.map((tc) => ({
        tool: tc.tool,
        args: tc.args,
        result: tc.result,
        isError: tc.isError,
        status: "done" as const,
        seq: 0,
      })),
      currentText: "",
      isComplete: true,
      result: (details?.error as string) || undefined,
      isError: !!(details?.error),
    };
  }

  const { activeTools, toolCalls, currentText, isComplete, result: agentResult, isError } = state;
  const runningCount = toolCalls.filter((tc) => tc.status === "running").length;
  const doneCount = toolCalls.filter((tc) => tc.status === "done").length;
  const ToolsChevron = toolsExpanded ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-2 py-1">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">{name}</span>
        {!isComplete && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        )}
        {isComplete && !isError && (
          <span className="text-[10px] text-success font-medium">Done</span>
        )}
        {isComplete && isError && (
          <span className="text-[10px] text-destructive font-medium">Error</span>
        )}
      </div>

      {/* Capabilities */}
      {activeTools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeTools.map((tool) => (
            <ToolPill key={tool} tool={tool} />
          ))}
        </div>
      )}

      {/* Task description */}
      <div className="text-xs text-foreground-secondary bg-background/40 rounded px-2.5 py-1.5 whitespace-pre-wrap max-h-60 overflow-y-auto">
        {task}
      </div>

      {/* Nested tool calls */}
      {toolCalls.length > 0 && (
        <div>
          <button
            onClick={() => setToolsExpanded((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-foreground-tertiary hover:text-foreground-secondary transition-colors mb-1"
          >
            <ToolsChevron className="w-3 h-3" />
            <span>
              {doneCount} tool call{doneCount !== 1 ? "s" : ""}
              {runningCount > 0 && `, ${runningCount} running`}
            </span>
          </button>
          {toolsExpanded && (
            <div className="space-y-1 pl-1">
              {toolCalls.map((tc, i) => (
                <ToolCallCard key={`${tc.tool}-${i}`} toolCall={tc} nested />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Streaming text from subagent */}
      {!isComplete && currentText && (
        <div className="text-xs text-foreground-secondary bg-background/40 rounded px-2.5 py-1.5 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
          {currentText}
          <span className="inline-block w-1.5 h-3 bg-foreground-tertiary/50 animate-pulse ml-0.5 align-text-bottom" />
        </div>
      )}

      {/* Final result */}
      {isComplete && agentResult && (
        <div
          className={`text-xs rounded px-2.5 py-1.5 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto ${
            isError
              ? "bg-destructive/10 text-destructive"
              : "bg-background/40 text-foreground-secondary"
          }`}
        >
          {agentResult}
        </div>
      )}
    </div>
  );
}
