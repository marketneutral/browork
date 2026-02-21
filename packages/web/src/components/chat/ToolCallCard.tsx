import type { ToolCall } from "../../stores/session";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

function mcpLabel(args: unknown): string {
  const a = args as Record<string, unknown> | undefined;
  if (!a) return "Querying MCP server...";
  if (a.search) return `MCP: searching tools...`;
  if (a.describe) return `MCP: inspecting ${a.describe}...`;
  if (a.tool) return `MCP: ${a.tool}...`;
  return "Querying MCP server...";
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const label =
    toolCall.tool === "read"
      ? `Reading ${(toolCall.args as any)?.path || "file"}...`
      : toolCall.tool === "write"
        ? `Writing ${(toolCall.args as any)?.path || "file"}...`
        : toolCall.tool === "edit"
          ? `Editing ${(toolCall.args as any)?.path || "file"}...`
          : toolCall.tool === "bash"
            ? `Running command...`
            : toolCall.tool === "mcp"
              ? mcpLabel(toolCall.args)
              : `Using ${toolCall.tool}...`;

  return (
    <div className="flex justify-start">
      <div className="bg-[var(--accent)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--muted-foreground)] flex items-center gap-2">
        {toolCall.status === "running" && (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {label}
      </div>
    </div>
  );
}
