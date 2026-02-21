import type { FastifyPluginAsync } from "fastify";
import {
  listSkills,
  getSkill,
  setSkillEnabled,
  expandSkillPrompt,
} from "../services/skill-manager.js";
import { getSession } from "../services/pi-session.js";

export const skillRoutes: FastifyPluginAsync = async (app) => {
  // List all skills
  app.get("/skills", async () => {
    return listSkills();
  });

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

    const prompt = expandSkillPrompt(name, args);
    if (!prompt) {
      return reply.code(404).send({ error: "Skill not found or disabled" });
    }

    // Send the expanded skill prompt to Pi asynchronously
    session.sendPrompt(prompt).catch((err) => {
      app.log.error({ err, skill: name }, "Skill invocation failed");
    });

    return { ok: true, skill: name };
  });
};
