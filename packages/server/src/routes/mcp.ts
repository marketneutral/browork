import type { FastifyPluginAsync } from "fastify";
import {
  listMcpServers,
  getMcpServer,
} from "../services/mcp-manager.js";
import { mcpClientManager } from "../services/mcp-client.js";

export const mcpRoutes: FastifyPluginAsync = async (app) => {
  // List all MCP servers (with live connection status).
  // Also triggers reconnection of any unhealthy servers as a side effect,
  // so the frontend's 10s poll doubles as a health-check.
  app.get("/mcp/servers", async () => {
    mcpClientManager.reconnectUnhealthy().catch(() => {});
    const servers = listMcpServers();
    return servers.map((s) => {
      const { status, toolCount, error } = mcpClientManager.getConnectionStatus(s.name);
      return { ...s, status, toolCount, error };
    });
  });

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
};
