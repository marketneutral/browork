/**
 * subagent — Delegate tasks to a child Pi agent with fresh context.
 *
 * Spawns an in-process child AgentSession using the Pi SDK.
 * The child shares the same workspace and sandbox but gets an
 * independent context window and a controlled set of tools.
 *
 * Events from the child are forwarded to the client via custom
 * WebSocket events (subagent_*) so the UI can render a nested timeline.
 */

import { Type } from "@sinclair/typebox";
import { resolve } from "path";
import { translatePiEvent } from "../utils/event-translator.js";
import { createSandboxBashOps, createSandboxFileOps } from "../services/sandbox-manager.js";
import { mcpClientManager } from "../services/mcp-client.js";
import { bridgeMcpTools } from "./mcp-bridge.js";

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

// ── Subagent WebSocket events ──

export type SubagentEvent =
  | { type: "subagent_start"; subagentId: string; name: string; task: string; activeTools: string[] }
  | { type: "subagent_tool_start"; subagentId: string; tool: string; args: unknown }
  | { type: "subagent_tool_end"; subagentId: string; tool: string; result: unknown; isError: boolean }
  | { type: "subagent_message_delta"; subagentId: string; text: string }
  | { type: "subagent_end"; subagentId: string; result: string; isError: boolean };

// ── Options ──

interface SubagentToolOptions {
  workDir: string;
  sandboxUserId: string | undefined;
  sendEvent: (event: SubagentEvent) => void;
}

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

const MAX_RESULT_LENGTH = 8000;

const SUBAGENT_BASE_PROMPT = `You are a focused sub-agent working on a specific task. You have been delegated this task by a parent agent. Complete the task efficiently and report your findings or results clearly. Be concise.`;

// ── Tool factory ──

export function createSubagentTool(options: SubagentToolOptions): ToolDefinitionLike {
  const { workDir, sandboxUserId, sendEvent } = options;

  return {
    name: "subagent",
    label: "Subagent",
    description: `Delegate a task to a sub-agent with its own fresh context window. The sub-agent runs independently and returns its result. Use this for:
- Tasks that need deep exploration without filling your context
- Focused research or analysis tasks
- File-heavy operations where you want to preserve your own context

IMPORTANT: The sub-agent's returned result is authoritative — it has already completed the task. Do NOT re-execute the same task yourself after the sub-agent returns. Use the sub-agent's result directly in your response.

By default the sub-agent has read, write, edit, and bash tools, no skills, and no MCP tools. Specify additional tools, skills, or MCP servers if needed.`,
    parameters: Type.Object({
      name: Type.String({
        description: "A short descriptive name for this sub-agent (e.g. 'Code Explorer', 'Data Analyst')",
      }),
      task: Type.String({
        description: "The task to delegate. Be specific about what you want the sub-agent to do and what output you expect.",
      }),
      systemPrompt: Type.Optional(
        Type.String({
          description: "Custom system prompt for the sub-agent. If omitted, a default focused assistant prompt is used.",
        }),
      ),
      tools: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Additional tools to enable beyond the defaults (read, write, edit, bash). Options: 'web_search', 'web_fetch'. By default the sub-agent can read, write, edit files and run bash commands.",
        }),
      ),
      skills: Type.Optional(
        Type.Boolean({
          description:
            "Whether the sub-agent should have access to workspace skills. Default: false (no skills). Set to true to enable skill discovery.",
        }),
      ),
      mcp_servers: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "MCP server names to enable for the sub-agent. By default no MCP tools are available. Specify server names (e.g. ['my-server']) to grant access.",
        }),
      ),
    }),

    async execute(toolCallId, params, signal) {
      const { name, task, systemPrompt, tools: extraTools, skills: enableSkills, mcp_servers: mcpServerNames } = params as {
        name: string;
        task: string;
        systemPrompt?: string;
        tools?: string[];
        skills?: boolean;
        mcp_servers?: string[];
      };

      // Dynamically import Pi SDK
      let piSdk: typeof import("@mariozechner/pi-coding-agent") | null = null;
      let piAi: typeof import("@mariozechner/pi-ai") | null = null;
      try {
        piSdk = await import("@mariozechner/pi-coding-agent");
        piAi = await import("@mariozechner/pi-ai");
      } catch {
        sendEvent({ type: "subagent_end", subagentId: toolCallId, result: "Pi SDK not available", isError: true });
        return {
          content: [{ type: "text", text: "Error: Pi SDK not available for sub-agent" }],
          details: { name, task, error: "Pi SDK not available" },
        };
      }

      const thinkingLevel =
        (process.env.DEFAULT_THINKING_LEVEL as "low" | "medium" | "high") || "medium";

      // Build controlled custom tools list
      const customTools: ToolDefinitionLike[] = [];
      const extraToolSet = new Set(extraTools || []);

      if (extraToolSet.has("web_search") || extraToolSet.has("web_fetch")) {
        try {
          const { createWebTools } = await import("./web-tools.js");
          const webTools = createWebTools();
          for (const t of webTools) {
            if (extraToolSet.has(t.name)) customTools.push(t);
          }
        } catch { /* web tools not available */ }
      }

      // Wire MCP tools if specific servers are requested
      const mcpToolNames: string[] = [];
      if (mcpServerNames && mcpServerNames.length > 0) {
        const allMcpTools = mcpClientManager.getToolsForSession(toolCallId);
        const requestedServerSet = new Set(mcpServerNames);
        const filteredMcpTools = allMcpTools.filter((t) => requestedServerSet.has(t.serverName));
        const bridged = bridgeMcpTools(filteredMcpTools);
        customTools.push(...bridged);
        mcpToolNames.push(...bridged.map((t) => t.name));
      }

      // Resource loader with subagent-specific prompt
      const promptText = systemPrompt || SUBAGENT_BASE_PROMPT;
      const resourceLoaderOpts: Record<string, unknown> = {
        cwd: workDir,
        systemPromptOverride: () => promptText,
        // Filter out ancestor AGENTS.md — only include workspace-local ones
        agentsFilesOverride: ({ agentsFiles }: { agentsFiles: { path: string; content: string }[] }) => ({
          agentsFiles: agentsFiles.filter((f: { path: string }) => f.path.startsWith(workDir)),
        }),
      };
      // Disable skills by default — only enable if explicitly requested
      if (!enableSkills) {
        resourceLoaderOpts.skillsOverride = () => ({ skills: [], diagnostics: [] });
      }
      const resourceLoader = new (piSdk as any).DefaultResourceLoader(resourceLoaderOpts);
      await resourceLoader.reload();

      // In-memory session manager (no persistence)
      const sessionManager = (piSdk.SessionManager as any).inMemory(workDir);

      const { session } = await piSdk.createAgentSession({
        cwd: workDir,
        model: piAi.getModel(
          process.env.PI_PROVIDER || "azure-openai-responses",
          process.env.PI_MODEL || "gpt-4",
        ),
        thinkingLevel,
        customTools,
        sessionManager,
        resourceLoader,
      } as any);

      // Determine which base tools to enable
      const baseToolNames = ["read", "write", "edit", "bash"];

      // Patch base tools with sandbox ops (same pattern as parent session)
      const s = session as any;
      if (sandboxUserId) {
        const workspacesRoot = resolve(DATA_ROOT, "workspaces");
        const containerWorkDir = workDir.replace(workspacesRoot, "/workspaces");
        const fileOps = createSandboxFileOps();

        s._cwd = containerWorkDir;
        const toolsOverride: Record<string, unknown> = {
          read: piSdk.createReadTool(containerWorkDir, { operations: fileOps.read }),
          write: piSdk.createWriteTool(containerWorkDir, { operations: fileOps.write }),
          edit: piSdk.createEditTool(containerWorkDir, { operations: fileOps.edit }),
          bash: piSdk.createBashTool(containerWorkDir, {
            operations: createSandboxBashOps(sandboxUserId),
          }),
        };
        s._baseToolsOverride = toolsOverride;
      } else {
        const toolsOverride: Record<string, unknown> = {
          read: piSdk.createReadTool(workDir),
          write: piSdk.createWriteTool(workDir),
          edit: piSdk.createEditTool(workDir),
          bash: piSdk.createBashTool(workDir),
        };
        s._baseToolsOverride = toolsOverride;
      }

      const activeToolNames = [...baseToolNames, ...customTools.map((t) => t.name)];
      s._buildRuntime({ activeToolNames, includeAllExtensionTools: false });

      // Notify client that a subagent has started (after tools are resolved)
      sendEvent({ type: "subagent_start", subagentId: toolCallId, name, task, activeTools: activeToolNames });

      // Track subagent results
      const toolCalls: { tool: string; args: unknown; result?: unknown; isError?: boolean }[] = [];
      let assistantText = "";

      // Subscribe to child session events and forward to client
      const unsubscribe = session.subscribe((event: any) => {
        const broworkEvent = translatePiEvent(event);
        if (!broworkEvent) return;

        switch (broworkEvent.type) {
          case "tool_start":
            toolCalls.push({ tool: broworkEvent.tool, args: broworkEvent.args });
            sendEvent({
              type: "subagent_tool_start",
              subagentId: toolCallId,
              tool: broworkEvent.tool,
              args: broworkEvent.args,
            });
            break;
          case "tool_end":
            for (let i = toolCalls.length - 1; i >= 0; i--) {
              if (toolCalls[i].tool === broworkEvent.tool && toolCalls[i].result === undefined) {
                toolCalls[i].result = broworkEvent.result;
                toolCalls[i].isError = broworkEvent.isError;
                break;
              }
            }
            sendEvent({
              type: "subagent_tool_end",
              subagentId: toolCallId,
              tool: broworkEvent.tool,
              result: broworkEvent.result,
              isError: broworkEvent.isError,
            });
            break;
          case "message_delta":
            assistantText += broworkEvent.text;
            sendEvent({
              type: "subagent_message_delta",
              subagentId: toolCallId,
              text: broworkEvent.text,
            });
            break;
          case "message_end":
            // Keep accumulated text — don't reset, so finalText captures the last output
            break;
        }
      });

      // Run the subagent
      try {
        // Handle abort
        if (signal) {
          signal.addEventListener("abort", () => {
            session.abort().catch(() => {});
          }, { once: true });
        }

        await session.prompt(task);

        // Collect final output — use accumulated assistant text or a summary
        const finalText = assistantText || "(Sub-agent completed without text output)";
        const truncated = finalText.length > MAX_RESULT_LENGTH
          ? finalText.slice(0, MAX_RESULT_LENGTH) + "… (truncated)"
          : finalText;

        sendEvent({ type: "subagent_end", subagentId: toolCallId, result: truncated, isError: false });

        return {
          content: [{ type: "text", text: truncated }],
          details: { name, task, toolCalls, activeTools: activeToolNames },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendEvent({ type: "subagent_end", subagentId: toolCallId, result: errorMsg, isError: true });

        return {
          content: [{ type: "text", text: `Sub-agent error: ${errorMsg}` }],
          details: { name, task, toolCalls, activeTools: activeToolNames, error: errorMsg },
        };
      } finally {
        unsubscribe();
        try { session.dispose(); } catch { /* ignore */ }
      }
    },
  };
}
