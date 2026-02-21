import type { FastifyPluginAsync } from "fastify";
import { nanoid } from "nanoid";

// In-memory session store (Phase 4 will use SQLite)
interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
}

const sessions = new Map<string, SessionMeta>();

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // List sessions
  app.get("/sessions", async () => {
    return Array.from(sessions.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  });

  // Create session
  app.post("/sessions", async () => {
    const id = nanoid(12);
    const session: SessionMeta = {
      id,
      name: `Session ${sessions.size + 1}`,
      createdAt: new Date().toISOString(),
    };
    sessions.set(id, session);
    return session;
  });

  // Get session
  app.get<{ Params: { id: string } }>("/sessions/:id", async (req, reply) => {
    const session = sessions.get(req.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    return session;
  });

  // Delete session
  app.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    async (req, reply) => {
      if (!sessions.delete(req.params.id)) {
        return reply.code(404).send({ error: "Session not found" });
      }
      return { ok: true };
    },
  );

  // Rename session
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/sessions/:id",
    async (req, reply) => {
      const session = sessions.get(req.params.id);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      session.name = (req.body as { name: string }).name;
      return session;
    },
  );
};
