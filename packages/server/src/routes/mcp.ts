import type { FastifyPluginAsync } from "fastify";
import {
  addMcpServer,
  listMcpServers,
  getMcpServer,
  updateMcpServer,
  deleteMcpServer,
} from "../services/mcp-manager.js";
import { mcpClientManager } from "../services/mcp-client.js";

export const mcpRoutes: FastifyPluginAsync = async (app) => {
  // List all MCP servers (with live connection status)
  app.get("/mcp/servers", async () => {
    const servers = listMcpServers();
    return servers.map((s) => {
      const { status, toolCount, error } = mcpClientManager.getConnectionStatus(s.name);
      return { ...s, status, toolCount, error };
    });
  });

  // Add a new MCP server
  app.post<{
    Body: {
      name: string;
      url: string;
      transport?: "sse" | "streamable-http";
      headers?: Record<string, string>;
    };
  }>("/mcp/servers", async (req, reply) => {
    const { name, url, transport, headers } = req.body as {
      name: string;
      url: string;
      transport?: "sse" | "streamable-http";
      headers?: Record<string, string>;
    };

    if (!name || !url) {
      return reply.code(400).send({ error: "name and url are required" });
    }

    if (getMcpServer(name)) {
      return reply.code(409).send({ error: "Server with this name already exists" });
    }

    const server = addMcpServer({ name, url, transport, headers });

    // Connect to the new server in the background
    mcpClientManager.connectServer(server).catch((err) => {
      console.error(`[mcp-routes] failed to connect ${name}:`, err);
    });

    const { status, toolCount, error } = mcpClientManager.getConnectionStatus(name);
    return { ...server, status, toolCount, error };
  });

  // Update an MCP server (toggle enabled, change config)
  app.patch<{
    Params: { name: string };
    Body: {
      url?: string;
      transport?: "sse" | "streamable-http";
      headers?: Record<string, string>;
      enabled?: boolean;
    };
  }>("/mcp/servers/:name", async (req, reply) => {
    const { name } = req.params;
    const updates = req.body as {
      url?: string;
      transport?: "sse" | "streamable-http";
      headers?: Record<string, string>;
      enabled?: boolean;
    };

    const server = updateMcpServer(name, updates);
    if (!server) {
      return reply.code(404).send({ error: "MCP server not found" });
    }

    // Reconnect or disconnect based on enabled state
    if (server.enabled) {
      mcpClientManager.connectServer(server).catch((err) => {
        console.error(`[mcp-routes] failed to reconnect ${name}:`, err);
      });
    } else {
      mcpClientManager.disconnectServer(name).catch(() => {});
    }

    const { status, toolCount, error } = mcpClientManager.getConnectionStatus(name);
    return { ...server, status, toolCount, error };
  });

  // Delete an MCP server
  app.delete<{ Params: { name: string } }>(
    "/mcp/servers/:name",
    async (req, reply) => {
      const { name } = req.params;

      // Disconnect before deleting
      await mcpClientManager.disconnectServer(name);

      if (!deleteMcpServer(name)) {
        return reply.code(404).send({ error: "MCP server not found" });
      }

      return { ok: true };
    },
  );

  // List discovered tools for a specific server
  app.get<{ Params: { name: string } }>(
    "/mcp/servers/:name/tools",
    async (req, reply) => {
      const { name } = req.params;
      if (!getMcpServer(name)) {
        return reply.code(404).send({ error: "MCP server not found" });
      }

      const tools = mcpClientManager.getServerTools(name);
      return tools.map((t) => ({
        name: t.name,
        qualifiedName: t.qualifiedName,
        description: t.description,
      }));
    },
  );

  // Force reconnect to a server
  app.post<{ Params: { name: string } }>(
    "/mcp/servers/:name/reconnect",
    async (req, reply) => {
      const server = getMcpServer(req.params.name);
      if (!server) {
        return reply.code(404).send({ error: "MCP server not found" });
      }

      // Reconnect in the background
      mcpClientManager.connectServer(server).catch((err) => {
        console.error(`[mcp-routes] reconnect failed for ${server.name}:`, err);
      });

      return { ok: true };
    },
  );
};
