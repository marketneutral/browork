import type { FastifyPluginAsync } from "fastify";
import { nanoid } from "nanoid";
import { resolve, join } from "path";
import { cp, rm, mkdir, writeFile } from "fs/promises";
import {
  createSession,
  getSessionById,
  listSessions,
  renameSession,
  starSession,
  deleteSession,
  forkSession,
  addMessage,
  getMessages,
} from "../db/session-store.js";
import { listUsers, getUserById } from "../db/user-store.js";
import { removeFileWatcher } from "../services/file-watcher.js";
import { readUserAgentsMd, readSystemDefault } from "./settings.js";
import { listActiveSessions } from "../services/pi-session.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // List sessions (scoped to authenticated user)
  app.get("/sessions", async (req) => {
    const userId = req.user?.id;
    return listSessions(userId);
  });

  // Return IDs of sessions currently running the agent (for this user)
  app.get("/sessions/running", async (req) => {
    const userId = req.user?.id;
    const active = listActiveSessions();
    const running = active
      .filter((s) => s.userId === userId && s.isRunning)
      .map((s) => s.sessionId);
    return { sessionIds: running };
  });

  // Create session
  app.post("/sessions", async (req) => {
    const userId = req.user?.id;
    const id = nanoid(12);
    const session = createSession(id, "Untitled Session", userId);

    // Write AGENTS.md into the workspace so Pi keeps intermediates out of sight
    const wsDir = resolve(DATA_ROOT, "workspaces", session.workspaceDir);
    await mkdir(wsDir, { recursive: true });

    // System default + user's custom additions appended
    let agentsContent = await readSystemDefault();
    if (userId) {
      const userContent = await readUserAgentsMd(userId);
      if (userContent) {
        agentsContent = agentsContent + "\n\n" + userContent;
      }
    }
    await writeFile(join(wsDir, "AGENTS.md"), agentsContent, "utf-8").catch(() => {});

    return session;
  });

  // Get session (includes messages)
  app.get<{ Params: { id: string } }>("/sessions/:id", async (req, reply) => {
    const userId = req.user?.id;
    const session = getSessionById(req.params.id, userId);
    if (!session) return reply.code(404).send({ error: "Session not found" });

    const messages = getMessages(req.params.id, userId);
    return { ...session, messages };
  });

  // Delete session
  app.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    async (req, reply) => {
      const userId = req.user?.id;
      // Grab workspace dir before deleting
      const session = getSessionById(req.params.id, userId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }
      const wsDir = resolve(DATA_ROOT, "workspaces", session.workspaceDir);

      if (!deleteSession(req.params.id, userId)) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // Clean up workspace directory and file watcher
      await removeFileWatcher(wsDir);
      await rm(wsDir, { recursive: true, force: true }).catch(() => {});

      return { ok: true };
    },
  );

  // Rename session
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/sessions/:id",
    async (req, reply) => {
      const userId = req.user?.id;
      const { name } = req.body as { name: string };
      const session = renameSession(req.params.id, name, userId);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      return session;
    },
  );

  // Star/unstar session
  app.put<{ Params: { id: string }; Body: { starred: boolean } }>(
    "/sessions/:id/star",
    async (req, reply) => {
      const userId = req.user?.id;
      const { starred } = req.body as { starred: boolean };
      if (!starSession(req.params.id, starred, userId)) {
        return reply.code(404).send({ error: "Session not found" });
      }
      return { ok: true };
    },
  );

  // Fork session (branch conversation)
  app.post<{ Params: { id: string } }>(
    "/sessions/:id/fork",
    async (req, reply) => {
      const userId = req.user?.id;
      const sourceId = req.params.id;
      const newId = nanoid(12);

      const source = getSessionById(sourceId, userId);
      if (!source) {
        return reply.code(404).send({ error: "Source session not found" });
      }

      const forked = forkSession(
        sourceId,
        newId,
        `${source.name} (fork)`,
        userId,
      );

      if (!forked) {
        return reply.code(500).send({ error: "Failed to fork session" });
      }

      // Copy workspace files from source to forked session
      const srcDir = resolve(DATA_ROOT, "workspaces", source.workspaceDir);
      const dstDir = resolve(DATA_ROOT, "workspaces", forked.workspaceDir);
      try {
        await cp(srcDir, dstDir, { recursive: true });
      } catch {
        // Source workspace may not exist if session had no files
      }

      return forked;
    },
  );

  // List users (for send-to-user picker, excludes current user)
  app.get("/users", async (req) => {
    const userId = req.user?.id;
    const users = listUsers();
    return users
      .filter((u) => u.id !== userId)
      .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName }));
  });

  // Send session to another user (fork + assign to target user)
  app.post<{ Params: { id: string } }>(
    "/sessions/:id/send-to",
    async (req, reply) => {
      const userId = req.user?.id;
      const sourceId = req.params.id;
      const { targetUserId } = req.body as { targetUserId: string };

      if (!targetUserId) {
        return reply.code(400).send({ error: "targetUserId is required" });
      }

      if (targetUserId === userId) {
        return reply.code(400).send({ error: "Cannot send a session to yourself. Use fork instead." });
      }

      const targetUser = getUserById(targetUserId);
      if (!targetUser) {
        return reply.code(404).send({ error: "Target user not found" });
      }

      const source = getSessionById(sourceId, userId);
      if (!source) {
        return reply.code(404).send({ error: "Source session not found" });
      }

      const newId = nanoid(12);
      const senderName = req.user?.displayName || req.user?.username || "Someone";
      const forked = forkSession(
        sourceId,
        newId,
        `${source.name} (from ${senderName})`,
        userId,
        targetUserId,
      );

      if (!forked) {
        return reply.code(500).send({ error: "Failed to send session" });
      }

      // Copy workspace files
      const srcDir = resolve(DATA_ROOT, "workspaces", source.workspaceDir);
      const dstDir = resolve(DATA_ROOT, "workspaces", forked.workspaceDir);
      try {
        await cp(srcDir, dstDir, { recursive: true });
      } catch {
        // Source workspace may not exist if session had no files
      }

      return { ok: true, sessionId: forked.id, targetUser: targetUser.displayName };
    },
  );

  // Get messages for a session
  app.get<{ Params: { id: string } }>(
    "/sessions/:id/messages",
    async (req, reply) => {
      const userId = req.user?.id;
      const session = getSessionById(req.params.id, userId);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      return getMessages(req.params.id, userId);
    },
  );

  // Add a message to a session
  app.post<{
    Params: { id: string };
    Body: { role: "user" | "assistant"; content: string; timestamp: number };
  }>("/sessions/:id/messages", async (req, reply) => {
    const userId = req.user?.id;
    const session = getSessionById(req.params.id, userId);
    if (!session) return reply.code(404).send({ error: "Session not found" });

    const { role, content, timestamp } = req.body as {
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    };

    addMessage(req.params.id, role, content, timestamp);
    return { ok: true };
  });
};

