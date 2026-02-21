import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { sessionRoutes } from "./routes/sessions.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { sessionStreamHandler } from "./ws/session-stream.js";

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

  // Routes
  await app.register(healthRoutes);
  await app.register(sessionRoutes, { prefix: "/api" });
  await app.register(fileRoutes, { prefix: "/api" });

  // WebSocket
  await app.register(sessionStreamHandler);

  await app.listen({ port: PORT, host: HOST });
  console.log(`Browork server listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
