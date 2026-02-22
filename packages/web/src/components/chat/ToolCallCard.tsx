import { useState } from "react";
import {
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  Pencil,
  Play,
  Wrench,
} from "lucide-react";
import type { ToolCall } from "../../stores/session";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const MAX_RESULT_LINES = 20;

/* ── Label helpers ── */

function getPath(args: unknown): string {
  const a = args as Record<string, unknown> | undefined;
  return (a?.path as string) || (a?.file_path as string) || "file";
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function toolLabel(tool: string, args: unknown, status: "running" | "done"): string {
  const past = status === "done";
  switch (tool) {
    case "read":
      return past ? `Read ${getPath(args)}` : `Reading ${getPath(args)}`;
    case "write":
      return past ? `Wrote ${getPath(args)}` : `Writing ${getPath(args)}`;
    case "edit":
      return past ? `Edited ${getPath(args)}` : `Editing ${getPath(args)}`;
    case "bash": {
      const a = args as Record<string, unknown> | undefined;
      const cmd = (a?.command as string) || "";
      const short = truncate(cmd.split("\n")[0], 40);
      return past ? `Ran ${short}` : `Running ${short}`;
    }
    case "mcp": {
      const a = args as Record<string, unknown> | undefined;
      if (a?.tool) return `MCP: ${a.tool}`;
      if (a?.search) return "MCP: searching tools";
      if (a?.describe) return `MCP: inspecting ${a.describe}`;
      return "MCP tool";
    }
    default:
      return past ? `Used ${tool}` : `Using ${tool}`;
  }
}

/* ── Icon for tool type ── */

function ToolIcon({ tool }: { tool: string }) {
  const cls = "w-3.5 h-3.5 shrink-0";
  switch (tool) {
    case "read":
      return <FileText className={cls} />;
    case "write":
    case "edit":
      return <Pencil className={cls} />;
    case "bash":
      return <Terminal className={cls} />;
    case "mcp":
      return <Wrench className={cls} />;
    default:
      return <Play className={cls} />;
  }
}

/* ── Format args ── */

function FormatArgs({ tool, args }: { tool: string; args: unknown }) {
  const a = args as Record<string, unknown> | undefined;
  if (!a) return null;

  if (tool === "bash") {
    const cmd = (a.command as string) || "";
    return <CodeBlock content={cmd} />;
  }

  if (tool === "read" || tool === "write" || tool === "edit") {
    return (
      <div className="text-xs text-foreground-secondary font-mono px-3 py-1.5">
        {getPath(args)}
      </div>
    );
  }

  if (tool === "mcp") {
    return <CodeBlock content={JSON.stringify(a, null, 2)} />;
  }

  // fallback: raw JSON
  return <CodeBlock content={JSON.stringify(a, null, 2)} />;
}

/* ── Format result ── */

function extractDiff(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  // Direct: { diff: "..." }
  if (typeof r.diff === "string" && r.diff.length > 0) return r.diff;
  // Nested: { details: { diff: "..." } }
  if (typeof r.details === "object" && r.details !== null) {
    const d = (r.details as Record<string, unknown>).diff;
    if (typeof d === "string" && d.length > 0) return d;
  }
  return null;
}

function FormatResult({
  tool,
  result,
  isError,
}: {
  tool: string;
  result: unknown;
  isError?: boolean;
}) {
  if (result === undefined || result === null) return null;

  // Edit tool: render diff with syntax coloring
  if (tool === "edit" && !isError) {
    const diff = extractDiff(result);
    if (diff) return <DiffBlock content={diff} />;
  }

  const text =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);

  if (!text || text === '""' || text === "ok") return null;

  return (
    <TruncatedBlock content={text} isError={isError} />
  );
}

/* ── Diff renderer ── */

function classifyDiffLine(line: string): "add" | "remove" | "ellipsis" | "context" {
  const trimmed = line.trimStart();
  // Added: starts with + then digit(s) (e.g. "+27  code" or "+ 27  code")
  if (/^\+\s*\d/.test(trimmed)) return "add";
  // Removed: starts with - then digit(s)
  if (/^-\s*\d/.test(trimmed)) return "remove";
  // Ellipsis separator
  if (/^\.{3}$/.test(trimmed)) return "ellipsis";
  return "context";
}

function DiffBlock({ content }: { content: string }) {
  const [showAll, setShowAll] = useState(false);
  const lines = content.split("\n");
  const needsTruncation = lines.length > MAX_RESULT_LINES;
  const visible = !showAll && needsTruncation ? lines.slice(0, MAX_RESULT_LINES) : lines;

  return (
    <div>
      <div className="rounded-md bg-background/60 overflow-hidden text-xs font-mono max-h-80 overflow-y-auto">
        {visible.map((line, i) => {
          const kind = classifyDiffLine(line);
          return (
            <div
              key={i}
              className={
                kind === "add"
                  ? "bg-success/8 text-green-400 px-3 py-px"
                  : kind === "remove"
                    ? "bg-destructive/8 text-red-400 px-3 py-px"
                    : kind === "ellipsis"
                      ? "text-foreground-tertiary px-3 py-px text-center"
                      : "text-foreground-secondary px-3 py-px"
              }
            >
              {line || "\u00A0"}
            </div>
          );
        })}
      </div>
      {needsTruncation && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-primary hover:text-primary-hover mt-1 px-3"
        >
          {showAll ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

/* ── Reusable code block ── */

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="text-xs font-mono bg-background/60 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all text-foreground-secondary">
      {content}
    </pre>
  );
}

/* ── Truncated result block with "Show more" ── */

function TruncatedBlock({
  content,
  isError,
}: {
  content: string;
  isError?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const lines = content.split("\n");
  const needsTruncation = lines.length > MAX_RESULT_LINES;
  const displayText =
    !showAll && needsTruncation
      ? lines.slice(0, MAX_RESULT_LINES).join("\n")
      : content;

  return (
    <div>
      <pre
        className={`text-xs font-mono rounded-md px-3 py-2 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-all ${
          isError
            ? "bg-destructive/10 text-destructive"
            : "bg-background/60 text-foreground-secondary"
        }`}
      >
        {displayText}
      </pre>
      {needsTruncation && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-primary hover:text-primary-hover mt-1 px-3"
        >
          {showAll ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

/* ── Main component ── */

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { tool, args, result, isError, status } = toolCall;
  const [expanded, setExpanded] = useState(false);

  const label = toolLabel(tool, args, status);

  // Status icon
  const StatusIcon =
    status === "running" ? (
      <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
    ) : isError ? (
      <X className="w-3.5 h-3.5 text-destructive shrink-0" />
    ) : (
      <Check className="w-3.5 h-3.5 text-success shrink-0" />
    );

  // Chevron
  const Chevron = expanded ? ChevronDown : ChevronRight;

  // Border accent
  const borderClass = status === "running"
    ? "border-l-primary/40"
    : isError
      ? "border-l-destructive/40"
      : "border-l-transparent";

  return (
    <div className="flex justify-start animate-fade-in">
      <div
        className={`w-full max-w-xl rounded-[var(--radius)] border border-border/50 border-l-2 ${borderClass} bg-background-secondary/40 overflow-hidden transition-colors`}
      >
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-glass-hover transition-colors cursor-pointer"
        >
          {StatusIcon}
          <ToolIcon tool={tool} />
          <span
            className={`flex-1 text-left truncate ${
              status === "done" && !isError
                ? "text-foreground-secondary"
                : isError
                  ? "text-destructive"
                  : "text-foreground"
            }`}
          >
            {label}
          </span>
          <Chevron className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
        </button>

        {/* Detail */}
        {expanded && (
          <div className="border-t border-border/30 space-y-0">
            {/* Args */}
            <div className="px-2 py-1.5">
              <FormatArgs tool={tool} args={args} />
            </div>

            {/* Result */}
            {status === "done" && result !== undefined && (
              <div className="px-2 pb-2">
                <FormatResult tool={tool} result={result} isError={isError} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
