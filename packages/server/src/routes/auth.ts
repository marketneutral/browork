import type { FastifyPluginAsync } from "fastify";
import { nanoid } from "nanoid";
import {
  createUser,
  authenticateUser,
  createToken,
  deleteToken,
  getUserByUsername,
} from "../db/user-store.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Register a new user
  app.post<{
    Body: { username: string; displayName: string; password: string };
  }>("/auth/register", async (req, reply) => {
    const { username, displayName, password } = req.body as {
      username: string;
      displayName: string;
      password: string;
    };

    if (!username || !password || !displayName) {
      return reply
        .code(400)
        .send({ error: "username, displayName, and password are required" });
    }

    if (username.length < 2 || username.length > 32) {
      return reply
        .code(400)
        .send({ error: "Username must be 2-32 characters" });
    }

    if (password.length < 4) {
      return reply
        .code(400)
        .send({ error: "Password must be at least 4 characters" });
    }

    // Check for existing user
    if (getUserByUsername(username)) {
      return reply.code(409).send({ error: "Username already taken" });
    }

    const id = nanoid(12);
    const user = createUser(id, username, displayName, password);
    const token = createToken(user.id);

    return { user, token };
  });

  // Login
  app.post<{ Body: { username: string; password: string } }>(
    "/auth/login",
    async (req, reply) => {
      const { username, password } = req.body as {
        username: string;
        password: string;
      };

      if (!username || !password) {
        return reply
          .code(400)
          .send({ error: "username and password are required" });
      }

      const user = authenticateUser(username, password);
      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const token = createToken(user.id);
      return { user, token };
    },
  );

  // Logout (requires auth — token is on request)
  app.post("/auth/logout", async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "No token provided" });
    }

    const token = authHeader.slice(7);
    deleteToken(token);
    return { ok: true };
  });

  // Get current user (requires auth)
  app.get("/auth/me", async (req, reply) => {
    // user is decorated on request by the auth hook
    const user = (req as any).user;
    if (!user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }
    return { user };
  });
};
