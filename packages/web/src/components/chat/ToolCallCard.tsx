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
  Search,
  Globe,
} from "lucide-react";
import type { ToolCall } from "../../stores/session";
import { toolLabel, getPath } from "../../utils/tool-labels";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const MAX_RESULT_LINES = 20;

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
    case "web_search":
      return <Search className={cls} />;
    case "web_fetch":
      return <Globe className={cls} />;
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

  // Bash args are redundant — command is shown in BashResult header
  if (tool === "bash") return null;

  if (tool === "read" || tool === "write" || tool === "edit") {
    return (
      <div className="text-xs text-foreground-secondary font-mono px-3 py-1.5">
        {getPath(args)}
      </div>
    );
  }

  if (tool === "web_search") {
    return (
      <div className="text-xs text-foreground-secondary px-3 py-1.5">
        {(a?.query as string) || ""}
      </div>
    );
  }

  if (tool === "web_fetch") {
    const url = (a?.url as string) || "";
    return (
      <div className="text-xs text-foreground-secondary font-mono px-3 py-1.5 truncate">
        {url}
      </div>
    );
  }

  if (tool === "mcp") {
    return <CodeBlock content={JSON.stringify(a, null, 2)} />;
  }

  // fallback: raw JSON
  return <CodeBlock content={JSON.stringify(a, null, 2)} />;
}

/* ── Result data helpers ── */

function extractText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  // { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(r.content)) {
    const first = r.content[0] as Record<string, unknown> | undefined;
    if (first && typeof first.text === "string") return first.text;
  }
  return null;
}

function extractDetails(result: unknown): Record<string, unknown> | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  if (typeof r.details === "object" && r.details !== null) {
    return r.details as Record<string, unknown>;
  }
  return null;
}

function formatBytes(n: unknown): string {
  if (typeof n !== "number" || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Bash result ── */

function BashResult({ args, result, isError }: { args: unknown; result: unknown; isError?: boolean }) {
  const a = args as Record<string, unknown> | undefined;
  const command = (a?.command as string) || "";
  const details = extractDetails(result);
  const output = (details?.output as string) ?? extractText(result) ?? "";
  const exitCode = details?.exitCode as number | undefined;

  return (
    <div className="space-y-1.5">
      {/* Command prompt header */}
      <div className="text-xs font-mono px-3 py-1.5 text-foreground">
        <span className="text-foreground-tertiary">$ </span>
        {command}
      </div>

      {/* Output */}
      {output && (
        <TruncatedBlock
          content={output}
          isError={isError}
        />
      )}

      {/* Exit code badge */}
      {exitCode !== undefined && (
        <div className="px-3 pb-0.5">
          <span
            className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              exitCode === 0
                ? "bg-success/15 text-green-400"
                : "bg-destructive/15 text-red-400"
            }`}
          >
            exit {exitCode}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Read result ── */

function ReadResult({ result }: { result: unknown }) {
  const text = extractText(result);
  const details = extractDetails(result);
  const truncation = details?.truncation as Record<string, unknown> | undefined;

  if (!text) return null;

  return (
    <div className="space-y-1">
      <TruncatedBlock content={text} />
      {truncation && (
        <div className="text-[11px] text-foreground-tertiary px-3">
          Truncated — showing {Number(truncation.truncatedAt).toLocaleString()} of{" "}
          {Number(truncation.total).toLocaleString()} lines
        </div>
      )}
    </div>
  );
}

/* ── Write result ── */

function WriteResult({ result }: { result: unknown }) {
  const details = extractDetails(result);
  if (!details) {
    // Fallback for simple string results
    const text = extractText(result);
    if (text && text !== "ok") return <div className="text-xs text-foreground-tertiary px-3 py-1">{text}</div>;
    return null;
  }

  const created = details.created as boolean | undefined;
  const size = details.size;
  const label = created ? "Created" : "Updated";

  return (
    <div className="text-xs text-foreground-tertiary px-3 py-1 font-mono">
      {label} · {formatBytes(size)}
    </div>
  );
}

/* ── Web search result ── */

interface SearchResultEntry {
  title: string;
  url: string;
  snippet: string;
}

function parseSearchResults(text: string): SearchResultEntry[] {
  const entries: SearchResultEntry[] = [];
  // Format: "1. Title\n   URL\n   Description"
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.length >= 3) {
      const title = lines[0].replace(/^\d+\.\s*/, "");
      const url = lines[1];
      const snippet = lines.slice(2).join(" ");
      if (title && url) entries.push({ title, url, snippet });
    }
  }
  return entries;
}

function WebSearchResult({ result }: { result: unknown }) {
  const text = extractText(result);
  if (!text) return null;

  const entries = parseSearchResults(text);
  if (entries.length === 0) {
    return <TruncatedBlock content={text} />;
  }

  return (
    <div className="space-y-1.5 px-3 py-1.5">
      {entries.map((entry, i) => (
        <a
          key={i}
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-md bg-background/60 px-3 py-2 hover:bg-surface-glass-hover transition-colors"
        >
          <div className="text-xs font-medium text-primary truncate">{entry.title}</div>
          <div className="text-[10px] text-foreground-tertiary font-mono truncate mt-0.5">
            {entry.url}
          </div>
          {entry.snippet && (
            <div className="text-xs text-foreground-secondary mt-1 line-clamp-2">
              {entry.snippet}
            </div>
          )}
        </a>
      ))}
    </div>
  );
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
  args,
  result,
  isError,
}: {
  tool: string;
  args: unknown;
  result: unknown;
  isError?: boolean;
}) {
  if (result === undefined || result === null) return null;

  // Errors: render as plain text
  if (isError) {
    const text = typeof result === "string" ? result : extractText(result) ?? JSON.stringify(result, null, 2);
    return <TruncatedBlock content={text} isError />;
  }

  // Edit tool: render diff with syntax coloring
  if (tool === "edit") {
    const diff = extractDiff(result);
    if (diff) return <DiffBlock content={diff} />;
  }

  // Web search: clickable result cards
  if (tool === "web_search") {
    return <WebSearchResult result={result} />;
  }

  // Web fetch: markdown content
  if (tool === "web_fetch") {
    const text = extractText(result);
    if (text) return <TruncatedBlock content={text} />;
  }

  // Bash: terminal-style rendering
  if (tool === "bash") {
    return <BashResult args={args} result={result} />;
  }

  // Read: file content preview
  if (tool === "read") {
    return <ReadResult result={result} />;
  }

  // Write: minimal confirmation
  if (tool === "write") {
    return <WriteResult result={result} />;
  }

  // Generic fallback
  const text =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);

  if (!text || text === '""' || text === "ok") return null;

  return (
    <TruncatedBlock content={text} />
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
                <FormatResult tool={tool} args={args} result={result} isError={isError} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
