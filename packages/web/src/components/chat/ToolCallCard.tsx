import type { ToolCall } from "../../stores/session";

interface ToolCallCardProps {
  toolCall: ToolCall;
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
