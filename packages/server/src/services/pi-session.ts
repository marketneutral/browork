/**
 * Pi Session Service
 *
 * Wraps the Pi coding agent SDK. Creates sessions, translates Pi events
 * into Browork WebSocket events, and manages session lifecycle.
 *
 * Pi SDK: @mariozechner/pi-coding-agent
 * Events flow: Pi AgentSession → subscribe() → translate → WebSocket
 */

import type { WebSocket } from "ws";
import { translatePiEvent } from "../utils/event-translator.js";
import { resolve, join } from "path";
import { existsSync } from "fs";
import { isSandboxEnabled, ensureSandbox, createSandboxBashOps, createSandboxFileOps } from "./sandbox-manager.js";
import { createWebTools } from "../tools/web-tools.js";
import { createAskUserTool, resolveQuestion, rejectAllPending, registerPending } from "../tools/ask-user.js";
import type { AskUserAnswer, AskUserEvent, AskUserQuestion } from "../tools/ask-user.js";
import { mcpClientManager } from "./mcp-client.js";
import { bridgeMcpTools } from "../tools/mcp-bridge.js";
import { symlinkUserSkillsToWorkspace } from "./skill-manager.js";
import { consumeAgentsMdUpdate, formatAgentsMdInjection } from "./agents-md-tracker.js";
import { wrapBashWithImageInjection } from "../utils/image-inject.js";
import { createSubagentTool } from "../tools/subagent.js";
import type { SubagentEvent } from "../tools/subagent.js";
import { addMessage, setLastMessageImages, setLastMessageToolCalls } from "../db/session-store.js";
import { recordTokenUsage, getBudgetStatus } from "../db/token-usage-store.js";
import type { BudgetStatus } from "../db/token-usage-store.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

// Clean system prompt for analyst use — no Pi documentation, no dynamic tool list.
// APPEND_SYSTEM.md (skills, MCP instructions, packages) and workspace AGENTS.md
// are still appended by the SDK's resource loader.
const BASE_SYSTEM_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files`;

// ── Browork event types sent to the frontend over WebSocket ──

export type BroworkEvent =
  | { type: "agent_start" }
  | { type: "message_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "message_end" }
  | { type: "tool_start"; tool: string; args: unknown }
  | { type: "tool_end"; tool: string; result: unknown; isError: boolean }
  | { type: "agent_end" }
  | { type: "skill_start"; skill: string; label: string }
  | { type: "skill_end"; skill: string }
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  | { type: "session_info"; sandboxActive: boolean; thinkingLevel: string }
  | { type: "thinking_level_changed"; level: string }
  | { type: "budget_status"; used: number; limit: number; remaining: number; percent: number | null; resetsAt: string; overBudget: boolean }
  | { type: "error"; message: string }
  | AskUserEvent
  | SubagentEvent;

// ── Browork commands received from the frontend over WebSocket ──

export interface ImageAttachment {
  data: string;     // base64-encoded
  mimeType: string;
}

export type BroworkCommand =
  | { type: "prompt"; message: string; images?: ImageAttachment[] }
  | { type: "skill_invoke"; skill: string; args?: string }
  | { type: "abort" }
  | { type: "steer"; message: string }
  | { type: "compact" }
  | { type: "set_thinking_level"; level: "none" | "low" | "medium" | "high" }
  | { type: "ask_user_response"; requestId: string; answers: AskUserAnswer[] };

// ── Session wrapper ──

export interface PiSessionHandle {
  id: string;
  sendPrompt(text: string, images?: ImageAttachment[]): Promise<void>;
  sendSteer(text: string): Promise<void>;
  abort(): Promise<void>;
  compact(): Promise<void>;
  setThinkingLevel(level: "none" | "low" | "medium" | "high"): void;
  getThinkingLevel(): "none" | "low" | "medium" | "high";
  /** Resolve a pending ask_user question with the user's answers */
  answerQuestion(requestId: string, answers: AskUserAnswer[]): boolean;
  dispose(): void;
  /** Re-wire events to a new WebSocket (e.g. after reconnect) */
  rebindSocket(ws: WebSocket): void;
  /** Turn-scoped buffers that survive WebSocket reconnects */
  turnState: {
    assistantBuffer: string;
    turnImagePaths: Set<string>;
    turnToolCalls: { tool: string; args: unknown; result?: unknown; isError?: boolean }[];
    pendingAskUser: { requestId: string; questions: AskUserQuestion[] } | null;
  };
}

// Active sessions keyed by session ID
const activeSessions = new Map<string, PiSessionHandle>();

// Metadata for active sessions (closures expose getters for internal state)
interface SessionMeta {
  userId: string | null;
  getIsRunning: () => boolean;
  getHasSocket: () => boolean;
  getSystemPrompt?: () => string;
}
const activeSessionMeta = new Map<string, SessionMeta>();

export interface ActiveSessionInfo {
  sessionId: string;
  userId: string | null;
  isRunning: boolean;
  hasSocket: boolean;
  toolCallsInProgress: number;
  bufferLength: number;
  preview: string | null;
}

export function listActiveSessions(): ActiveSessionInfo[] {
  const result: ActiveSessionInfo[] = [];
  for (const [sessionId, handle] of activeSessions) {
    const meta = activeSessionMeta.get(sessionId);
    const isRunning = meta?.getIsRunning() ?? false;

    // Build a live preview for running sessions
    let preview: string | null = null;
    if (isRunning) {
      if (handle.turnState.pendingAskUser) {
        const q = handle.turnState.pendingAskUser.questions[0]?.question;
        preview = q ? `Waiting: ${q.slice(0, 80)}` : "Waiting for your input...";
      } else if (handle.turnState.assistantBuffer) {
        // Last ~100 chars of the current assistant output
        const buf = handle.turnState.assistantBuffer.trim();
        preview = buf.length > 100 ? "..." + buf.slice(-100) : buf;
      } else {
        const inProgress = handle.turnState.turnToolCalls.filter((tc) => tc.result === undefined);
        if (inProgress.length > 0) {
          preview = `Running ${inProgress[inProgress.length - 1].tool}...`;
        } else {
          preview = "Working...";
        }
      }
    }

    const inProgressTools = handle.turnState.turnToolCalls.filter(
      (tc) => tc.result === undefined,
    ).length;
    result.push({
      sessionId,
      userId: meta?.userId ?? null,
      isRunning,
      hasSocket: meta?.getHasSocket() ?? false,
      toolCallsInProgress: inProgressTools,
      bufferLength: handle.turnState.assistantBuffer.length,
      preview,
    });
  }
  return result;
}

/**
 * Create a new Pi agent session and wire its events to a WebSocket.
 *
 * When SANDBOX_ENABLED=true, the user's Docker container is
 * provisioned before the Pi session starts so that Pi's bash
 * commands run inside the isolated container.
 */
export async function createPiSession(
  sessionId: string,
  workDir: string,
  ws: WebSocket,
  userId?: string,
): Promise<PiSessionHandle> {
  // Provision sandbox container when enabled
  let sandboxUserId: string | undefined;
  if (isSandboxEnabled() && userId) {
    try {
      const containerId = ensureSandbox(userId);
      sandboxUserId = userId;
      console.log(`Sandbox ready for user ${userId}: ${containerId.slice(0, 12)}`);
    } catch (err) {
      console.error(`Sandbox provisioning failed for user ${userId}:`, err);
      // Fall through — Pi will run on host if sandbox fails
    }
  }

  // Symlink user's installed skills into the workspace so Pi discovers them
  if (userId) {
    await symlinkUserSkillsToWorkspace(userId, workDir);
  }

  const thinkingLevel =
    (process.env.DEFAULT_THINKING_LEVEL as "none" | "low" | "medium" | "high") ||
    "medium";

  // Tell the client whether sandbox is actually active for this session
  // (sent after skill symlinks so the client can use this as a "session ready" signal)
  send(ws, { type: "session_info", sandboxActive: !!sandboxUserId, thinkingLevel });

  // Send initial budget status so the client can render the budget bar immediately
  if (userId) {
    try {
      const initBudget = getBudgetStatus(userId);
      send(ws, { type: "budget_status", ...initBudget });
    } catch { /* ignore */ }
  }

  // Dynamically import the Pi SDK — it may not be installed yet
  let piSdk: typeof import("@mariozechner/pi-coding-agent") | null = null;
  let piAi: typeof import("@mariozechner/pi-ai") | null = null;

  try {
    piSdk = await import("@mariozechner/pi-coding-agent");
    piAi = await import("@mariozechner/pi-ai");
  } catch {
    // Pi SDK not installed — use mock mode for development
    console.warn("Pi SDK not found, running in mock mode");
    return createMockSession(sessionId, workDir, ws, userId);
  }

  // Keep a mutable reference so rebindSocket can swap it
  let activeWs = ws;

  const webTools = createWebTools();
  const askUserTool = createAskUserTool(sessionId, (e) => {
    // Track pending ask_user so rebindSocket can replay it
    turnState.pendingAskUser = { requestId: e.requestId, questions: e.questions };
    send(activeWs, e);
  });
  const mcpTools = bridgeMcpTools(mcpClientManager.getToolsForSession(sessionId));
  const subagentTool = createSubagentTool({
    workDir,
    sandboxUserId,
    sendEvent: (e) => send(activeWs, e),
    userId,
    sessionId,
  });
  const customTools = [...webTools, askUserTool, subagentTool, ...mcpTools];
  if (customTools.length > 0) {
    console.log(`[pi-session] registering custom tools: ${customTools.map((t) => t.name).join(", ")}`);
  }

  const sessionManager = piSdk.SessionManager.continueRecent(workDir);

  // Build a custom resource loader that:
  // 1. Replaces Pi's default system prompt (no Pi docs, no dynamic tool list)
  //    with a clean analyst-focused prompt
  // 2. Filters context files to only include AGENTS.md from inside the workspace
  //    (drops browork's own CLAUDE.md and any ancestor context files)
  const resourceLoader = new (piSdk as any).DefaultResourceLoader({
    cwd: workDir,
    systemPromptOverride: () => BASE_SYSTEM_PROMPT,
    agentsFilesOverride: ({ agentsFiles }: { agentsFiles: { path: string; content: string }[] }) => ({
      agentsFiles: agentsFiles.filter((f: { path: string }) => f.path.startsWith(workDir)),
    }),
  });
  await resourceLoader.reload();

  const { session } = await piSdk.createAgentSession({
    cwd: workDir,
    model: piAi.getModel(
      process.env.PI_PROVIDER || "azure-openai-responses",
      process.env.PI_MODEL || "gpt-4",
    ),
    thinkingLevel: thinkingLevel === "none" ? "off" : thinkingLevel,
    customTools,
    sessionManager,
    resourceLoader,
  } as any);

  // When sandbox is active, redirect bash execution into the Docker container.
  // cwd stays as the host path so read/edit/write tools operate on the host
  // filesystem (shared via bind mount).
  //
  // We patch the session's internal tool registry after creation because
  // createAgentSession doesn't expose baseToolsOverride. The _baseToolRegistry
  // and _buildRuntime are conventional-private (not #private), so this is safe
  // at runtime.
  if (sandboxUserId) {
    const s = session as any;
    const workspacesRoot = resolve(DATA_ROOT, "workspaces");
    const containerWorkDir = workDir.replace(workspacesRoot, "/workspaces");
    const fileOps = createSandboxFileOps();

    // Switch Pi's cwd to the container path so the system prompt and tool
    // descriptions show /workspaces/... instead of host paths.
    s._cwd = containerWorkDir;
    s._baseToolsOverride = {
      read: piSdk.createReadTool(containerWorkDir, { operations: fileOps.read }),
      bash: wrapBashWithImageInjection(
        piSdk.createBashTool(containerWorkDir, {
          operations: createSandboxBashOps(sandboxUserId),
        }),
        workDir, // host path for scanning images on the bind-mounted fs
      ),
      edit: piSdk.createEditTool(containerWorkDir, { operations: fileOps.edit }),
      write: piSdk.createWriteTool(containerWorkDir, { operations: fileOps.write }),
    };
    const activeToolNames = ["read", "bash", "edit", "write", ...customTools.map((t) => t.name)];
    s._buildRuntime({ activeToolNames, includeAllExtensionTools: true });
    console.log(`[pi-session] sandbox patched for user ${sandboxUserId}, cwd=${containerWorkDir}`);
  } else {
    // Non-sandbox: wrap bash tool with image injection so the LLM sees
    // images it creates (e.g. matplotlib plots). We must override all
    // base tools since _baseToolsOverride replaces the entire set.
    const s = session as any;
    s._baseToolsOverride = {
      read: piSdk.createReadTool(workDir),
      bash: wrapBashWithImageInjection(piSdk.createBashTool(workDir), workDir),
      edit: piSdk.createEditTool(workDir),
      write: piSdk.createWriteTool(workDir),
    };
    const activeToolNames = ["read", "bash", "edit", "write", ...customTools.map((t) => t.name)];
    s._buildRuntime({ activeToolNames, includeAllExtensionTools: true });
    console.log("[pi-session] bash wrapped with image injection (non-sandbox)");
  }

  // Translate Pi events → Browork events → WebSocket
  let isRunning = false;
  const isSandboxActive = !!sandboxUserId;

  // Turn-scoped buffers live here (not in the WebSocket handler closure)
  // so they survive socket reconnects when the user switches sessions.
  const turnState: PiSessionHandle["turnState"] = {
    assistantBuffer: "",
    turnImagePaths: new Set(),
    turnToolCalls: [],
    pendingAskUser: null,
  };

  const MAX_RESULT_LENGTH = 4000;
  function truncateStr(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "… (truncated)" : s;
  }
  function truncateToolResult(result: unknown): unknown {
    if (typeof result === "string") {
      return truncateStr(result, MAX_RESULT_LENGTH);
    }
    if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;
      // Preserve structure for Pi SDK ToolResult objects (content + details).
      // Truncate large values within the object instead of flattening to string.
      if (obj.details && typeof obj.details === "object") {
        const details = { ...(obj.details as Record<string, unknown>) };
        // Truncate nested tool call results individually (e.g. subagent)
        if (Array.isArray(details.toolCalls)) {
          details.toolCalls = (details.toolCalls as Array<Record<string, unknown>>).map((tc) => ({
            ...tc,
            result: tc.result !== undefined ? truncateToolResult(tc.result) : undefined,
          }));
        }
        const content = Array.isArray(obj.content)
          ? (obj.content as Array<Record<string, unknown>>).map((c) =>
              typeof c.text === "string" ? { ...c, text: truncateStr(c.text, MAX_RESULT_LENGTH) } : c,
            )
          : obj.content;
        return { ...obj, content, details };
      }
      const json = JSON.stringify(result);
      if (json.length > MAX_RESULT_LENGTH) {
        return json.slice(0, MAX_RESULT_LENGTH) + "… (truncated)";
      }
    }
    return result;
  }

  const unsubscribe = session.subscribe((event) => {
    // Surface LLM errors that would otherwise be silently dropped.
    // When the API returns an error (auth failure, bad model, rate limit, etc.),
    // the Pi SDK creates an assistant message with stopReason="error" but no
    // text_delta events, so the user sees nothing. Inject the error text so it
    // appears as an assistant message in the chat.
    if (event.type === "message_end" && event.message?.stopReason === "error" && event.message?.errorMessage) {
      const errorText = `Error from AI model: ${event.message.errorMessage}`;
      console.error(`[pi-session] LLM error: ${event.message.errorMessage}`);
      // Inject as assistant text so it shows in the chat bubble
      turnState.assistantBuffer += errorText;
      // Send delta to client so it appears in real-time
      if (activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify({ type: "message_delta", text: errorText }));
      }
    }

    // Capture token usage from message_end events
    if (event.type === "message_end" && event.message?.usage && userId) {
      const u = event.message.usage;
      try {
        recordTokenUsage(userId, sessionId, {
          input: u.input ?? 0,
          output: u.output ?? 0,
          cacheRead: u.cacheRead ?? 0,
          cacheWrite: u.cacheWrite ?? 0,
          totalTokens: u.totalTokens ?? 0,
          costTotal: u.cost?.total ?? 0,
        });
      } catch (err) {
        console.error("[pi-session] Failed to record token usage:", err);
      }
    }

    // Surface auto-retry events so the client knows retries are happening
    if (event.type === "auto_retry_start") {
      const retryText = `\n\nRetrying (attempt ${event.attempt})... ${event.errorMessage || ""}`;
      console.warn(`[pi-session] auto-retry #${event.attempt}: ${event.errorMessage}`);
      turnState.assistantBuffer += retryText;
      if (activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify({ type: "message_delta", text: retryText }));
      }
    }
    if (event.type === "auto_retry_end" && !event.success) {
      const failText = `\n\nRetry failed after ${event.attempt} attempts.${event.finalError ? ` ${event.finalError}` : ""}`;
      console.error(`[pi-session] auto-retry failed: ${event.finalError}`);
      turnState.assistantBuffer += failText;
      if (activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify({ type: "message_delta", text: failText }));
      }
    }

    const broworkEvent = translatePiEvent(event);
    if (!broworkEvent) return;

    console.log(`[pi-event] ${broworkEvent.type} ${(broworkEvent as any).tool ?? ""}`);

    // Always accumulate into turnState regardless of socket state,
    // so tool calls and messages are captured even during disconnection.
    switch (broworkEvent.type) {
      case "agent_start":
        isRunning = true;
        break;
      case "message_delta":
        turnState.assistantBuffer += broworkEvent.text;
        break;
      case "tool_start":
        turnState.turnToolCalls.push({ tool: broworkEvent.tool, args: broworkEvent.args });
        break;
      case "tool_end":
        for (let i = turnState.turnToolCalls.length - 1; i >= 0; i--) {
          if (turnState.turnToolCalls[i].tool === broworkEvent.tool && turnState.turnToolCalls[i].result === undefined) {
            turnState.turnToolCalls[i].result = truncateToolResult(broworkEvent.result);
            turnState.turnToolCalls[i].isError = broworkEvent.isError || false;
            break;
          }
        }
        break;
      case "message_end":
        if (turnState.assistantBuffer) {
          addMessage(sessionId, "assistant", turnState.assistantBuffer, Date.now());
          turnState.assistantBuffer = "";
        }
        break;
      case "agent_end": {
        // Filter out images that no longer exist (e.g. intermediate files
        // from Quarto renders that get cleaned up after the render finishes)
        for (const p of turnState.turnImagePaths) {
          if (!existsSync(join(workDir, p))) {
            turnState.turnImagePaths.delete(p);
          }
        }
        const images = turnState.turnImagePaths.size > 0 ? JSON.stringify([...turnState.turnImagePaths]) : null;
        const toolCallsJson = turnState.turnToolCalls.length > 0 ? JSON.stringify(turnState.turnToolCalls) : null;
        if (turnState.assistantBuffer) {
          addMessage(sessionId, "assistant", turnState.assistantBuffer, Date.now(), images, toolCallsJson);
          turnState.assistantBuffer = "";
        } else if (images || toolCallsJson) {
          // No assistant text this turn — try attaching to the last assistant message
          // (preserves correct timeline ordering: tool calls at seq-0.5 before the text).
          // Fall back to creating a new empty message if no assistant message exists
          // (e.g. when the LLM produces only tool-use responses with no text all turn).
          let attached = true;
          if (images) attached = setLastMessageImages(sessionId, images) && attached;
          if (toolCallsJson) attached = setLastMessageToolCalls(sessionId, toolCallsJson) && attached;
          if (!attached) {
            addMessage(sessionId, "assistant", "", Date.now(), images, toolCallsJson);
          }
        }
        turnState.turnImagePaths = new Set();
        turnState.turnToolCalls = [];
        turnState.pendingAskUser = null;
        isRunning = false;
        break;
      }
    }

    // Forward to client if connected
    if (activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify(broworkEvent));

      if (broworkEvent.type === "agent_end") {
        sendContextUsage();
        sendBudgetStatus();
      }
    }
  });

  const sendContextUsage = () => {
    try {
      const usage = (session as any).getContextUsage?.();
      if (usage && activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify({
          type: "context_usage",
          tokens: usage.tokens ?? null,
          contextWindow: usage.contextWindow,
          percent: usage.percent ?? null,
        } satisfies BroworkEvent));
      }
    } catch {
      // getContextUsage may not be available in all SDK versions
    }
  };

  const sendBudgetStatus = () => {
    if (!userId) return;
    try {
      const status = getBudgetStatus(userId);
      if (activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify({ type: "budget_status", ...status } satisfies BroworkEvent));
      }
    } catch {
      // Budget query may fail if DB not ready
    }
  };

  const handle: PiSessionHandle = {
    id: sessionId,
    turnState,
    async sendPrompt(text: string, images?: ImageAttachment[]) {
      const update = consumeAgentsMdUpdate(workDir);
      const final = update ? formatAgentsMdInjection(update, text) : text;
      const piImages = images?.length
        ? images.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }))
        : undefined;
      await (session as any).prompt(final, piImages ? { images: piImages } : undefined);
    },
    async sendSteer(text: string) {
      await session.steer(text);
    },
    async abort() {
      await session.abort();
    },
    async compact() {
      await (session as any).compact?.();
      sendContextUsage();
    },
    setThinkingLevel(level: "none" | "low" | "medium" | "high") {
      // Pi SDK uses "off" internally; frontend uses "none"
      const sdkLevel = level === "none" ? "off" : level;
      (session as any).setThinkingLevel(sdkLevel);
      // Report back in frontend terms
      const reportLevel = (session as any).thinkingLevel === "off" ? "none" : (session as any).thinkingLevel;
      if (activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify({ type: "thinking_level_changed", level: reportLevel }));
      }
    },
    getThinkingLevel(): "none" | "low" | "medium" | "high" {
      const raw = (session as any).thinkingLevel ?? "medium";
      return raw === "off" ? "none" : raw;
    },
    answerQuestion(requestId: string, answers: AskUserAnswer[]): boolean {
      turnState.pendingAskUser = null;
      return resolveQuestion(requestId, answers);
    },
    dispose() {
      rejectAllPending(sessionId);
      unsubscribe();
      session.dispose();
      activeSessions.delete(sessionId);
      activeSessionMeta.delete(sessionId);
    },
    rebindSocket(newWs: WebSocket) {
      activeWs = newWs;
      const rawLevel = (session as any).thinkingLevel ?? "medium";
      send(activeWs, { type: "session_info", sandboxActive: isSandboxActive, thinkingLevel: rawLevel === "off" ? "none" : rawLevel });
      sendContextUsage();
      sendBudgetStatus();
      if (isRunning) {
        send(activeWs, { type: "agent_start" });

        // Replay accumulated tool calls so the client catches up on
        // everything that happened while it was disconnected.
        for (const tc of turnState.turnToolCalls) {
          send(activeWs, { type: "tool_start", tool: tc.tool, args: tc.args });
          if (tc.result !== undefined) {
            send(activeWs, { type: "tool_end", tool: tc.tool, result: tc.result, isError: tc.isError || false });
          }
        }

        // Replay any assistant text accumulated so far in this turn
        if (turnState.assistantBuffer) {
          send(activeWs, { type: "message_delta", text: turnState.assistantBuffer });
        }

        // Replay pending ask_user question so the card reappears
        if (turnState.pendingAskUser) {
          send(activeWs, {
            type: "ask_user",
            requestId: turnState.pendingAskUser.requestId,
            questions: turnState.pendingAskUser.questions,
          });
        }
      }
    },
  };

  activeSessions.set(sessionId, handle);
  activeSessionMeta.set(sessionId, {
    userId: userId ?? null,
    getIsRunning: () => isRunning,
    getHasSocket: () => activeWs.readyState === activeWs.OPEN,
    getSystemPrompt: () => session.systemPrompt,
  });

  // Send initial context usage (system prompt, tools, etc. already consume tokens)
  sendContextUsage();

  return handle;
}

export function getSession(sessionId: string): PiSessionHandle | undefined {
  return activeSessions.get(sessionId);
}

/** Get the assembled system prompt from any active (real) Pi session */
export function getActiveSystemPrompt(): string | null {
  for (const meta of activeSessionMeta.values()) {
    if (meta.getSystemPrompt) {
      try { return meta.getSystemPrompt(); } catch { /* skip */ }
    }
  }
  return null;
}

// ── Mock session for development without Pi SDK ──

function createMockSession(
  sessionId: string,
  workDir: string,
  ws: WebSocket,
  userId?: string,
): PiSessionHandle {
  let activeWs = ws;
  let mockTurnCount = 0;
  const mockContextWindow = 128000;

  const sendMockContextUsage = () => {
    // Base ~8% for system prompt, tools, skills, AGENTS.md
    const baseTokens = Math.round(mockContextWindow * 0.08);
    const turnTokens = Math.round(mockContextWindow * 0.12 * mockTurnCount);
    const tokens = Math.min(baseTokens + turnTokens, mockContextWindow);
    const percent = Math.round((tokens / mockContextWindow) * 100);
    send(activeWs, { type: "context_usage", tokens, contextWindow: mockContextWindow, percent });
  };

  const handle: PiSessionHandle = {
    id: sessionId,
    turnState: {
      assistantBuffer: "",
      turnImagePaths: new Set(),
      turnToolCalls: [],
      pendingAskUser: null,
    },
    async sendPrompt(text: string, _images?: ImageAttachment[]) {
      const update = consumeAgentsMdUpdate(workDir);
      const finalText = update ? formatAgentsMdInjection(update, text) : text;
      // Simulate Pi agent response with streaming
      send(activeWs, { type: "agent_start" });

      // Detect skill invocations via Pi's native /skill:name command format
      const skillMatch = text.match(/^\/skill:(\S+)/);
      const isSkill = !!skillMatch;
      const skillName = skillMatch?.[1] ?? "";

      // Simulate tool calls so the status bar and tool cards are testable
      const mockTools: { tool: string; args: unknown; result: unknown; ms: number }[] = [
        { tool: "web_search", args: { query: "financial analysis best practices 2025" }, result: { content: [{ type: "text", text: "1. Financial Analysis Guide\n   https://example.com/finance-guide\n   Comprehensive guide to financial analysis techniques and best practices.\n\n2. Modern Portfolio Theory\n   https://example.com/mpt\n   An overview of modern portfolio theory and risk management.\n\n3. Data-Driven Finance\n   https://example.com/data-finance\n   How data analytics is transforming financial decision making." }], details: { resultCount: 3 } }, ms: 600 },
        { tool: "web_fetch", args: { url: "https://example.com/finance-guide" }, result: { content: [{ type: "text", text: "# Financial Analysis Guide\n\nThis guide covers the fundamentals of financial analysis...\n\n## Key Metrics\n- Revenue Growth\n- Profit Margins\n- Return on Equity" }], details: { url: "https://example.com/finance-guide", truncated: false, length: 180 } }, ms: 800 },
        { tool: "read", args: { path: "data.csv" }, result: { content: [{ type: "text", text: "col1,col2\n1,2\n3,4" }] }, ms: 400 },
        { tool: "bash", args: { command: "echo analysis complete" }, result: { details: { output: "analysis complete\n", exitCode: 0 } }, ms: 800 },
        { tool: "write", args: { file_path: "output/results.md" }, result: { details: { created: true, size: 256 } }, ms: 300 },
      ];

      for (const mt of mockTools) {
        send(activeWs, { type: "tool_start", tool: mt.tool, args: mt.args });
        await sleep(mt.ms);
        send(activeWs, { type: "tool_end", tool: mt.tool, result: mt.result, isError: false });
        await sleep(100);
      }

      // Demo ask_user tool — send a question and wait for the user's response
      const askArgs = {
        questions: [
          {
            question: "Which analysis approach would you prefer?",
            options: [
              { label: "Quantitative", description: "Statistical models and numerical analysis" },
              { label: "Qualitative", description: "Narrative assessment and expert judgment" },
              { label: "Mixed Methods", description: "Combine both quantitative and qualitative approaches" },
            ],
            allowOther: true,
          },
        ],
      };
      send(activeWs, { type: "tool_start", tool: "ask_user", args: askArgs });
      const mockRequestId = `${sessionId}:ask:mock-${++mockTurnCount}`;
      send(activeWs, { type: "ask_user", requestId: mockRequestId, questions: askArgs.questions });
      // Wait for the user to respond (or abort)
      try {
        const answers = await new Promise<AskUserAnswer[]>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("User did not respond within 5 minutes"));
          }, 5 * 60 * 1000);
          registerPending(mockRequestId, resolve, reject, timeoutId);
        });
        const formatted = answers.map((a) => `Q: ${a.question}\nA: ${a.selected.join(", ")}`).join("\n\n");
        send(activeWs, {
          type: "tool_end",
          tool: "ask_user",
          result: { content: [{ type: "text", text: formatted }], details: { requestId: mockRequestId, answerCount: answers.length } },
          isError: false,
        });
      } catch {
        send(activeWs, {
          type: "tool_end",
          tool: "ask_user",
          result: { content: [{ type: "text", text: "User did not respond" }], details: {} },
          isError: true,
        });
        send(activeWs, { type: "agent_end" });
        return;
      }

      const response = isSkill
        ? `I'm executing the **${skillName}** workflow.\n\nIn mock mode, I can't actually process files, but here's what I would do:\n\n1. Read the input files from your working directory\n2. Follow the skill instructions step by step\n3. Save the results to the output/ directory\n\nInstall the Pi SDK to run real workflows!`
        : `I received your message: "${text}"\n\nI'm running in **mock mode** because the Pi SDK is not installed. Once you install \`@mariozechner/pi-coding-agent\`, I'll use the real agent.\n\nFor now, this confirms the end-to-end WebSocket pipeline is working!`;

      // Stream character by character with small delays
      for (let i = 0; i < response.length; i += 3) {
        const chunk = response.slice(i, i + 3);
        send(activeWs, { type: "message_delta", text: chunk });
        await sleep(15);
      }

      send(activeWs, { type: "message_end" });
      send(activeWs, { type: "agent_end" });

      mockTurnCount++;
      sendMockContextUsage();

      // Record mock token usage (simulates ~2k tokens per turn)
      if (userId) {
        try {
          recordTokenUsage(userId, sessionId, {
            input: 1500, output: 500, cacheRead: 0, cacheWrite: 0, totalTokens: 2000, costTotal: 0.01,
          });
          const status = getBudgetStatus(userId);
          send(activeWs, { type: "budget_status", ...status });
        } catch { /* ignore */ }
      }
    },
    async sendSteer(text: string) {
      send(activeWs, { type: "message_delta", text: `\n\n[Steering: ${text}]` });
    },
    async abort() {
      send(activeWs, { type: "agent_end" });
    },
    async compact() {
      mockTurnCount = Math.max(0, Math.floor(mockTurnCount / 3));
      sendMockContextUsage();
    },
    setThinkingLevel(_level: "none" | "low" | "medium" | "high") {
      // Mock mode — no-op
    },
    getThinkingLevel(): "none" | "low" | "medium" | "high" {
      return "medium";
    },
    answerQuestion(requestId: string, answers: AskUserAnswer[]): boolean {
      return resolveQuestion(requestId, answers);
    },
    dispose() {
      rejectAllPending(sessionId);
      activeSessions.delete(sessionId);
      activeSessionMeta.delete(sessionId);
    },
    rebindSocket(newWs: WebSocket) {
      activeWs = newWs;
      sendMockContextUsage();
    },
  };

  activeSessions.set(sessionId, handle);
  activeSessionMeta.set(sessionId, {
    userId: null,
    getIsRunning: () => false,
    getHasSocket: () => activeWs.readyState === activeWs.OPEN,
  });

  // Send initial context usage after a tick so the WebSocket is fully ready
  setTimeout(sendMockContextUsage, 50);

  return handle;
}

function send(ws: WebSocket, event: BroworkEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

