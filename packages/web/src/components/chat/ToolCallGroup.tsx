import { useState } from "react";
import { Check, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import type { ToolCallGroup as ToolCallGroupType } from "../../stores/session";
import { ToolCallCard } from "./ToolCallCard";

interface ToolCallGroupProps {
  group: ToolCallGroupType;
  defaultExpanded?: boolean;
}

function summaryText(group: ToolCallGroupType): string {
  const total = group.toolCalls.length;
  const done = group.toolCalls.filter((tc) => tc.status === "done").length;
  const running = total - done;

  if (running > 0) {
    return `Running ${running === total ? total : `${done + 1} of ${total}`} action${total === 1 ? "" : "s"}...`;
  }
  return `${total} action${total === 1 ? "" : "s"} completed`;
}

export function ToolCallGroup({ group, defaultExpanded = false }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const total = group.toolCalls.length;
  const errors = group.toolCalls.filter((tc) => tc.isError).length;
  const running = group.toolCalls.filter((tc) => tc.status === "running").length;

  const Chevron = expanded ? ChevronDown : ChevronRight;

  const lastCall = group.toolCalls[group.toolCalls.length - 1];
  const lastFailed = lastCall?.isError;

  const StatusIcon =
    running > 0 ? (
      <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
    ) : lastFailed ? (
      <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
    ) : (
      <Check className="w-3.5 h-3.5 text-success shrink-0" />
    );

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="w-full max-w-xl rounded-[var(--radius)] border border-border/50 bg-background-secondary/40 overflow-hidden">
        {/* Collapsed header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-glass-hover transition-colors cursor-pointer"
        >
          {StatusIcon}
          <span className="flex-1 text-left text-foreground-secondary">
            {summaryText(group)}
          </span>
          {errors > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-destructive/15 text-red-400">
              {errors} error{errors === 1 ? "" : "s"}
            </span>
          )}
          <span className="text-foreground-tertiary text-[10px] tabular-nums">{total}</span>
          <Chevron className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
        </button>

        {/* Expanded body */}
        {expanded && (
          <div className="border-t border-border/30 p-2 space-y-1.5">
            {group.toolCalls.map((tc, i) => (
              <ToolCallCard key={`${group.id}-${i}`} toolCall={tc} nested />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
