/**
 * MCP Client Manager — Connects to remote MCP servers and discovers tools.
 *
 * Singleton that manages MCP client connections. Connects via SSE or
 * Streamable HTTP transport, discovers available tools, and proxies
 * tool calls to the remote servers.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { listMcpServers, type McpServerMeta } from "./mcp-manager.js";

// ── Types ──

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Namespaced name: mcp__{serverName}__{toolName} */
  qualifiedName: string;
  serverName: string;
}

interface McpConnection {
  client: Client;
  transport: Transport;
  tools: McpToolInfo[];
  status: ConnectionStatus;
  error?: string;
}

const RECONNECT_DELAY_MS = 30_000;

// ── Singleton ──

class McpClientManager {
  private connections = new Map<string, McpConnection>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Connect to all enabled servers from the database.
   * Called at server startup. Non-blocking — errors are logged, not thrown.
   */
  async initConnections(): Promise<void> {
    const servers = listMcpServers().filter((s) => s.enabled);
    if (servers.length === 0) return;

    console.log(`[mcp-client] connecting to ${servers.length} MCP server(s)...`);
    await Promise.allSettled(servers.map((s) => this.connectServer(s)));
  }

  /**
   * Connect to a single MCP server. If already connected, disconnects first.
   */
  async connectServer(config: McpServerMeta): Promise<void> {
    // Disconnect existing connection if any
    await this.disconnectServer(config.name);

    const conn: McpConnection = {
      client: null as unknown as Client,
      transport: null as unknown as Transport,
      tools: [],
      status: "connecting",
    };
    this.connections.set(config.name, conn);

    try {
      const url = new URL(config.url);
      const headers: Record<string, string> = { ...config.headers };

      let transport: Transport;
      if (config.transport === "streamable-http") {
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: { headers },
        });
      } else {
        transport = new SSEClientTransport(url, {
          eventSourceInit: { fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), ...headers } }) },
          requestInit: { headers },
        });
      }

      const client = new Client(
        { name: "browork", version: "0.1.0" },
        { capabilities: {} },
      );

      // Wire up close/error handlers before connecting
      transport.onclose = () => {
        const c = this.connections.get(config.name);
        if (c && c.status !== "disconnected") {
          c.status = "disconnected";
          console.log(`[mcp-client] ${config.name} disconnected`);
          this.scheduleReconnect(config);
        }
      };

      transport.onerror = (err) => {
        const c = this.connections.get(config.name);
        if (c) {
          c.status = "error";
          c.error = err.message;
          console.error(`[mcp-client] ${config.name} error:`, err.message);
        }
      };

      await client.connect(transport);

      // Discover tools
      const { tools } = await client.listTools();
      const toolInfos: McpToolInfo[] = tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema as Record<string, unknown>,
        qualifiedName: `mcp__${config.name}__${t.name}`,
        serverName: config.name,
      }));

      conn.client = client;
      conn.transport = transport;
      conn.tools = toolInfos;
      conn.status = "connected";
      conn.error = undefined;

      console.log(
        `[mcp-client] ${config.name} connected — ${toolInfos.length} tool(s): ${toolInfos.map((t) => t.name).join(", ")}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      conn.status = "error";
      conn.error = msg;
      console.error(`[mcp-client] ${config.name} connection failed:`, msg);
      this.scheduleReconnect(config);
    }
  }

  /**
   * Disconnect from a server and clean up.
   */
  async disconnectServer(name: string): Promise<void> {
    this.clearReconnect(name);
    const conn = this.connections.get(name);
    if (!conn) return;

    conn.status = "disconnected";
    try {
      await conn.transport?.close?.();
    } catch {
      // ignore close errors
    }
    this.connections.delete(name);
  }

  /**
   * Call a tool on a remote MCP server.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: { type: "text"; text: string }[]; isError: boolean }> {
    const conn = this.connections.get(serverName);
    if (!conn || conn.status !== "connected") {
      return {
        content: [{ type: "text", text: `MCP server "${serverName}" is not connected` }],
        isError: true,
      };
    }

    try {
      const result = await conn.client.callTool({ name: toolName, arguments: args });

      // Normalize MCP response to text content
      const textParts: { type: "text"; text: string }[] = [];
      for (const item of result.content as Array<{ type: string; text?: string }>) {
        if (item.type === "text" && item.text) {
          textParts.push({ type: "text", text: item.text });
        }
      }

      if (textParts.length === 0) {
        textParts.push({ type: "text", text: JSON.stringify(result.content) });
      }

      return { content: textParts, isError: !!result.isError };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `MCP tool call failed: ${msg}` }],
        isError: true,
      };
    }
  }

  /**
   * Get all tools from all connected, enabled servers.
   */
  getToolsForSession(_sessionId: string): McpToolInfo[] {
    const tools: McpToolInfo[] = [];
    for (const [, conn] of this.connections) {
      if (conn.status === "connected") {
        tools.push(...conn.tools);
      }
    }
    return tools;
  }

  /**
   * Get connection info for all known servers (for status display).
   */
  getConnectionStatus(name: string): { status: ConnectionStatus; toolCount: number; error?: string } {
    const conn = this.connections.get(name);
    if (!conn) return { status: "disconnected", toolCount: 0 };
    return {
      status: conn.status,
      toolCount: conn.tools.length,
      error: conn.error,
    };
  }

  /**
   * Get tool list for a specific server.
   */
  getServerTools(name: string): McpToolInfo[] {
    return this.connections.get(name)?.tools ?? [];
  }

  /**
   * Disconnect all servers. Called at shutdown.
   */
  async shutdown(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((n) => this.disconnectServer(n)));
  }

  // ── Private ──

  private scheduleReconnect(config: McpServerMeta) {
    this.clearReconnect(config.name);
    const timer = setTimeout(() => {
      console.log(`[mcp-client] reconnecting to ${config.name}...`);
      this.connectServer(config).catch(() => {});
    }, RECONNECT_DELAY_MS);
    this.reconnectTimers.set(config.name, timer);
  }

  private clearReconnect(name: string) {
    const timer = this.reconnectTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(name);
    }
  }
}

export const mcpClientManager = new McpClientManager();
