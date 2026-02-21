import type { FastifyPluginAsync } from "fastify";
import { nanoid } from "nanoid";
import {
  createSession,
  getSessionById,
  listSessions,
  renameSession,
  deleteSession,
  forkSession,
  addMessage,
  getMessages,
} from "../db/session-store.js";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // List sessions (scoped to authenticated user)
  app.get("/sessions", async (req) => {
    const userId = req.user?.id;
    return listSessions(userId);
  });

  // Create session
  app.post("/sessions", async (req) => {
    const userId = req.user?.id;
    const id = nanoid(12);
    const sessions = listSessions(userId);
    return createSession(id, `Session ${sessions.length + 1}`, userId);
  });

  // Get session (includes messages)
  app.get<{ Params: { id: string } }>("/sessions/:id", async (req, reply) => {
    const userId = req.user?.id;
    const session = getSessionById(req.params.id, userId);
    if (!session) return reply.code(404).send({ error: "Session not found" });

    const messages = getMessages(req.params.id);
    return { ...session, messages };
  });

  // Delete session
  app.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    async (req, reply) => {
      const userId = req.user?.id;
      if (!deleteSession(req.params.id, userId)) {
        return reply.code(404).send({ error: "Session not found" });
      }
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

      return forked;
    },
  );

  // Get messages for a session
  app.get<{ Params: { id: string } }>(
    "/sessions/:id/messages",
    async (req, reply) => {
      const userId = req.user?.id;
      const session = getSessionById(req.params.id, userId);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      return getMessages(req.params.id);
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
