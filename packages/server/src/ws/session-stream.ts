import type { FastifyPluginAsync } from "fastify";
import type { RawData } from "ws";
import { createPiSession, getSession } from "../services/pi-session.js";
import type { BroworkCommand } from "../services/pi-session.js";
import { subscribeWsToFileChanges } from "../services/file-watcher.js";
import { expandSkillPrompt, getSkill } from "../services/skill-manager.js";
import { addMessage } from "../db/session-store.js";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

export const sessionStreamHandler: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/sessions/:id/stream",
    { websocket: true },
    async (socket, req) => {
      const { id } = req.params as { id: string };

      // Per-user working directory (falls back to "default" if no auth)
      const userId = req.user?.id ?? "default";
      const workDir = resolve(DATA_ROOT, "workspaces", userId);
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

      // Track assistant text for persistence
      let assistantBuffer = "";

      // Listen for outgoing events to capture assistant messages
      const origSend = socket.send.bind(socket);
      socket.send = (data: any, ...args: any[]) => {
        try {
          const event = typeof data === "string" ? JSON.parse(data) : null;
          if (event) {
            if (event.type === "message_delta" && event.text) {
              assistantBuffer += event.text;
            } else if (
              (event.type === "message_end" || event.type === "agent_end") &&
              assistantBuffer
            ) {
              addMessage(id, "assistant", assistantBuffer, Date.now());
              assistantBuffer = "";
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
              const skill = getSkill(cmd.skill);
              const prompt = expandSkillPrompt(cmd.skill, cmd.args);
              if (!prompt || !skill) {
                socket.send(
                  JSON.stringify({
                    type: "error",
                    message: `Skill "${cmd.skill}" not found or disabled`,
                  }),
                );
                break;
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
