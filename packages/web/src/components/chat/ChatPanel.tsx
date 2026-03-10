import { useState, useRef, useEffect, useMemo } from "react";
import { useSessionStore } from "../../stores/session";
import type { ChatMessage, ToolCallGroup as ToolCallGroupType, TurnImages } from "../../stores/session";
import { useSkillsStore } from "../../stores/skills";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ToolCallGroup } from "./ToolCallGroup";
import { InlineImageGroup } from "./InlineImageGroup";
import { AskUserCard } from "./AskUserCard";
import { APP_NAME } from "../../config";
import { toolLabel } from "../../utils/tool-labels";
import type { AskUserAnswer } from "../../types";

/** Extract the last meaningful line from streaming thinking text, truncated for the status bar. */
function thinkingSnippet(text: string): string {
  // Take the last non-empty line
  const lines = text.split("\n").filter((l) => l.trim());
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (!last) return "Thinking...";
  const truncated = last.length > 80 ? last.slice(0, 80) + "\u2026" : last;
  return `Thinking: ${truncated}`;
}

type TimelineItem =
  | { kind: "message"; data: ChatMessage }
  | { kind: "tool_group"; data: ToolCallGroupType }
  | { kind: "image_group"; data: TurnImages };

interface ChatPanelProps {
  onSendMessage: (text: string, images?: { data: string; mimeType: string }[]) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  onAbort: () => void;
  onCompact: () => void;
  onAnswerQuestion: (requestId: string, answers: AskUserAnswer[]) => void;
  onSetThinkingLevel: (level: "low" | "medium" | "high") => void;
}

export function ChatPanel({ onSendMessage, onInvokeSkill, onAbort, onCompact, onAnswerQuestion, onSetThinkingLevel }: ChatPanelProps) {
  const messages = useSessionStore((s) => s.messages);
  const currentText = useSessionStore((s) => s.currentAssistantText);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const isCompacting = useSessionStore((s) => s.isCompacting);
  const activeToolCalls = useSessionStore((s) => s.activeToolCalls);
  const completedToolGroups = useSessionStore((s) => s.completedToolGroups);
  const completedImageGroups = useSessionStore((s) => s.completedImageGroups);
  const historyLoaded = useSessionStore((s) => s.historyLoaded);
  const pendingQuestion = useSessionStore((s) => s.pendingQuestion);
  const thinkingText = useSessionStore((s) => s.thinkingText);
  const thinkingLevel = useSessionStore((s) => s.thinkingLevel);
  const activeSkill = useSkillsStore((s) => s.activeSkill);
  const scrollRef = useRef<HTMLDivElement>(null);
  const thinkingPanelRef = useRef<HTMLPreElement>(null);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // Auto-close thinking popover when thinking ends
  useEffect(() => {
    if (!thinkingText) setThinkingOpen(false);
  }, [thinkingText]);

  // Auto-scroll thinking panel while streaming
  useEffect(() => {
    if (thinkingOpen && thinkingPanelRef.current) {
      thinkingPanelRef.current.scrollTop = thinkingPanelRef.current.scrollHeight;
    }
  }, [thinkingOpen, thinkingText]);

  // Merge messages and tool call groups into a single timeline sorted by seq
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((m): TimelineItem => ({ kind: "message", data: m })),
      ...completedToolGroups.map((g): TimelineItem => ({ kind: "tool_group", data: g })),
      ...completedImageGroups.map((g): TimelineItem => ({ kind: "image_group", data: g })),
    ];
    // Wrap live activeToolCalls in a synthetic group so they render inside a group too.
    // Wait until history has loaded so rebind tool calls don't flash at the top.
    if (historyLoaded && activeToolCalls.length > 0) {
      items.push({
        kind: "tool_group",
        data: { id: "live", toolCalls: activeToolCalls, seq: activeToolCalls[0].seq },
      });
    }
    items.sort((a, b) => a.data.seq - b.data.seq);
    return items;
  }, [messages, completedToolGroups, completedImageGroups, activeToolCalls, historyLoaded]);

  // Derive the latest running tool label for the status bar
  const runningToolLabel = useMemo(() => {
    const running = [...activeToolCalls].reverse().find((tc) => tc.status === "running");
    return running ? toolLabel(running.tool, running.args, "running") + "..." : null;
  }, [activeToolCalls]);

  // Auto-scroll to bottom on new content (instant during streaming to avoid jitter)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, currentText, activeToolCalls, completedToolGroups, completedImageGroups, pendingQuestion]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !currentText && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg mx-auto">
              <h2 className="text-4xl text-gradient mb-3 animate-fade-in-up" style={{ fontFamily: "var(--font-display)" }}>{`Welcome to ${APP_NAME}`}</h2>
              <p className="text-sm text-foreground-secondary mb-8 animate-fade-in-up stagger-1">
                Your AI-powered financial analyst.<br />
                Upload files and data, query structured databases, perform qualitative and quantitative research, get insights, generate reports, interactive visualizations, spreadsheets, and presentations.
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

        {/* Streaming assistant text */}
        {historyLoaded && currentText && (
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

        {/* Pending ask_user question */}
        {pendingQuestion && (
          <AskUserCard
            requestId={pendingQuestion.requestId}
            questions={pendingQuestion.questions}
            onSubmit={onAnswerQuestion}
          />
        )}

      </div>

      {/* Thinking popover — above status bar */}
      {thinkingOpen && thinkingText && (
        <div className="mx-4 mb-1 border border-border/50 rounded-lg bg-surface-glass shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
            <span className="text-xs text-foreground-tertiary italic">Extended thinking</span>
            <button
              onClick={() => setThinkingOpen(false)}
              className="text-xs text-foreground-tertiary hover:text-foreground-secondary"
            >
              Close
            </button>
          </div>
          <pre
            ref={thinkingPanelRef}
            className="px-3 py-2 text-xs font-mono text-foreground-tertiary max-h-48 overflow-y-auto whitespace-pre-wrap break-words"
          >
            {thinkingText}
            <span className="inline-block w-1.5 h-3.5 bg-foreground-tertiary/50 animate-pulse ml-0.5 align-text-bottom" />
          </pre>
        </div>
      )}

      {/* Agent status bar — always visible above composer */}
      <div className="px-4 pt-1.5 text-xs text-foreground-tertiary border-t border-border flex items-center gap-2">
        {isStreaming ? (
          <>
            <span className={`w-1.5 h-1.5 rounded-full ${pendingQuestion ? "bg-warning" : "bg-primary"} animate-pulse`} />
            <span className="text-foreground-secondary truncate">
              {pendingQuestion
                ? "Waiting for your response..."
                : runningToolLabel ?? (thinkingText ? (
                    <button
                      onClick={() => setThinkingOpen((v) => !v)}
                      className="hover:text-foreground transition-colors cursor-pointer"
                    >
                      {thinkingSnippet(thinkingText)}
                    </button>
                  ) : "Thinking...")}
            </span>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={onAbort}
                className="text-destructive hover:underline"
              >
                Stop
              </button>
              <ThinkingLevelSelector level={thinkingLevel} onChange={onSetThinkingLevel} />
            </div>
          </>
        ) : isCompacting ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-foreground-secondary">Compacting context...</span>
            <div className="ml-auto shrink-0">
              <ThinkingLevelSelector level={thinkingLevel} onChange={onSetThinkingLevel} />
            </div>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-foreground-tertiary/50" />
            Agent is idle.
            <div className="ml-auto shrink-0">
              <ThinkingLevelSelector level={thinkingLevel} onChange={onSetThinkingLevel} />
            </div>
          </>
        )}
      </div>

      {/* Message composer */}
      <Composer onSend={onSendMessage} onInvokeSkill={onInvokeSkill} onCompact={onCompact} disabled={isStreaming || isCompacting} />
    </div>
  );
}

function ThinkingLevelSelector({ level, onChange }: { level: "low" | "medium" | "high"; onChange: (level: "low" | "medium" | "high") => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-surface-glass rounded-md p-0.5" title="Thinking depth">
      {(["low", "medium", "high"] as const).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
            level === l
              ? "bg-primary/20 text-primary"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          }`}
        >
          {l === "low" ? "Low" : l === "medium" ? "Med" : "High"}
        </button>
      ))}
    </div>
  );
}
