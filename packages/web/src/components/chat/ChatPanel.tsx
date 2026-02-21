import { useRef, useEffect } from "react";
import { useSessionStore } from "../../stores/session";
import { useSkillsStore } from "../../stores/skills";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ToolCallCard } from "./ToolCallCard";
import { SkillsBar } from "./SkillsBar";
import { SkillBadge } from "./SkillBadge";

interface ChatPanelProps {
  onSendMessage: (text: string) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  onAbort: () => void;
}

export function ChatPanel({ onSendMessage, onInvokeSkill, onAbort }: ChatPanelProps) {
  const messages = useSessionStore((s) => s.messages);
  const currentText = useSessionStore((s) => s.currentAssistantText);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const activeToolCalls = useSessionStore((s) => s.activeToolCalls);
  const activeSkill = useSkillsStore((s) => s.activeSkill);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, currentText]);

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !currentText && (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
            <div className="text-center">
              <h2 className="text-xl font-medium mb-2">Welcome to Browork</h2>
              <p className="text-sm">
                Upload your files and ask me to analyze, clean, or transform
                your data.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Active skill badge */}
        {activeSkill && (
          <SkillBadge skill={activeSkill.skill} label={activeSkill.label} />
        )}

        {/* Active tool calls */}
        {activeToolCalls
          .filter((tc) => tc.status === "running")
          .map((tc, i) => (
            <ToolCallCard key={`tool-${i}`} toolCall={tc} />
          ))}

        {/* Streaming assistant text */}
        {currentText && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "assistant",
              content: currentText,
              timestamp: Date.now(),
            }}
            isStreaming
          />
        )}
      </div>

      {/* Status bar */}
      {isStreaming && (
        <div className="px-4 py-1.5 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          {activeSkill
            ? `Running workflow: ${activeSkill.label}...`
            : "Agent is working..."}
          <button
            onClick={onAbort}
            className="ml-auto text-[var(--destructive)] hover:underline"
          >
            Stop
          </button>
        </div>
      )}

      {/* Skills bar (workflow buttons) */}
      <SkillsBar onInvokeSkill={onInvokeSkill} disabled={isStreaming} />

      {/* Message composer */}
      <Composer onSend={onSendMessage} disabled={isStreaming} />
    </div>
  );
}
