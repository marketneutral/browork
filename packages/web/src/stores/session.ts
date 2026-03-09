import { create } from "zustand";
import type { AskUserQuestion } from "../types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  seq: number;
  /** Base64 images attached by the user (user messages only) */
  attachedImages?: { data: string; mimeType: string }[];
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

export interface TurnImages {
  id: string;
  paths: string[];
  seq: number;
}

export interface SessionListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  starred: boolean;
}

export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface PendingQuestion {
  requestId: string;
  questions: AskUserQuestion[];
}

interface SessionState {
  sessionId: string | null;
  sessions: SessionListItem[];
  messages: ChatMessage[];
  currentAssistantText: string;
  thinkingText: string;
  isStreaming: boolean;
  isCompacting: boolean;
  isLoading: boolean;
  error: string | null;
  activeToolCalls: ToolCall[];
  completedToolGroups: ToolCallGroup[];
  pendingImages: string[];
  completedImageGroups: TurnImages[];
  contextUsage: ContextUsage | null;
  sandboxActive: boolean | null;
  pendingQuestion: PendingQuestion | null;

  // Actions
  setSessionId: (id: string | null) => void;
  setSessions: (sessions: SessionListItem[]) => void;
  setMessages: (messages: Omit<ChatMessage, "seq">[]) => void;
  addUserMessage: (text: string, images?: { data: string; mimeType: string }[]) => void;
  appendAssistantDelta: (text: string) => void;
  appendThinkingDelta: (text: string) => void;
  finalizeAssistantMessage: () => void;
  setStreaming: (v: boolean) => void;
  setCompacting: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  addToolStart: (tool: string, args: unknown) => void;
  completeToolCall: (tool: string, result: unknown, isError: boolean) => void;
  finalizeToolCalls: () => void;
  addPendingImages: (paths: string[]) => void;
  finalizePendingImages: () => void;
  clearPendingImages: () => void;
  addRestoredImageGroup: (paths: string[], seq: number) => void;
  addRestoredToolGroup: (toolCalls: { tool: string; args: unknown; result?: unknown; isError?: boolean }[], seq: number) => void;
  setContextUsage: (usage: ContextUsage) => void;
  setSandboxActive: (active: boolean) => void;
  setPendingQuestion: (pq: PendingQuestion) => void;
  clearPendingQuestion: () => void;
  reset: () => void;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

export function isImagePath(path: string): boolean {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

let msgCounter = 0;
let seqCounter = 0;
let turnCounter = 0;
let imageGroupCounter = 0;

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  currentAssistantText: "",
  thinkingText: "",
  isStreaming: false,
  isCompacting: false,
  isLoading: true,
  error: null,
  activeToolCalls: [],
  completedToolGroups: [],
  pendingImages: [],
  completedImageGroups: [],
  contextUsage: null,
  sandboxActive: null,
  pendingQuestion: null,

  setSessionId: (id) =>
    set({
      sessionId: id,
      // Clear chat state when switching sessions
      messages: [],
      currentAssistantText: "",
      thinkingText: "",
      isStreaming: false,
      activeToolCalls: [],
      completedToolGroups: [],
      pendingImages: [],
      completedImageGroups: [],
      contextUsage: null,
      sandboxActive: null,
      pendingQuestion: null,
    }),

  setSessions: (sessions) => set({ sessions }),

  setMessages: (messages) => {
    // Assign seq to loaded history so timeline ordering works
    const seqd = messages.map((m) => ({ ...m, seq: ++seqCounter }));
    // Re-sequence any activeToolCalls that arrived from rebind before
    // history loaded, so they sort after the loaded messages (not before).
    set((s) => ({
      messages: seqd,
      completedToolGroups: [],
      completedImageGroups: [],
      activeToolCalls: s.activeToolCalls.map((tc) => ({ ...tc, seq: ++seqCounter })),
    }));
  },

  addUserMessage: (text, images) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `msg-${++msgCounter}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
          seq: ++seqCounter,
          ...(images?.length ? { attachedImages: images } : {}),
        },
      ],
    })),

  appendAssistantDelta: (text) =>
    set((s) => ({ currentAssistantText: s.currentAssistantText + text, thinkingText: "" })),

  appendThinkingDelta: (text) =>
    set((s) => ({ thinkingText: s.thinkingText + text })),

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
  setCompacting: (v) => set({ isCompacting: v }),
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

  addPendingImages: (paths) =>
    set((s) => {
      const existing = new Set(s.pendingImages);
      const images = paths.filter((p) => isImagePath(p) && !existing.has(p));
      if (images.length === 0) return s;
      return { pendingImages: [...s.pendingImages, ...images] };
    }),

  finalizePendingImages: () =>
    set((s) => {
      if (s.pendingImages.length === 0) return s;
      const group: TurnImages = {
        id: `images-${++imageGroupCounter}`,
        paths: s.pendingImages,
        seq: ++seqCounter,
      };
      return {
        completedImageGroups: [...s.completedImageGroups, group],
        pendingImages: [],
      };
    }),

  clearPendingImages: () => set({ pendingImages: [] }),

  addRestoredImageGroup: (paths, seq) =>
    set((s) => ({
      completedImageGroups: [
        ...s.completedImageGroups,
        { id: `images-${++imageGroupCounter}`, paths, seq },
      ],
    })),

  addRestoredToolGroup: (toolCalls, seq) =>
    set((s) => ({
      completedToolGroups: [
        ...s.completedToolGroups,
        {
          id: `turn-${++turnCounter}`,
          toolCalls: toolCalls.map((tc) => ({
            tool: tc.tool,
            args: tc.args,
            result: tc.result,
            isError: tc.isError,
            status: "done" as const,
            seq,
          })),
          seq,
        },
      ],
    })),

  setContextUsage: (usage) => set({ contextUsage: usage, isCompacting: false }),

  setSandboxActive: (active) => set({ sandboxActive: active }),

  setPendingQuestion: (pq) => set({ pendingQuestion: pq }),
  clearPendingQuestion: () => set({ pendingQuestion: null }),

  reset: () =>
    set({
      messages: [],
      currentAssistantText: "",
      thinkingText: "",
      isStreaming: false,
      isCompacting: false,
      activeToolCalls: [],
      completedToolGroups: [],
      pendingImages: [],
      completedImageGroups: [],
      contextUsage: null,
      sandboxActive: null,
      pendingQuestion: null,
    }),
}));
