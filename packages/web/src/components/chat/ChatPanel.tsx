import { useRef, useEffect, useMemo } from "react";
import { useSessionStore } from "../../stores/session";
import type { ChatMessage, ToolCallGroup as ToolCallGroupType, TurnImages } from "../../stores/session";
import { useSkillsStore } from "../../stores/skills";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ToolCallGroup } from "./ToolCallGroup";
import { InlineImageGroup } from "./InlineImageGroup";
import { SkillBadge } from "./SkillBadge";
import { APP_NAME } from "../../config";
import { toolLabel } from "../../utils/tool-labels";

type TimelineItem =
  | { kind: "message"; data: ChatMessage }
  | { kind: "tool_group"; data: ToolCallGroupType }
  | { kind: "image_group"; data: TurnImages };

interface ChatPanelProps {
  onSendMessage: (text: string) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  onAbort: () => void;
  onCompact: () => void;
}

export function ChatPanel({ onSendMessage, onInvokeSkill, onAbort, onCompact }: ChatPanelProps) {
  const messages = useSessionStore((s) => s.messages);
  const currentText = useSessionStore((s) => s.currentAssistantText);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const activeToolCalls = useSessionStore((s) => s.activeToolCalls);
  const completedToolGroups = useSessionStore((s) => s.completedToolGroups);
  const completedImageGroups = useSessionStore((s) => s.completedImageGroups);
  const activeSkill = useSkillsStore((s) => s.activeSkill);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Merge messages and tool call groups into a single timeline sorted by seq
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((m): TimelineItem => ({ kind: "message", data: m })),
      ...completedToolGroups.map((g): TimelineItem => ({ kind: "tool_group", data: g })),
      ...completedImageGroups.map((g): TimelineItem => ({ kind: "image_group", data: g })),
    ];
    // Wrap live activeToolCalls in a synthetic group so they render inside a group too
    if (activeToolCalls.length > 0) {
      items.push({
        kind: "tool_group",
        data: { id: "live", toolCalls: activeToolCalls, seq: activeToolCalls[0].seq },
      });
    }
    items.sort((a, b) => a.data.seq - b.data.seq);
    return items;
  }, [messages, completedToolGroups, completedImageGroups, activeToolCalls]);

  // Derive the latest running tool label for the status bar
  const runningToolLabel = useMemo(() => {
    const running = [...activeToolCalls].reverse().find((tc) => tc.status === "running");
    return running ? toolLabel(running.tool, running.args, "running") + "..." : null;
  }, [activeToolCalls]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, currentText, activeToolCalls, completedToolGroups, completedImageGroups]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !currentText && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg mx-auto">
              <h2 className="text-4xl text-gradient mb-3 animate-fade-in-up" style={{ fontFamily: "var(--font-display)" }}>{`Welcome to ${APP_NAME}`}</h2>
              <p className="text-sm text-foreground-secondary mb-8 animate-fade-in-up stagger-1">
                You AI-powered analyst.<br />
                Upload files and data, run workflows, generate reports, get insights.
              </p>

              {/* Decorative gradient line */}
              <div className="h-px w-24 mx-auto mb-8 bg-border animate-fade-in stagger-2" />

              <p className="text-xs text-foreground-tertiary animate-fade-in stagger-3">
                Type a message or press <kbd className="px-1.5 py-0.5 rounded bg-surface-glass text-foreground-secondary font-mono text-[11px]">/</kbd> to access skills or workflows
              </p>
            </div>
          </div>
        )}

        {/* Unified timeline: messages and tool call groups in sequence order */}
        {timeline.map((item) =>
          item.kind === "message" ? (
            <MessageBubble key={item.data.id} message={item.data} />
          ) : item.kind === "tool_group" ? (
            <ToolCallGroup
              key={item.data.id}
              group={item.data}
            />
          ) : (
            <InlineImageGroup
              key={item.data.id}
              paths={item.data.paths}
            />
          ),
        )}

        {/* Active skill badge */}
        {activeSkill && (
          <SkillBadge skill={activeSkill.skill} label={activeSkill.label} />
        )}

        {/* Streaming assistant text */}
        {currentText && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "assistant",
              content: currentText,
              timestamp: Date.now(),
              seq: Infinity,
            }}
            isStreaming
          />
        )}

      </div>

      {/* Agent status bar — always visible above composer */}
      <div className="px-4 pt-1.5 text-xs text-foreground-tertiary border-t border-border flex items-center gap-2">
        {isStreaming ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-foreground-secondary">
              {activeSkill
                ? `Running workflow: ${activeSkill.label}...`
                : runningToolLabel ?? "Thinking..."}
            </span>
            <button
              onClick={onAbort}
              className="ml-auto text-destructive hover:underline"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-foreground-tertiary/50" />
            Agent is idle.
          </>
        )}
      </div>

      {/* Message composer */}
      <Composer onSend={onSendMessage} onInvokeSkill={onInvokeSkill} onCompact={onCompact} disabled={isStreaming} />
    </div>
  );
}
