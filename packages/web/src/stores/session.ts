import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ToolCall {
  tool: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: "running" | "done";
}

interface SessionState {
  sessionId: string | null;
  messages: ChatMessage[];
  currentAssistantText: string;
  isStreaming: boolean;
  activeToolCalls: ToolCall[];

  // Actions
  setSessionId: (id: string) => void;
  addUserMessage: (text: string) => void;
  appendAssistantDelta: (text: string) => void;
  finalizeAssistantMessage: () => void;
  setStreaming: (v: boolean) => void;
  addToolStart: (tool: string, args: unknown) => void;
  completeToolCall: (tool: string, result: unknown, isError: boolean) => void;
  reset: () => void;
}

let msgCounter = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  messages: [],
  currentAssistantText: "",
  isStreaming: false,
  activeToolCalls: [],

  setSessionId: (id) => set({ sessionId: id }),

  addUserMessage: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `msg-${++msgCounter}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
        },
      ],
    })),

  appendAssistantDelta: (text) =>
    set((s) => ({ currentAssistantText: s.currentAssistantText + text })),

  finalizeAssistantMessage: () =>
    set((s) => {
      if (!s.currentAssistantText) return s;
      return {
        messages: [
          ...s.messages,
          {
            id: `msg-${++msgCounter}`,
            role: "assistant",
            content: s.currentAssistantText,
            timestamp: Date.now(),
          },
        ],
        currentAssistantText: "",
      };
    }),

  setStreaming: (v) => set({ isStreaming: v }),

  addToolStart: (tool, args) =>
    set((s) => ({
      activeToolCalls: [...s.activeToolCalls, { tool, args, status: "running" }],
    })),

  completeToolCall: (tool, result, isError) =>
    set((s) => ({
      activeToolCalls: s.activeToolCalls.map((tc) =>
        tc.tool === tool && tc.status === "running"
          ? { ...tc, result, isError, status: "done" as const }
          : tc,
      ),
    })),

  reset: () =>
    set({
      messages: [],
      currentAssistantText: "",
      isStreaming: false,
      activeToolCalls: [],
    }),
}));
