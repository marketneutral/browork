import type { ChatMessage } from "../../stores/session";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "bg-[var(--muted)] text-[var(--foreground)]"
        }`}
      >
        {/* Simple markdown-ish rendering for Phase 1 */}
        {message.content.split("\n").map((line, i) => (
          <p key={i} className={i > 0 ? "mt-2" : ""}>
            {renderInline(line)}
          </p>
        ))}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
}

/** Minimal inline markdown: **bold** and `code` */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-black/10 px-1 py-0.5 rounded text-xs font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
