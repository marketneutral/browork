import type { FastifyPluginAsync } from "fastify";
import {
  isSandboxEnabled,
  isDockerAvailable,
  isSandboxImageAvailable,
  listSandboxes,
} from "../services/sandbox-manager.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const sandboxEnabled = isSandboxEnabled();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      sandbox: {
        enabled: sandboxEnabled,
        dockerAvailable: sandboxEnabled ? isDockerAvailable() : null,
        imageAvailable: sandboxEnabled ? isSandboxImageAvailable() : null,
        activeContainers: sandboxEnabled ? listSandboxes().length : 0,
      },
    };
  });
};
