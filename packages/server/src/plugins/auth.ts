/**
 * Fastify Auth Plugin
 *
 * Validates Bearer token on every request (except public routes).
 * Decorates `request.user` with the authenticated UserMeta.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { validateToken } from "../db/user-store.js";
import type { UserMeta } from "../db/user-store.js";

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/health",
  "/api/auth/login",
  "/api/auth/register",
];

declare module "fastify" {
  interface FastifyRequest {
    user?: UserMeta;
  }
}

export const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("user", undefined);

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Allow public routes
    if (PUBLIC_PATHS.some((p) => req.url.startsWith(p))) {
      return;
    }

    // WebSocket upgrade requests carry the token as a query param
    if (req.url.includes("/stream?")) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      if (token) {
        const user = validateToken(token);
        if (user) {
          req.user = user;
          return;
        }
      }
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const token = authHeader.slice(7);
    const user = validateToken(token);
    if (!user) {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }

    req.user = user;
  });
};
