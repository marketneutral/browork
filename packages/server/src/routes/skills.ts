import type { FastifyPluginAsync } from "fastify";
import { resolve } from "path";
import {
  listSkills,
  getSkill,
  setSkillEnabled,
  listUserSkills,
  listSessionSkills,
  promoteSessionSkill,
  demoteUserSkill,
  deleteUserSkill,
} from "../services/skill-manager.js";
import { getSession } from "../services/pi-session.js";
import { getSessionById } from "../db/session-store.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

export const skillRoutes: FastifyPluginAsync = async (app) => {
  // List all admin (global) skills
  app.get("/skills", async () => {
    return listSkills();
  });

  // List the authenticated user's installed cross-session skills
  app.get("/skills/user", async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.code(401).send({ error: "Unauthorized" });
    return listUserSkills(userId);
  });

  // List session-local skills
  app.get<{ Params: { sessionId: string } }>(
    "/skills/session/:sessionId",
    async (req, reply) => {
      const userId = req.user?.id;
      const session = getSessionById(req.params.sessionId, userId);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      const workDir = resolve(DATA_ROOT, "workspaces", session.workspaceDir);
      return listSessionSkills(workDir);
    },
  );

  // Promote a session skill to user's installed skills
  app.post<{ Body: { sessionId: string; skillName: string } }>(
    "/skills/user/promote",
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: "Unauthorized" });
      const { sessionId, skillName } = req.body as { sessionId: string; skillName: string };
      if (!sessionId || !skillName) {
        return reply.code(400).send({ error: "sessionId and skillName are required" });
      }
      const session = getSessionById(sessionId, userId);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      const workDir = resolve(DATA_ROOT, "workspaces", session.workspaceDir);
      try {
        await promoteSessionSkill(userId, workDir, skillName);
        return { ok: true };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  // Demote an installed user skill back to the current session
  app.post<{ Body: { sessionId: string; skillName: string } }>(
    "/skills/user/demote",
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: "Unauthorized" });
      const { sessionId, skillName } = req.body as { sessionId: string; skillName: string };
      if (!sessionId || !skillName) {
        return reply.code(400).send({ error: "sessionId and skillName are required" });
      }
      const session = getSessionById(sessionId, userId);
      if (!session) return reply.code(404).send({ error: "Session not found" });
      const workDir = resolve(DATA_ROOT, "workspaces", session.workspaceDir);
      try {
        await demoteUserSkill(userId, workDir, skillName);
        return { ok: true };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  // Delete an installed user skill
  app.delete<{ Params: { name: string } }>(
    "/skills/user/:name",
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: "Unauthorized" });
      try {
        await deleteUserSkill(userId, req.params.name);
        return { ok: true };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  // Get a single skill
  app.get<{ Params: { name: string } }>(
    "/skills/:name",
    async (req, reply) => {
      const skill = getSkill(req.params.name);
      if (!skill) return reply.code(404).send({ error: "Skill not found" });
      return {
        name: skill.name,
        description: skill.description,
        enabled: skill.enabled,
      };
    },
  );

  // Toggle skill enabled/disabled
  app.patch<{ Params: { name: string }; Body: { enabled: boolean } }>(
    "/skills/:name",
    async (req, reply) => {
      const body = req.body as { enabled: boolean };
      const result = setSkillEnabled(req.params.name, body.enabled);
      if (!result) return reply.code(404).send({ error: "Skill not found" });
      return result;
    },
  );

  // Invoke a skill within a session
  app.post<{
    Params: { id: string; name: string };
    Body: { args?: string };
  }>("/sessions/:id/skill/:name", async (req, reply) => {
    const { id, name } = req.params;
    const { args } = (req.body as { args?: string }) || {};

    const session = getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const skill = getSkill(name);
    if (!skill || !skill.enabled) {
      return reply.code(404).send({ error: "Skill not found or disabled" });
    }

    // Send as Pi's native skill command
    const prompt = args?.trim()
      ? `/skill:${name} ${args.trim()}`
      : `/skill:${name}`;

    session.sendPrompt(prompt).catch((err) => {
      app.log.error({ err, skill: name }, "Skill invocation failed");
    });

    return { ok: true, skill: name };
  });
};
