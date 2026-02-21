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
}

// Active sessions keyed by session ID
const activeSessions = new Map<string, PiSessionHandle>();

/**
 * Create a new Pi agent session and wire its events to a WebSocket.
 */
export async function createPiSession(
  sessionId: string,
  workDir: string,
  ws: WebSocket,
): Promise<PiSessionHandle> {
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
  const unsubscribe = session.subscribe((event) => {
    const broworkEvent = translatePiEvent(event);
    if (broworkEvent && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(broworkEvent));
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
  const handle: PiSessionHandle = {
    id: sessionId,
    async sendPrompt(text: string) {
      // Simulate Pi agent response with streaming
      send(ws, { type: "agent_start" });

      // Detect skill invocations and generate a more relevant mock response
      const skillMatch = text.match(/<skill name="([^"]+)">/);
      const isSkill = !!skillMatch;
      const skillName = skillMatch?.[1] ?? "";

      const response = isSkill
        ? `I'm executing the **${skillName}** workflow.\n\nIn mock mode, I can't actually process files, but here's what I would do:\n\n1. Read the input files from your working directory\n2. Follow the skill instructions step by step\n3. Save the results to the output/ directory\n\nInstall the Pi SDK to run real workflows!`
        : `I received your message: "${text}"\n\nI'm running in **mock mode** because the Pi SDK is not installed. Once you install \`@mariozechner/pi-coding-agent\`, I'll use the real agent.\n\nFor now, this confirms the end-to-end WebSocket pipeline is working!`;

      // Stream character by character with small delays
      for (let i = 0; i < response.length; i += 3) {
        const chunk = response.slice(i, i + 3);
        send(ws, { type: "message_delta", text: chunk });
        await sleep(15);
      }

      send(ws, { type: "message_end" });
      send(ws, { type: "agent_end" });
    },
    async sendSteer(text: string) {
      send(ws, { type: "message_delta", text: `\n\n[Steering: ${text}]` });
    },
    async abort() {
      send(ws, { type: "agent_end" });
    },
    dispose() {
      activeSessions.delete(sessionId);
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
