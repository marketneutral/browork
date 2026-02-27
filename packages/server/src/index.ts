import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { sessionRoutes } from "./routes/sessions.js";
import { fileRoutes } from "./routes/files.js";
import { skillRoutes } from "./routes/skills.js";
import { mcpRoutes } from "./routes/mcp.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { sessionStreamHandler } from "./ws/session-stream.js";
import { initSkills } from "./services/skill-manager.js";
import { initDatabase } from "./db/database.js";
import { authPlugin } from "./plugins/auth.js";
import { isSandboxEnabled, isDockerAvailable } from "./services/sandbox-manager.js";
import { mcpClientManager } from "./services/mcp-client.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || "10", 10);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  });

  // Rate limiting — protects auth and API routes from abuse
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1"],
    keyGenerator: (req) => {
      // Rate-limit by authenticated user ID if available, otherwise by IP
      return req.user?.id ?? req.ip;
    },
  });

  // Global error handler — consistent JSON error responses
  app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, _req, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Rate limit exceeded
    if (statusCode === 429) {
      return reply.code(429).send({
        error: "Too many requests. Please wait a moment and try again.",
        retryAfter: error.message,
      });
    }

    // Validation errors
    if (statusCode === 400 && error.validation) {
      return reply.code(400).send({
        error: "Invalid request",
        details: error.validation,
      });
    }

    // Log server errors
    if (statusCode >= 500) {
      app.log.error({ err: error }, "Internal server error");
    }

    return reply.code(statusCode).send({
      error:
        statusCode >= 500
          ? "An internal error occurred. Please try again later."
          : error.message,
    });
  });

  // 404 handler
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "Not found" });
  });

  // Initialize database
  initDatabase();

  // Discover and load skills
  await initSkills();

  // Connect to configured MCP servers
  await mcpClientManager.initConnections();

  // Check sandbox configuration
  if (isSandboxEnabled()) {
    if (isDockerAvailable()) {
      app.log.info("Sandbox mode enabled — Docker containers per user");
    } else {
      app.log.warn(
        "SANDBOX_ENABLED=true but Docker is not available. " +
        "Sessions will run on host. Install Docker to enable sandboxing.",
      );
    }
  }

  // Auth plugin — must be registered before protected routes
  await app.register(authPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(sessionRoutes, { prefix: "/api" });
  await app.register(fileRoutes, { prefix: "/api" });
  await app.register(skillRoutes, { prefix: "/api" });
  await app.register(mcpRoutes, { prefix: "/api" });

  // WebSocket
  await app.register(sessionStreamHandler);

  await app.listen({ port: PORT, host: HOST });
  console.log(`Server listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
