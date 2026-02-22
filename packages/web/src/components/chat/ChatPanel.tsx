import { useRef, useEffect, useMemo } from "react";
import { useSessionStore } from "../../stores/session";
import type { ChatMessage, ToolCall } from "../../stores/session";
import { useSkillsStore } from "../../stores/skills";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ToolCallCard } from "./ToolCallCard";
import { SkillsBar } from "./SkillsBar";
import { SkillBadge } from "./SkillBadge";
import { Sparkles, FileSpreadsheet, BarChart3, Merge } from "lucide-react";

type TimelineItem =
  | { kind: "message"; data: ChatMessage }
  | { kind: "tool"; data: ToolCall; index: number };

interface ChatPanelProps {
  onSendMessage: (text: string) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  onAbort: () => void;
}

const SUGGESTIONS = [
  {
    icon: Sparkles,
    title: "Clean & Transform",
    description: "Fix messy data, remove duplicates, standardize formats",
    prompt: "Clean and transform my uploaded data — fix formatting, remove duplicates, and standardize column names.",
  },
  {
    icon: FileSpreadsheet,
    title: "Financial Report",
    description: "Generate summaries, P&L, and key metrics",
    prompt: "Generate a financial summary report from my uploaded data with key metrics and insights.",
  },
  {
    icon: BarChart3,
    title: "Visualize Data",
    description: "Create charts, plots, and visual summaries",
    prompt: "Create visualizations and charts from my uploaded data to highlight key trends.",
  },
  {
    icon: Merge,
    title: "Merge Datasets",
    description: "Join, concatenate, and reconcile multiple files",
    prompt: "Merge and reconcile my uploaded datasets, matching on common columns.",
  },
];

export function ChatPanel({ onSendMessage, onInvokeSkill, onAbort }: ChatPanelProps) {
  const messages = useSessionStore((s) => s.messages);
  const currentText = useSessionStore((s) => s.currentAssistantText);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const activeToolCalls = useSessionStore((s) => s.activeToolCalls);
  const activeSkill = useSkillsStore((s) => s.activeSkill);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Merge messages and tool calls into a single timeline sorted by seq
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((m): TimelineItem => ({ kind: "message", data: m })),
      ...activeToolCalls.map((tc, i): TimelineItem => ({ kind: "tool", data: tc, index: i })),
    ];
    items.sort((a, b) => {
      const seqA = a.kind === "message" ? a.data.seq : a.data.seq;
      const seqB = b.kind === "message" ? b.data.seq : b.data.seq;
      return seqA - seqB;
    });
    return items;
  }, [messages, activeToolCalls]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, currentText, activeToolCalls]);

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !currentText && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg mx-auto">
              <h2 className="text-4xl text-gradient mb-3 animate-fade-in-up" style={{ fontFamily: "var(--font-display)" }}>Welcome to Browork</h2>
              <p className="text-sm text-foreground-secondary mb-8 animate-fade-in-up stagger-1">
                Your AI-powered analyst. Upload data, run workflows, get insights.
              </p>

              {/* Decorative gradient line */}
              <div className="h-px w-24 mx-auto mb-8 bg-border animate-fade-in stagger-2" />

              {/* Suggestion cards 2x2 grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.title}
                    onClick={() => onSendMessage(s.prompt)}
                    className="glass glass-hover hover-lift rounded-[var(--radius-lg)] p-5 text-left transition-all group animate-fade-in-up"
                    style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                  >
                    <s.icon size={18} className="text-primary mb-2 group-hover:text-primary-hover transition-colors" />
                    <div className="text-sm font-medium text-foreground mb-1">{s.title}</div>
                    <div className="text-xs text-foreground-secondary">{s.description}</div>
                  </button>
                ))}
              </div>

              <p className="text-xs text-foreground-tertiary animate-fade-in stagger-5">
                Type a message or click a suggestion to get started
              </p>
            </div>
          </div>
        )}

        {/* Unified timeline: messages and tool calls in sequence order */}
        {timeline.map((item) =>
          item.kind === "message" ? (
            <MessageBubble key={item.data.id} message={item.data} />
          ) : (
            <ToolCallCard key={`tool-${item.index}`} toolCall={item.data} />
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

        {/* Spacer so the last message isn't hidden behind the sticky status bar */}
        {isStreaming && <div className="h-8 shrink-0" />}

        {/* Status bar — sticky inside scroll area so it doesn't shift the composer */}
        {isStreaming && (
          <div className="sticky bottom-0 -mx-4 px-4 py-1.5 text-xs text-foreground-secondary border-t border-border bg-background-secondary/80 backdrop-blur-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {activeSkill
              ? `Running workflow: ${activeSkill.label}...`
              : "Agent is working..."}
            <button
              onClick={onAbort}
              className="ml-auto text-destructive hover:underline"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Skills bar (workflow buttons) */}
      <SkillsBar onInvokeSkill={onInvokeSkill} disabled={isStreaming} />

      {/* Message composer */}
      <Composer onSend={onSendMessage} disabled={isStreaming} />
    </div>
  );
}
