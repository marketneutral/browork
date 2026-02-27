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
import { resolve } from "path";
import { isSandboxEnabled, ensureSandbox, createSandboxBashOps, createSandboxFileOps } from "./sandbox-manager.js";
import { createWebTools } from "../tools/web-tools.js";
import { mcpClientManager } from "./mcp-client.js";
import { bridgeMcpTools } from "../tools/mcp-bridge.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

// ── Browork event types sent to the frontend over WebSocket ──

export type BroworkEvent =
  | { type: "agent_start" }
  | { type: "message_delta"; text: string }
  | { type: "message_end" }
  | { type: "tool_start"; tool: string; args: unknown }
  | { type: "tool_end"; tool: string; result: unknown; isError: boolean }
  | { type: "agent_end" }
  | { type: "skill_start"; skill: string; label: string }
  | { type: "skill_end"; skill: string }
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  | { type: "error"; message: string };

// ── Browork commands received from the frontend over WebSocket ──

export type BroworkCommand =
  | { type: "prompt"; message: string }
  | { type: "skill_invoke"; skill: string; args?: string }
  | { type: "abort" }
  | { type: "steer"; message: string }
  | { type: "compact" };

// ── Session wrapper ──

export interface PiSessionHandle {
  id: string;
  sendPrompt(text: string): Promise<void>;
  sendSteer(text: string): Promise<void>;
  abort(): Promise<void>;
  compact(): Promise<void>;
  dispose(): void;
  /** Re-wire events to a new WebSocket (e.g. after reconnect) */
  rebindSocket(ws: WebSocket): void;
}

// Active sessions keyed by session ID
const activeSessions = new Map<string, PiSessionHandle>();

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

  // Dynamically import the Pi SDK — it may not be installed yet
  let piSdk: typeof import("@mariozechner/pi-coding-agent") | null = null;
  let piAi: typeof import("@mariozechner/pi-ai") | null = null;

  try {
    piSdk = await import("@mariozechner/pi-coding-agent");
    piAi = await import("@mariozechner/pi-ai");
  } catch {
    // Pi SDK not installed — use mock mode for development
    console.warn("Pi SDK not found, running in mock mode");
    return createMockSession(sessionId, ws);
  }

  const thinkingLevel =
    (process.env.DEFAULT_THINKING_LEVEL as "low" | "medium" | "high") ||
    "medium";

  const webTools = createWebTools();
  const mcpTools = bridgeMcpTools(mcpClientManager.getToolsForSession(sessionId));
  const customTools = [...webTools, ...mcpTools];
  if (customTools.length > 0) {
    console.log(`[pi-session] registering custom tools: ${customTools.map((t) => t.name).join(", ")}`);
  }

  const sessionManager = piSdk.SessionManager.continueRecent(workDir);

  const { session } = await piSdk.createAgentSession({
    cwd: workDir,
    model: piAi.getModel(
      process.env.PI_PROVIDER || "azure-openai-responses",
      process.env.PI_MODEL || "gpt-4",
    ),
    thinkingLevel,
    customTools,
    sessionManager,
  });

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
      bash: piSdk.createBashTool(containerWorkDir, {
        operations: createSandboxBashOps(sandboxUserId),
      }),
      edit: piSdk.createEditTool(containerWorkDir, { operations: fileOps.edit }),
      write: piSdk.createWriteTool(containerWorkDir, { operations: fileOps.write }),
    };
    const activeToolNames = ["read", "bash", "edit", "write", ...customTools.map((t) => t.name)];
    s._buildRuntime({ activeToolNames, includeAllExtensionTools: true });
    console.log(`[pi-session] sandbox patched for user ${sandboxUserId}, cwd=${containerWorkDir}`);
  }

  // Translate Pi events → Browork events → WebSocket
  // Keep a mutable reference so rebindSocket can swap it
  let activeWs = ws;

  const unsubscribe = session.subscribe((event) => {
    const broworkEvent = translatePiEvent(event);
    if (broworkEvent) {
      console.log(`[pi-event] ${broworkEvent.type} ${(broworkEvent as any).tool ?? ""}`);
      if (activeWs.readyState === activeWs.OPEN) {
        activeWs.send(JSON.stringify(broworkEvent));

        // After agent_end, send context usage info
        if (broworkEvent.type === "agent_end") {
          sendContextUsage();
        }
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

  const handle: PiSessionHandle = {
    id: sessionId,
    async sendPrompt(text: string) {
      await session.prompt(text);
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
    dispose() {
      unsubscribe();
      session.dispose();
      activeSessions.delete(sessionId);
    },
    rebindSocket(newWs: WebSocket) {
      activeWs = newWs;
      sendContextUsage();
    },
  };

  activeSessions.set(sessionId, handle);

  // Send initial context usage (system prompt, tools, etc. already consume tokens)
  sendContextUsage();

  return handle;
}

export function getSession(sessionId: string): PiSessionHandle | undefined {
  return activeSessions.get(sessionId);
}

// ── Mock session for development without Pi SDK ──

function createMockSession(
  sessionId: string,
  ws: WebSocket,
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
    async sendPrompt(text: string) {
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
    dispose() {
      activeSessions.delete(sessionId);
    },
    rebindSocket(newWs: WebSocket) {
      activeWs = newWs;
      sendMockContextUsage();
    },
  };

  activeSessions.set(sessionId, handle);

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

