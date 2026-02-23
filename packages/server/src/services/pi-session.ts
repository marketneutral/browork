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
import { writeMcpConfig } from "./mcp-manager.js";
import { isSandboxEnabled, ensureSandbox } from "./sandbox-manager.js";

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
  | { type: "error"; message: string };

// ── Browork commands received from the frontend over WebSocket ──

export type BroworkCommand =
  | { type: "prompt"; message: string }
  | { type: "skill_invoke"; skill: string; args?: string }
  | { type: "abort" }
  | { type: "steer"; message: string };

// ── Session wrapper ──

export interface PiSessionHandle {
  id: string;
  sendPrompt(text: string): Promise<void>;
  sendSteer(text: string): Promise<void>;
  abort(): Promise<void>;
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
  if (isSandboxEnabled() && userId) {
    try {
      const containerId = ensureSandbox(userId, workDir);
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

  // Write MCP server config to the workspace before creating the session
  writeMcpConfig(workDir);

  const { session } = await piSdk.createAgentSession({
    cwd: workDir,
    model: piAi.getModel(
      process.env.PI_PROVIDER || "azure-openai-responses",
      process.env.PI_MODEL || "gpt-4",
    ),
    thinkingLevel,
    extensions: ["pi-mcp-adapter"],
  });

  // Translate Pi events → Browork events → WebSocket
  // Keep a mutable reference so rebindSocket can swap it
  let activeWs = ws;

  const unsubscribe = session.subscribe((event) => {
    const broworkEvent = translatePiEvent(event);
    if (broworkEvent && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify(broworkEvent));
    }
  });

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
    dispose() {
      unsubscribe();
      session.dispose();
      activeSessions.delete(sessionId);
    },
    rebindSocket(newWs: WebSocket) {
      activeWs = newWs;
    },
  };

  activeSessions.set(sessionId, handle);
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

  const handle: PiSessionHandle = {
    id: sessionId,
    async sendPrompt(text: string) {
      // Simulate Pi agent response with streaming
      send(activeWs, { type: "agent_start" });

      // Detect skill invocations via Pi's native /skill:name command format
      const skillMatch = text.match(/^\/skill:(\S+)/);
      const isSkill = !!skillMatch;
      const skillName = skillMatch?.[1] ?? "";

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
    },
    async sendSteer(text: string) {
      send(activeWs, { type: "message_delta", text: `\n\n[Steering: ${text}]` });
    },
    async abort() {
      send(activeWs, { type: "agent_end" });
    },
    dispose() {
      activeSessions.delete(sessionId);
    },
    rebindSocket(newWs: WebSocket) {
      activeWs = newWs;
    },
  };

  activeSessions.set(sessionId, handle);
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
