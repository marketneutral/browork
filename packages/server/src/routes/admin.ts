import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/database.js";
import { isAdminUser } from "./auth.js";
import {
  isSandboxEnabled,
  isDockerAvailable,
  isSandboxImageAvailable,
  listSandboxes,
  listSandboxStats,
} from "../services/sandbox-manager.js";
import { resolve, join, dirname } from "path";
import { readdir, stat, readFile, rm } from "fs/promises";
import { statSync, existsSync } from "fs";
import { homedir, cpus, totalmem, freemem, loadavg } from "os";
import { execSync } from "child_process";
import { listMcpServers, getMcpServer, updateMcpServer, addMcpServer, deleteMcpServer } from "../services/mcp-manager.js";
import { mcpClientManager } from "../services/mcp-client.js";
import { listSkills, listUserSkills, removeSystemSkill, scanSkillDirectory, GLOBAL_SKILLS_DIR } from "../services/skill-manager.js";
import { listUsers, deleteUser, getUserById } from "../db/user-store.js";
import { listActiveSessions } from "../services/pi-session.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

// Cache workspace sizes for 60 seconds
let cachedTotalSize: { bytes: number; timestamp: number } | null = null;
const SIZE_CACHE_TTL = 60_000;

async function dirSize(dir: string): Promise<number> {
  let size = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = resolve(dir, e.name);
    if (e.isFile()) {
      const s = await stat(p).catch(() => null);
      if (s) size += s.size;
    } else if (e.isDirectory()) {
      size += await dirSize(p);
    }
  }
  return size;
}

async function getTotalWorkspaceSize(): Promise<number> {
  if (cachedTotalSize && Date.now() - cachedTotalSize.timestamp < SIZE_CACHE_TTL) {
    return cachedTotalSize.bytes;
  }
  const wsRoot = resolve(DATA_ROOT, "workspaces");
  const bytes = await dirSize(wsRoot);
  cachedTotalSize = { bytes, timestamp: Date.now() };
  return bytes;
}

async function getSessionWorkspaceSize(workspaceDir: string | null): Promise<number> {
  if (!workspaceDir) return 0;
  const dir = resolve(DATA_ROOT, "workspaces", workspaceDir);
  return dirSize(dir);
}

async function adminGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user || !isAdminUser(req.user.username)) {
    return reply.code(403).send({ error: "Admin access required" });
  }
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", adminGuard);

  // ─── Overview ───
  app.get("/admin/overview", async () => {
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
    const totalSessions = (db.prepare("SELECT COUNT(*) as c FROM sessions").get() as any).c;
    const totalMessages = (db.prepare("SELECT COUNT(*) as c FROM messages").get() as any).c;
    const activeTokens = (db.prepare("SELECT COUNT(*) as c FROM tokens WHERE expires_at > datetime('now')").get() as any).c;
    const todaySessions = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE created_at >= date('now')").get() as any).c;
    const todayMessages = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE timestamp >= ?").get(todayMs) as any).c;
    const newUsersThisWeek = (db.prepare("SELECT COUNT(*) as c FROM users WHERE created_at >= date('now', '-7 days')").get() as any).c;
    const totalStorageBytes = await getTotalWorkspaceSize();

    return {
      totalUsers,
      totalSessions,
      totalMessages,
      activeTokens,
      totalStorageBytes,
      todaySessions,
      todayMessages,
      newUsersThisWeek,
    };
  });

  // ─── Users list ───
  app.get("/admin/users", async () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        u.id,
        u.username,
        u.display_name as displayName,
        u.created_at as createdAt,
        COUNT(DISTINCT s.id) as sessionCount,
        COUNT(m.id) as messageCount,
        MAX(s.updated_at) as lastActive
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY u.id
      ORDER BY lastActive DESC
    `).all() as any[];

    return rows.map((r) => ({
      ...r,
      isAdmin: isAdminUser(r.username),
    }));
  });

  // ─── User detail ───
  app.get<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    const db = getDb();
    const user = db.prepare("SELECT id, username, display_name as displayName, created_at as createdAt FROM users WHERE id = ?").get(req.params.id) as any;
    if (!user) return reply.code(404).send({ error: "User not found" });

    const sessions = db.prepare(`
      SELECT s.id, s.name, s.created_at as createdAt, s.updated_at as updatedAt, s.workspace_dir as workspaceDir,
        COUNT(m.id) as messageCount
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all(req.params.id) as any[];

    // Compute workspace sizes in parallel
    const sessionsWithSize = await Promise.all(
      sessions.map(async (s: any) => ({
        ...s,
        workspaceSizeBytes: await getSessionWorkspaceSize(s.workspaceDir),
      })),
    );

    const totalMessages = sessionsWithSize.reduce((sum: number, s: any) => sum + s.messageCount, 0);
    const totalStorage = sessionsWithSize.reduce((sum: number, s: any) => sum + s.workspaceSizeBytes, 0);

    return {
      ...user,
      isAdmin: isAdminUser(user.username),
      sessions: sessionsWithSize,
      totals: {
        sessions: sessions.length,
        messages: totalMessages,
        storageBytes: totalStorage,
      },
    };
  });

  // ─── Activity time-series ───
  app.get<{ Querystring: { days?: string } }>("/admin/activity", async (req) => {
    const db = getDb();
    const days = parseInt(req.query.days || "30", 10);
    const cutoffMs = Date.now() - days * 86_400_000;

    const sessions = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM sessions WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY day ORDER BY day
    `).all(days) as any[];

    const messages = db.prepare(`
      SELECT date(datetime(timestamp / 1000, 'unixepoch')) as day, COUNT(*) as count
      FROM messages WHERE timestamp >= ?
      GROUP BY day ORDER BY day
    `).all(cutoffMs) as any[];

    const activeUsers = db.prepare(`
      SELECT date(datetime(m.timestamp / 1000, 'unixepoch')) as day,
             COUNT(DISTINCT s.user_id) as count
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE m.timestamp >= ? AND m.role = 'user'
      GROUP BY day ORDER BY day
    `).all(cutoffMs) as any[];

    const signups = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM users WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY day ORDER BY day
    `).all(days) as any[];

    return { days, sessions, messages, activeUsers, signups };
  });

  // ─── Tool usage ───
  app.get("/admin/tools", async () => {
    const db = getDb();
    const rows = db.prepare(
      "SELECT tool_calls FROM messages WHERE tool_calls IS NOT NULL AND tool_calls != ''",
    ).all() as { tool_calls: string }[];

    const toolCounts = new Map<string, { count: number; errorCount: number }>();
    let totalCalls = 0;

    for (const row of rows) {
      try {
        const calls = JSON.parse(row.tool_calls) as { tool: string; isError?: boolean }[];
        for (const call of calls) {
          totalCalls++;
          const entry = toolCounts.get(call.tool) || { count: 0, errorCount: 0 };
          entry.count++;
          if (call.isError) entry.errorCount++;
          toolCounts.set(call.tool, entry);
        }
      } catch {
        // skip malformed JSON
      }
    }

    const tools = [...toolCounts.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count);

    return { tools, totalCalls };
  });

  // ─── Pi prompts ───
  // Uses the same Pi SDK resource loader that real sessions use,
  // so the admin sees the exact prompts Pi would receive.
  app.get("/admin/prompts", async () => {
    const piAgentDir = join(homedir(), ".pi", "agent");

    async function safeRead(path: string): Promise<string | null> {
      try { return await readFile(path, "utf-8"); } catch { return null; }
    }

    // Raw files
    const systemMdPath = join(piAgentDir, "SYSTEM.md");
    const appendSystemMdPath = join(piAgentDir, "APPEND_SYSTEM.md");
    const systemMd = await safeRead(systemMdPath);
    const appendSystemMd = await safeRead(appendSystemMdPath);

    // Try to build the full assembled prompt using the Pi SDK (same code path as real sessions)
    let assembledPrompt: string | null = null;
    try {
      const piSdk: any = await import("@mariozechner/pi-coding-agent");
      // Deep import for buildSystemPrompt (not re-exported from main entry)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — deep import path has no type declarations
      const systemPromptMod: any = await import("@mariozechner/pi-coding-agent/dist/core/system-prompt.js");
      const buildSystemPrompt: (...args: any[]) => string = systemPromptMod.buildSystemPrompt;

      // Use the SDK's resource loader to discover files exactly as a real session would
      const loader = new piSdk.DefaultResourceLoader({ cwd: process.cwd() });
      await loader.reload();

      const customPrompt = loader.getSystemPrompt();
      const appendParts = loader.getAppendSystemPrompt();
      const { agentsFiles } = loader.getAgentsFiles();
      const { skills } = loader.getSkills();

      assembledPrompt = buildSystemPrompt({
        customPrompt,
        appendSystemPrompt: appendParts.join("\n\n"),
        contextFiles: agentsFiles,
        skills,
        cwd: process.cwd(),
      });
    } catch {
      // Pi SDK not installed — mock mode, show raw files only
    }

    return {
      systemMd,
      systemMdPath,
      appendSystemMd,
      appendSystemMdPath,
      assembledPrompt,
    };
  });

  // ─── Sandbox containers with live stats ───
  app.get("/admin/containers", async () => {
    if (!isSandboxEnabled()) {
      return { enabled: false, containers: [] };
    }
    return { enabled: true, containers: listSandboxStats() };
  });

  // ─── MCP Servers ───
  app.get("/admin/mcp/servers", async () => {
    const servers = listMcpServers();
    return servers.map((s) => {
      const status = mcpClientManager.getConnectionStatus(s.name);
      return { ...s, ...status };
    });
  });

  app.post<{ Params: { name: string } }>("/admin/mcp/servers/:name/reconnect", async (req, reply) => {
    const server = getMcpServer(req.params.name);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    await mcpClientManager.connectServer(server);
    const status = mcpClientManager.getConnectionStatus(server.name);
    return { ok: true, ...status };
  });

  app.patch<{ Params: { name: string }; Body: { enabled?: boolean } }>("/admin/mcp/servers/:name", async (req, reply) => {
    const updated = updateMcpServer(req.params.name, req.body as any);
    if (!updated) return reply.code(404).send({ error: "Server not found" });
    if ((req.body as any).enabled === false) {
      await mcpClientManager.disconnectServer(req.params.name);
    } else if ((req.body as any).enabled === true) {
      await mcpClientManager.connectServer(updated);
    }
    const status = mcpClientManager.getConnectionStatus(updated.name);
    return { ...updated, ...status };
  });

  app.get<{ Params: { name: string } }>("/admin/mcp/servers/:name/tools", async (req, reply) => {
    const server = getMcpServer(req.params.name);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    return mcpClientManager.getServerTools(server.name);
  });

  app.post<{ Body: { name: string; url: string; transport?: "sse" | "streamable-http"; headers?: Record<string, string> } }>("/admin/mcp/servers", async (req, reply) => {
    const { name, url, transport, headers } = req.body as any;
    if (!name || !url) return reply.code(400).send({ error: "Name and URL are required" });
    if (getMcpServer(name)) return reply.code(409).send({ error: "Server already exists" });
    const server = addMcpServer({ name, url, transport, headers });
    await mcpClientManager.connectServer(server);
    const status = mcpClientManager.getConnectionStatus(server.name);
    return { ...server, ...status };
  });

  app.delete<{ Params: { name: string } }>("/admin/mcp/servers/:name", async (req, reply) => {
    const server = getMcpServer(req.params.name);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    await mcpClientManager.disconnectServer(req.params.name);
    deleteMcpServer(req.params.name);
    return { ok: true };
  });

  // ─── Skills ───
  app.get("/admin/skills", async () => {
    const systemSkills = listSkills();
    // Enrich with dirPath by scanning the global skills directory
    const scanned = await scanSkillDirectory(GLOBAL_SKILLS_DIR, { register: false });
    const dirMap = new Map(scanned.map((s) => [s.name, s.dirPath]));
    return systemSkills.map((s) => ({
      ...s,
      dirPath: dirMap.get(s.name) ?? null,
    }));
  });

  app.get("/admin/skills/users", async () => {
    const users = listUsers();
    const result: { userId: string; username: string; displayName: string; skills: { name: string; description: string }[] }[] = [];
    for (const u of users) {
      const skills = await listUserSkills(u.id);
      if (skills.length > 0) {
        result.push({
          userId: u.id,
          username: u.username,
          displayName: u.displayName,
          skills: skills.map((s) => ({ name: s.name, description: s.description })),
        });
      }
    }
    return result;
  });

  app.delete<{ Params: { name: string } }>("/admin/skills/:name", async (req, reply) => {
    const removed = await removeSystemSkill(req.params.name);
    if (!removed) return reply.code(404).send({ error: "Skill not found" });
    return { ok: true };
  });

  // ─── Active Sessions ───
  app.get("/admin/sessions/active", async () => {
    const db = getDb();
    const sessions = listActiveSessions();
    return sessions.map((s) => {
      const row = db.prepare(
        "SELECT s.name, s.created_at as createdAt, u.username, u.display_name as displayName FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?",
      ).get(s.sessionId) as any;
      return {
        ...s,
        sessionName: row?.name ?? null,
        createdAt: row?.createdAt ?? null,
        username: row?.username ?? null,
        displayName: row?.displayName ?? null,
      };
    });
  });

  // ─── Delete User ───
  app.delete<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    const targetId = req.params.id;

    // Prevent self-deletion
    if (req.user?.id === targetId) {
      return reply.code(400).send({ error: "Cannot delete your own account" });
    }

    const target = getUserById(targetId);
    if (!target) return reply.code(404).send({ error: "User not found" });

    // Get workspace dirs before deleting (CASCADE will remove sessions)
    const db = getDb();
    const workspaceDirs = db.prepare(
      "SELECT workspace_dir FROM sessions WHERE user_id = ?",
    ).all(targetId) as { workspace_dir: string | null }[];

    // Delete user (cascades sessions, messages, tokens)
    const deleted = deleteUser(targetId);
    if (!deleted) return reply.code(500).send({ error: "Failed to delete user" });

    // Clean up filesystem in background
    const cleanup = async () => {
      // Remove workspace directories
      for (const row of workspaceDirs) {
        if (!row.workspace_dir) continue;
        const dir = resolve(DATA_ROOT, "workspaces", row.workspace_dir);
        try { await rm(dir, { recursive: true }); } catch {}
      }
      // Remove user-skills directory
      const userSkillsPath = resolve(DATA_ROOT, "user-skills", targetId);
      try { await rm(userSkillsPath, { recursive: true }); } catch {}
      // Remove user-settings directory
      const userSettingsPath = resolve(DATA_ROOT, "user-settings", targetId);
      try { await rm(userSettingsPath, { recursive: true }); } catch {}
    };
    cleanup().catch((err) => console.error(`User cleanup failed for ${targetId}:`, err));

    return { ok: true };
  });

  // ─── System info ───
  app.get("/admin/system", async () => {
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = statSync(resolve(DATA_ROOT, "browork.db")).size;
    } catch { /* no db file */ }

    const mem = process.memoryUsage();
    const sandboxEnabled = isSandboxEnabled();

    // Host CPU info
    const cpuCores = cpus();
    const cpuModel = cpuCores[0]?.model ?? "Unknown";
    const [load1, load5, load15] = loadavg();

    // Host memory
    const totalMem = totalmem();
    const freeMem = freemem();

    // Host disk usage (for the partition containing DATA_ROOT)
    let disk: { total: number; used: number; available: number; percent: number } | null = null;
    try {
      const dfOutput = execSync(`df -B1 --output=size,used,avail "${DATA_ROOT}"`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const lines = dfOutput.split("\n");
      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        const total = parseInt(parts[0], 10);
        const used = parseInt(parts[1], 10);
        const available = parseInt(parts[2], 10);
        disk = { total, used, available, percent: total > 0 ? (used / total) * 100 : 0 };
      }
    } catch { /* df not available */ }

    return {
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      dbSizeBytes,
      memoryUsage: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      host: {
        cpuModel,
        cpuCores: cpuCores.length,
        loadAvg: { load1, load5, load15 },
        totalMemory: totalMem,
        freeMemory: freeMem,
        usedMemory: totalMem - freeMem,
        disk,
      },
      sandbox: {
        enabled: sandboxEnabled,
        dockerAvailable: sandboxEnabled ? isDockerAvailable() : null,
        imageAvailable: sandboxEnabled ? isSandboxImageAvailable() : null,
        activeContainers: sandboxEnabled ? listSandboxes().length : 0,
      },
    };
  });
};
