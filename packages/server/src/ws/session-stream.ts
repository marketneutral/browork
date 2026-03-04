import type { FastifyPluginAsync } from "fastify";
import type { RawData } from "ws";
import { createPiSession, getSession } from "../services/pi-session.js";
import type { BroworkCommand } from "../services/pi-session.js";
import { subscribeWsToFileChanges, getFileWatcher } from "../services/file-watcher.js";
import { initAgentsMdTracking, onFileChanged } from "../services/agents-md-tracker.js";
import { getSkill, getUserSkill, getSessionSkill } from "../services/skill-manager.js";
import { addMessage, getSessionById } from "../db/session-store.js";
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

      // Track AGENTS.md changes so updates are injected into the next prompt
      const unsubAgentsMd = getFileWatcher(workDir).subscribe(
        (paths) => onFileChanged(workDir, paths),
      );

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

      // Snapshot the current AGENTS.md hash so first prompt doesn't re-inject
      initAgentsMdTracking(workDir);

      // Accumulation and persistence of tool calls, messages, etc. is handled
      // in the Pi subscribe callback (pi-session.ts) so it works even when the
      // socket is disconnected during a session switch.
      //
      // The send interceptor here only tracks files_changed events for image
      // accumulation (these come from the file watcher, not from Pi events).
      const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
      const isImage = (p: string) => IMAGE_EXTS.has(p.slice(p.lastIndexOf(".")).toLowerCase());

      const origSend = socket.send.bind(socket);
      socket.send = (data: any, ...args: any[]) => {
        try {
          const event = typeof data === "string" ? JSON.parse(data) : null;
          if (event?.type === "files_changed" && Array.isArray(event.paths)) {
            for (const p of event.paths) {
              if (isImage(p)) session!.turnState.turnImagePaths.add(p);
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
              // Send as Pi's native skill command
              const prompt = cmd.args
                ? `/skill:${cmd.skill} ${cmd.args}`
                : `/skill:${cmd.skill}`;
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
            case "ask_user_response":
              session!.answerQuestion(cmd.requestId, cmd.answers);
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
        unsubAgentsMd();
        // Don't dispose session on disconnect — allow reconnection
      });
    },
  );
};
