import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  seq: number;
}

export interface ToolCall {
  tool: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: "running" | "done";
  seq: number;
}

export interface ToolCallGroup {
  id: string;
  toolCalls: ToolCall[];
  seq: number;
}

export interface SessionListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
}

interface SessionState {
  sessionId: string | null;
  sessions: SessionListItem[];
  messages: ChatMessage[];
  currentAssistantText: string;
  isStreaming: boolean;
  isLoading: boolean;
  error: string | null;
  activeToolCalls: ToolCall[];
  completedToolGroups: ToolCallGroup[];

  // Actions
  setSessionId: (id: string | null) => void;
  setSessions: (sessions: SessionListItem[]) => void;
  setMessages: (messages: Omit<ChatMessage, "seq">[]) => void;
  addUserMessage: (text: string) => void;
  appendAssistantDelta: (text: string) => void;
  finalizeAssistantMessage: () => void;
  setStreaming: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  addToolStart: (tool: string, args: unknown) => void;
  completeToolCall: (tool: string, result: unknown, isError: boolean) => void;
  finalizeToolCalls: () => void;
  reset: () => void;
}

let msgCounter = 0;
let seqCounter = 0;
let turnCounter = 0;

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  currentAssistantText: "",
  isStreaming: false,
  isLoading: true,
  error: null,
  activeToolCalls: [],
  completedToolGroups: [],

  setSessionId: (id) =>
    set({
      sessionId: id,
      // Clear chat state when switching sessions
      messages: [],
      currentAssistantText: "",
      isStreaming: false,
      activeToolCalls: [],
      completedToolGroups: [],
    }),

  setSessions: (sessions) => set({ sessions }),

  setMessages: (messages) => {
    // Assign seq to loaded history so timeline ordering works
    const seqd = messages.map((m) => ({ ...m, seq: ++seqCounter }));
    set({ messages: seqd, completedToolGroups: [] });
  },

  addUserMessage: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `msg-${++msgCounter}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
          seq: ++seqCounter,
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
            seq: ++seqCounter,
          },
        ],
        currentAssistantText: "",
      };
    }),

  setStreaming: (v) => set({ isStreaming: v }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (msg) => set({ error: msg }),

  addToolStart: (tool, args) =>
    set((s) => ({
      activeToolCalls: [...s.activeToolCalls, { tool, args, status: "running", seq: ++seqCounter }],
    })),

  completeToolCall: (tool, result, isError) =>
    set((s) => ({
      activeToolCalls: s.activeToolCalls.map((tc) =>
        tc.tool === tool && tc.status === "running"
          ? { ...tc, result, isError, status: "done" as const }
          : tc,
      ),
    })),

  finalizeToolCalls: () =>
    set((s) => {
      if (s.activeToolCalls.length === 0) return s;
      const group: ToolCallGroup = {
        id: `turn-${++turnCounter}`,
        toolCalls: s.activeToolCalls,
        seq: s.activeToolCalls[0].seq,
      };
      return {
        completedToolGroups: [...s.completedToolGroups, group],
        activeToolCalls: [],
      };
    }),

  reset: () =>
    set({
      messages: [],
      currentAssistantText: "",
      isStreaming: false,
      activeToolCalls: [],
      completedToolGroups: [],
    }),
}));
