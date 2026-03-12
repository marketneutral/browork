import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/database.js";
import { isAdminUser } from "./auth.js";
import {
  isSandboxEnabled,
  isDockerAvailable,
  isSandboxImageAvailable,
  listSandboxes,
  listSandboxStats,
  removeSandbox,
} from "../services/sandbox-manager.js";
import { resolve, join, dirname } from "path";
import { readdir, stat, readFile, rm } from "fs/promises";
import { statSync, existsSync } from "fs";
import { homedir, cpus, totalmem, freemem, loadavg } from "os";
import { execSync } from "child_process";
import { listMcpServers, getMcpServer, updateMcpServer, addMcpServer, deleteMcpServer } from "../services/mcp-manager.js";
import { mcpClientManager } from "../services/mcp-client.js";
import { listSkills, listUserSkills, removeSystemSkill, scanSkillDirectory, GLOBAL_SKILLS_DIR, rebuildAppendSystemPrompt, initSkills } from "../services/skill-manager.js";
import { listUsers, deleteUser, getUserById } from "../db/user-store.js";
import { listActiveSessions, getActiveSystemPrompt } from "../services/pi-session.js";
import { getSkillUsageStats, getSkillUsageTimeseries } from "../db/session-store.js";
import { getAllUsersWeeklyUsage, getWeeklyUsage, getUserUsageHistory, getUserBudget, setUserBudget, removeUserBudget, getSystemDefaultBudget, getEffectiveBudget } from "../db/token-usage-store.js";

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

    const weeklyTokenUsage = getAllUsersWeeklyUsage();
    const weeklyTokensTotal = weeklyTokenUsage.reduce((sum, u) => sum + u.totalTokens, 0);

    return {
      totalUsers,
      totalSessions,
      totalMessages,
      activeTokens,
      totalStorageBytes,
      todaySessions,
      todayMessages,
      newUsersThisWeek,
      weeklyTokensTotal,
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

    // Compute per-user storage from workspace directories
    const workspaceDirs = db.prepare(`
      SELECT user_id, workspace_dir FROM sessions WHERE user_id IS NOT NULL
    `).all() as { user_id: string; workspace_dir: string }[];

    const userStorageMap = new Map<string, number>();
    await Promise.all(
      workspaceDirs.map(async ({ user_id, workspace_dir }) => {
        const bytes = await getSessionWorkspaceSize(workspace_dir);
        userStorageMap.set(user_id, (userStorageMap.get(user_id) ?? 0) + bytes);
      }),
    );

    return rows.map((r) => ({
      ...r,
      isAdmin: isAdminUser(r.username),
      storageBytes: userStorageMap.get(r.id) ?? 0,
    }));
  });

  // ─── User detail ───
  app.get<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    const db = getDb();
    const user = db.prepare("SELECT id, username, display_name as displayName, created_at as createdAt FROM users WHERE id = ?").get(req.params.id) as any;
    if (!user) return reply.code(404).send({ error: "User not found" });

    const sessions = db.prepare(`
      SELECT s.id, s.name, s.created_at as createdAt, s.updated_at as updatedAt, s.workspace_dir as workspaceDir,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as messageCount,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage t WHERE t.session_id = s.id) as totalTokens
      FROM sessions s
      WHERE s.user_id = ?
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

    const weeklyUsage = getWeeklyUsage(req.params.id);
    const customBudget = getUserBudget(req.params.id);

    return {
      ...user,
      isAdmin: isAdminUser(user.username),
      sessions: sessionsWithSize,
      totals: {
        sessions: sessions.length,
        messages: totalMessages,
        storageBytes: totalStorage,
      },
      tokenUsage: {
        thisWeek: weeklyUsage,
        budget: {
          limit: customBudget ?? getSystemDefaultBudget(),
          isCustom: customBudget !== null,
        },
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

    // Get the assembled system prompt from an active Pi session (most robust —
    // uses the SDK's own buildSystemPrompt, stays in sync with SDK updates)
    const assembledPrompt = getActiveSystemPrompt();
    const promptError = assembledPrompt ? null : "No active Pi sessions — start a chat to see the assembled prompt";

    return {
      systemMd,
      systemMdPath,
      appendSystemMd,
      appendSystemMdPath,
      assembledPrompt,
      promptError,
      builtInDefault: null,
    };
  });

  // ─── Sandbox containers with live stats ───
  app.get("/admin/containers", async () => {
    if (!isSandboxEnabled()) {
      return { enabled: false, containers: [] };
    }
    const stats = listSandboxStats();
    const enriched = stats.map((c) => {
      const user = getUserById(c.userId);
      return { ...c, username: user?.username ?? null, displayName: user?.displayName ?? null };
    });
    return { enabled: true, containers: enriched };
  });

  // Kill a user's sandbox container
  app.delete<{ Params: { userId: string } }>("/admin/containers/:userId", async (req, reply) => {
    const { userId } = req.params;
    try {
      // removeSandbox cleans the in-memory map + runs docker rm -f
      removeSandbox(userId);
      // Also force-remove by container name in case in-memory map was out of sync
      const containerName = `opentowork-sandbox-${userId}`;
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: "ignore", timeout: 10000 });
      } catch { /* already removed */ }
      return { ok: true };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || "Failed to kill container" });
    }
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
    await rebuildAppendSystemPrompt();
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
    await rebuildAppendSystemPrompt();
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
    await rebuildAppendSystemPrompt();
    const status = mcpClientManager.getConnectionStatus(server.name);
    return { ...server, ...status };
  });

  app.delete<{ Params: { name: string } }>("/admin/mcp/servers/:name", async (req, reply) => {
    const server = getMcpServer(req.params.name);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    await mcpClientManager.disconnectServer(req.params.name);
    deleteMcpServer(req.params.name);
    await rebuildAppendSystemPrompt();
    return { ok: true };
  });

  // ─── Skills ───
  app.post("/admin/skills/rescan", async () => {
    await initSkills();
    return { ok: true, count: listSkills().length };
  });

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

  app.get<{ Querystring: { days?: string } }>("/admin/skills/usage", async (req) => {
    const stats = getSkillUsageStats();
    const days = parseInt(req.query.days || "30", 10);
    const timeseries = getSkillUsageTimeseries(days);
    return { stats, timeseries, days };
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

  // ─── Token Usage & Budgets ───
  app.get("/admin/token-usage", async () => {
    const usersUsage = getAllUsersWeeklyUsage();
    const systemDefaultLimit = getSystemDefaultBudget();
    // Enrich with username + effective budget
    const db = getDb();
    return {
      systemDefaultLimit,
      users: usersUsage.map((u) => {
        const user = db.prepare("SELECT username, display_name as displayName FROM users WHERE id = ?").get(u.userId) as any;
        const customBudget = getUserBudget(u.userId);
        return {
          ...u,
          username: user?.username ?? null,
          displayName: user?.displayName ?? null,
          limit: customBudget ?? systemDefaultLimit,
          isCustomBudget: customBudget !== null,
        };
      }),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { weeks?: string } }>("/admin/token-usage/:id", async (req, reply) => {
    const target = getUserById(req.params.id);
    if (!target) return reply.code(404).send({ error: "User not found" });
    const weeks = parseInt(req.query.weeks || "12", 10);
    const weekly = getWeeklyUsage(req.params.id);
    const history = getUserUsageHistory(req.params.id, weeks);
    const customBudget = getUserBudget(req.params.id);
    return {
      thisWeek: weekly,
      history,
      budget: {
        limit: customBudget ?? getSystemDefaultBudget(),
        isCustom: customBudget !== null,
      },
    };
  });

  app.put<{ Params: { id: string }; Body: { weeklyLimit: number } }>("/admin/users/:id/budget", async (req, reply) => {
    const target = getUserById(req.params.id);
    if (!target) return reply.code(404).send({ error: "User not found" });
    const { weeklyLimit } = req.body as { weeklyLimit: number };
    if (typeof weeklyLimit !== "number" || weeklyLimit < 0) {
      return reply.code(400).send({ error: "weeklyLimit must be a non-negative number" });
    }
    setUserBudget(req.params.id, weeklyLimit);
    return { ok: true, weeklyLimit };
  });

  app.delete<{ Params: { id: string } }>("/admin/users/:id/budget", async (req, reply) => {
    const target = getUserById(req.params.id);
    if (!target) return reply.code(404).send({ error: "User not found" });
    removeUserBudget(req.params.id);
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
