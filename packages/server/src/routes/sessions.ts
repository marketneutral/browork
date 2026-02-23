import type { FastifyPluginAsync } from "fastify";
import { nanoid } from "nanoid";
import { resolve, join } from "path";
import { cp, rm, mkdir, writeFile } from "fs/promises";
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
import { removeFileWatcher } from "../services/file-watcher.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

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
    const session = createSession(id, `Session ${sessions.length + 1}`, userId);

    // Write AGENTS.md into the workspace so Pi keeps intermediates out of sight
    const wsDir = resolve(DATA_ROOT, "workspaces", session.workspaceDir);
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, "AGENTS.md"), AGENTS_MD, "utf-8").catch(() => {});

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

const AGENTS_MD = `# Project Instructions

## Workspace Instructions

### Intermediate files

Write all intermediate and temporary files to a \`.pi-work/\` subdirectory
(e.g. helper scripts, thumbnail images, intermediate PDFs, conversion artifacts).

Only final deliverables belong in the workspace root. If the user asks for a document, powerpoint, plot, Excel sheet, etc. and doesn't specify a path, put it in the workspace root.
`;
