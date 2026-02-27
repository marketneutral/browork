/**
 * MCP Bridge — Converts MCP tools into Pi SDK ToolDefinitionLike format.
 *
 * Same interface as web-tools.ts so Pi treats MCP tools identically
 * to native custom tools.
 */

import { Type } from "@sinclair/typebox";
import { mcpClientManager, type McpToolInfo } from "../services/mcp-client.js";

// ── Types matching Pi SDK ToolDefinition shape (same as web-tools.ts) ──

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

/**
 * Bridge a single MCP tool into a Pi SDK ToolDefinitionLike.
 */
function bridgeMcpTool(tool: McpToolInfo): ToolDefinitionLike {
  return {
    name: tool.qualifiedName,
    label: tool.name,
    description: `[MCP: ${tool.serverName}] ${tool.description}`,
    parameters: Type.Unsafe(tool.inputSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx): Promise<ToolResult> {
      const result = await mcpClientManager.callTool(
        tool.serverName,
        tool.name,
        params as Record<string, unknown>,
      );

      return {
        content: result.content,
        details: {
          mcpServer: tool.serverName,
          mcpTool: tool.name,
          isError: result.isError,
        },
      };
    },
  };
}

/**
 * Convert an array of MCP tool infos into Pi SDK tool definitions.
 */
export function bridgeMcpTools(tools: McpToolInfo[]): ToolDefinitionLike[] {
  return tools.map(bridgeMcpTool);
}
