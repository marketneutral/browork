import type { FastifyPluginAsync } from "fastify";
import type { RawData } from "ws";
import { createPiSession, getSession, isSkillKnownToSession } from "../services/pi-session.js";
import type { BroworkCommand } from "../services/pi-session.js";
import { subscribeWsToFileChanges } from "../services/file-watcher.js";
import { getSkill, getUserSkill, getSessionSkill } from "../services/skill-manager.js";
import { addMessage, setLastMessageImages, getSessionById } from "../db/session-store.js";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

export const sessionStreamHandler: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/sessions/:id/stream",
    { websocket: true },
    async (socket, req) => {
      const { id } = req.params as { id: string };

      // Per-session working directory
      const userId = req.user?.id;
      const sessionMeta = getSessionById(id, userId);
      if (!sessionMeta) {
        app.log.warn({ sessionId: id }, "WebSocket: session not found");
        socket.send(JSON.stringify({ type: "error", message: "Session not found" }));
        socket.close();
        return;
      }
      const workDir = resolve(DATA_ROOT, "workspaces", sessionMeta.workspaceDir);
      mkdirSync(workDir, { recursive: true });

      app.log.info({ sessionId: id }, "WebSocket connected");

      // Subscribe to file changes in the working directory
      const unsubFiles = subscribeWsToFileChanges(socket, workDir);

      // Create or reconnect to a Pi session
      let session = getSession(id);
      if (session) {
        // Re-wire the existing Pi session's events to the new WebSocket
        session.rebindSocket(socket);
        app.log.info({ sessionId: id }, "Rebound existing Pi session to new WebSocket");
      } else {
        try {
          session = await createPiSession(id, workDir, socket, userId);
        } catch (err) {
          app.log.error({ err }, "Failed to create Pi session");
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Failed to create agent session",
            }),
          );
          socket.close();
          return;
        }
      }

      // Track assistant text and images for persistence
      let assistantBuffer = "";
      let turnImagePaths: string[] = [];

      const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
      const isImage = (p: string) => IMAGE_EXTS.has(p.slice(p.lastIndexOf(".")).toLowerCase());

      // Listen for outgoing events to capture assistant messages and images
      const origSend = socket.send.bind(socket);
      socket.send = (data: any, ...args: any[]) => {
        try {
          const event = typeof data === "string" ? JSON.parse(data) : null;
          if (event) {
            if (event.type === "message_delta" && event.text) {
              assistantBuffer += event.text;
            } else if (event.type === "files_changed" && Array.isArray(event.paths)) {
              for (const p of event.paths) {
                if (isImage(p)) turnImagePaths.push(p);
              }
            } else if (event.type === "message_end" && assistantBuffer) {
              addMessage(id, "assistant", assistantBuffer, Date.now());
              assistantBuffer = "";
            } else if (event.type === "agent_end") {
              const images = turnImagePaths.length > 0 ? JSON.stringify(turnImagePaths) : null;
              if (assistantBuffer) {
                // message_end didn't fire — save text with images
                addMessage(id, "assistant", assistantBuffer, Date.now(), images);
                assistantBuffer = "";
              } else if (images) {
                // Text was already saved on message_end — attach images to it
                setLastMessageImages(id, images);
              }
              turnImagePaths = [];
            }
          }
        } catch {
          // Don't interfere with sending
        }
        return origSend(data, ...args);
      };

      socket.on("message", async (raw: RawData) => {
        let cmd: BroworkCommand;
        try {
          cmd = JSON.parse(raw.toString());
        } catch {
          return; // ignore malformed messages
        }

        try {
          switch (cmd.type) {
            case "prompt":
              // Persist user message
              addMessage(id, "user", cmd.message, Date.now());
              await session!.sendPrompt(cmd.message);
              break;
            case "skill_invoke": {
              // Look up skill from admin, user, or session sources
              const skill = getSkill(cmd.skill)
                ?? (userId ? await getUserSkill(userId, cmd.skill) : undefined)
                ?? await getSessionSkill(workDir, cmd.skill);
              if (!skill || !skill.enabled) {
                socket.send(
                  JSON.stringify({
                    type: "error",
                    message: `Skill "${cmd.skill}" not found or disabled`,
                  }),
                );
                break;
              }
              // If Pi discovered this skill at session creation, use /skill:name.
              // If it was created mid-session (e.g. by a skill-creator workflow),
              // Pi won't know about it, so inline the skill body as the prompt.
              let prompt: string;
              if (isSkillKnownToSession(id, cmd.skill)) {
                prompt = cmd.args
                  ? `/skill:${cmd.skill} ${cmd.args}`
                  : `/skill:${cmd.skill}`;
              } else {
                const inline = `Follow the instructions in this skill:\n\n# ${skill.name}\n${skill.description ? `> ${skill.description}\n\n` : "\n"}${skill.body}`;
                prompt = cmd.args
                  ? `${inline}\n\nUser input: ${cmd.args}`
                  : inline;
              }
              // Persist skill invocation as a user message
              const userMsg = cmd.args
                ? `[Workflow: ${cmd.skill}] ${cmd.args}`
                : `[Workflow: ${cmd.skill}]`;
              addMessage(id, "user", userMsg, Date.now());
              // Notify frontend that a skill is active
              socket.send(
                JSON.stringify({
                  type: "skill_start",
                  skill: cmd.skill,
                  label: skill.description,
                }),
              );
              await session!.sendPrompt(prompt);
              socket.send(
                JSON.stringify({
                  type: "skill_end",
                  skill: cmd.skill,
                }),
              );
              break;
            }
            case "steer":
              await session!.sendSteer(cmd.message);
              break;
            case "abort":
              await session!.abort();
              break;
            case "compact":
              await session!.compact();
              break;
          }
        } catch (err: any) {
          app.log.error({ err, cmd }, "Error handling WebSocket command");
          socket.send(
            JSON.stringify({
              type: "error",
              message: err.message || "Command failed",
            }),
          );
        }
      });

      socket.on("close", () => {
        app.log.info({ sessionId: id }, "WebSocket disconnected");
        unsubFiles();
        // Don't dispose session on disconnect — allow reconnection
      });
    },
  );
};
