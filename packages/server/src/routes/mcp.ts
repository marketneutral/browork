import type { FastifyPluginAsync } from "fastify";
import {
  addMcpServer,
  listMcpServers,
  getMcpServer,
  updateMcpServer,
  deleteMcpServer,
  writeMcpConfig,
} from "../services/mcp-manager.js";
import { resolve } from "path";
import { readdirSync, statSync } from "fs";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

export const mcpRoutes: FastifyPluginAsync = async (app) => {
  // List all MCP servers
  app.get("/mcp/servers", async () => {
    return listMcpServers();
  });

  // Add a new MCP server
  app.post<{
    Body: {
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
  }>("/mcp/servers", async (req, reply) => {
    const { name, command, args, env } = req.body as {
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };

    if (!name || !command) {
      return reply.code(400).send({ error: "name and command are required" });
    }

    if (getMcpServer(name)) {
      return reply.code(409).send({ error: "Server with this name already exists" });
    }

    const server = addMcpServer({ name, command, args, env });

    // Sync config to all active workspaces
    syncAllWorkspaces();

    return server;
  });

  // Update an MCP server (toggle enabled, change config)
  app.patch<{
    Params: { name: string };
    Body: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
    };
  }>("/mcp/servers/:name", async (req, reply) => {
    const { name } = req.params;
    const updates = req.body as {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
    };

    const server = updateMcpServer(name, updates);
    if (!server) {
      return reply.code(404).send({ error: "MCP server not found" });
    }

    syncAllWorkspaces();

    return server;
  });

  // Delete an MCP server
  app.delete<{ Params: { name: string } }>(
    "/mcp/servers/:name",
    async (req, reply) => {
      if (!deleteMcpServer(req.params.name)) {
        return reply.code(404).send({ error: "MCP server not found" });
      }

      syncAllWorkspaces();

      return { ok: true };
    },
  );
};

/**
 * Write mcp.json to all workspace directories.
 * In practice, the config is written when a Pi session starts,
 * but we also sync on config changes for running sessions.
 */
function syncAllWorkspaces() {
  const workspacesDir = resolve(DATA_ROOT, "workspaces");
  try {
    const entries = readdirSync(workspacesDir);
    for (const entry of entries) {
      const full = resolve(workspacesDir, entry);
      try {
        if (statSync(full).isDirectory()) {
          writeMcpConfig(full);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // workspaces dir doesn't exist yet — fine
  }
}
