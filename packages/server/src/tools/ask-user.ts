/**
 * ask_user — Interactive question tool for the Pi agent.
 *
 * Lets Pi pause execution to ask the user a multiple-choice question
 * through the chat UI. The tool's execute() blocks on a deferred Promise
 * that resolves when the user's response arrives via WebSocket.
 *
 * Registered as a Pi SDK customTool (ToolDefinition object).
 */

import { Type } from "@sinclair/typebox";

// ── Shared types ──

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  question: string;
  options: AskUserOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
}

export interface AskUserAnswer {
  question: string;
  selected: string[];
}

// ── Types matching Pi SDK ToolDefinition shape ──

interface ToolResult {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}

interface ToolDefinitionLike {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: any,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ): Promise<ToolResult>;
}

// ── Deferred promise registry ──

interface Deferred {
  resolve: (answers: AskUserAnswer[]) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Deferred>();

let requestCounter = 0;

/**
 * Register a deferred promise for a pending ask_user request.
 * Used by the mock session to simulate the ask_user flow.
 */
export function registerPending(
  requestId: string,
  resolve: (answers: AskUserAnswer[]) => void,
  reject: (reason: Error) => void,
  timeoutId: ReturnType<typeof setTimeout>,
): void {
  pending.set(requestId, { resolve, reject, timeoutId });
}

/**
 * Resolve a pending ask_user request with user-supplied answers.
 * Returns true if the request was found and resolved.
 */
export function resolveQuestion(requestId: string, answers: AskUserAnswer[]): boolean {
  const deferred = pending.get(requestId);
  if (!deferred) return false;
  clearTimeout(deferred.timeoutId);
  pending.delete(requestId);
  deferred.resolve(answers);
  return true;
}

/**
 * Reject all pending requests whose requestId starts with the given prefix.
 * Called on session dispose to clean up.
 */
export function rejectAllPending(sessionPrefix: string): void {
  for (const [id, deferred] of pending) {
    if (id.startsWith(sessionPrefix)) {
      clearTimeout(deferred.timeoutId);
      pending.delete(id);
      deferred.reject(new Error("Session ended"));
    }
  }
}

// ── WebSocket event type (sent to frontend) ──

export interface AskUserEvent {
  type: "ask_user";
  requestId: string;
  questions: AskUserQuestion[];
}

// ── Tool factory ──

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function createAskUserTool(
  sessionId: string,
  sendEvent: (event: AskUserEvent) => void,
): ToolDefinitionLike {
  return {
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a question with multiple-choice options. Use this when you need clarification, confirmation, or a decision from the user before proceeding. The user will see the question in the chat and can select from the provided options. Wait for their response before continuing.",
    parameters: Type.Object({
      questions: Type.Array(
        Type.Object({
          question: Type.String({ description: "The question to ask" }),
          options: Type.Array(
            Type.Object({
              label: Type.String({ description: "Short descriptive label for the option (do NOT prefix with letters like A, B, C)" }),
              description: Type.Optional(
                Type.String({ description: "Longer description of what this option means" }),
              ),
            }),
            { description: "Available choices (2-6 options)", minItems: 2, maxItems: 6 },
          ),
          multiSelect: Type.Optional(
            Type.Boolean({ description: "Allow selecting multiple options (default: false)" }),
          ),
          allowOther: Type.Optional(
            Type.Boolean({ description: "Show a free-text 'Other' input (default: true)" }),
          ),
        }),
        { description: "Questions to ask (1-4)", minItems: 1, maxItems: 4 },
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const { questions } = params as { questions: AskUserQuestion[] };
      const requestId = `${sessionId}:ask:${++requestCounter}`;

      // Send the question to the frontend
      sendEvent({ type: "ask_user", requestId, questions });

      // Block until the user responds or timeout
      const answers = await new Promise<AskUserAnswer[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("User did not respond within 5 minutes"));
        }, TIMEOUT_MS);

        pending.set(requestId, { resolve, reject, timeoutId });

        // Listen for abort signal
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            pending.delete(requestId);
            reject(new Error("Request aborted"));
          }, { once: true });
        }
      });

      // Format answers as readable text for the agent
      const formatted = answers
        .map((a) => `Q: ${a.question}\nA: ${a.selected.join(", ")}`)
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
        details: { requestId, answerCount: answers.length },
      };
    },
  };
}
