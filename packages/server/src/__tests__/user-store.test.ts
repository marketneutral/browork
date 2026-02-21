import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { mkdirSync, rmSync } from "fs";
import { initDatabase, closeDatabase } from "../db/database.js";
import {
  createUser,
  getUserById,
  getUserByUsername,
  authenticateUser,
  listUsers,
  deleteUser,
  createToken,
  validateToken,
  deleteToken,
  deleteUserTokens,
} from "../db/user-store.js";

const TEST_DIR = resolve(import.meta.dirname, "../../.test-data-users");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  initDatabase(resolve(TEST_DIR, "test.db"));
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("user-store", () => {
  describe("createUser", () => {
    it("should create a user with id, username, and displayName", () => {
      const user = createUser("u1", "alice", "Alice Smith", "password123");
      expect(user.id).toBe("u1");
      expect(user.username).toBe("alice");
      expect(user.displayName).toBe("Alice Smith");
      expect(user.createdAt).toBeDefined();
    });

    it("should reject duplicate usernames", () => {
      createUser("u1", "alice", "Alice", "pass1");
      expect(() => createUser("u2", "alice", "Alice 2", "pass2")).toThrow();
    });
  });

  describe("getUserById", () => {
    it("should return a user by id", () => {
      createUser("u1", "alice", "Alice", "pass");
      const user = getUserById("u1");
      expect(user).toBeDefined();
      expect(user!.username).toBe("alice");
    });

    it("should return undefined for non-existent user", () => {
      expect(getUserById("nonexistent")).toBeUndefined();
    });
  });

  describe("getUserByUsername", () => {
    it("should return user row by username", () => {
      createUser("u1", "alice", "Alice", "pass");
      const row = getUserByUsername("alice");
      expect(row).toBeDefined();
      expect(row!.id).toBe("u1");
      expect(row!.password_hash).toBeDefined();
      expect(row!.salt).toBeDefined();
    });

    it("should return undefined for non-existent username", () => {
      expect(getUserByUsername("nobody")).toBeUndefined();
    });
  });

  describe("authenticateUser", () => {
    it("should authenticate with correct credentials", () => {
      createUser("u1", "alice", "Alice", "mypassword");
      const user = authenticateUser("alice", "mypassword");
      expect(user).toBeDefined();
      expect(user!.id).toBe("u1");
      expect(user!.username).toBe("alice");
    });

    it("should reject wrong password", () => {
      createUser("u1", "alice", "Alice", "mypassword");
      expect(authenticateUser("alice", "wrongpassword")).toBeUndefined();
    });

    it("should reject non-existent username", () => {
      expect(authenticateUser("nobody", "pass")).toBeUndefined();
    });
  });

  describe("listUsers", () => {
    it("should return empty array when no users", () => {
      expect(listUsers()).toEqual([]);
    });

    it("should return all users", () => {
      createUser("u1", "alice", "Alice", "pass");
      createUser("u2", "bob", "Bob", "pass");
      const users = listUsers();
      expect(users.length).toBe(2);
      expect(users[0].username).toBe("alice");
      expect(users[1].username).toBe("bob");
    });
  });

  describe("deleteUser", () => {
    it("should delete a user", () => {
      createUser("u1", "alice", "Alice", "pass");
      expect(deleteUser("u1")).toBe(true);
      expect(getUserById("u1")).toBeUndefined();
    });

    it("should return false for non-existent user", () => {
      expect(deleteUser("nonexistent")).toBe(false);
    });
  });

  describe("tokens", () => {
    it("should create and validate a token", () => {
      createUser("u1", "alice", "Alice", "pass");
      const token = createToken("u1");
      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 random bytes in hex

      const user = validateToken(token);
      expect(user).toBeDefined();
      expect(user!.id).toBe("u1");
      expect(user!.username).toBe("alice");
    });

    it("should return undefined for invalid token", () => {
      expect(validateToken("invalidtoken")).toBeUndefined();
    });

    it("should delete a token", () => {
      createUser("u1", "alice", "Alice", "pass");
      const token = createToken("u1");
      expect(deleteToken(token)).toBe(true);
      expect(validateToken(token)).toBeUndefined();
    });

    it("should delete all tokens for a user", () => {
      createUser("u1", "alice", "Alice", "pass");
      const t1 = createToken("u1");
      const t2 = createToken("u1");
      deleteUserTokens("u1");
      expect(validateToken(t1)).toBeUndefined();
      expect(validateToken(t2)).toBeUndefined();
    });

    it("should cascade delete tokens when user is deleted", () => {
      createUser("u1", "alice", "Alice", "pass");
      const token = createToken("u1");
      deleteUser("u1");
      expect(validateToken(token)).toBeUndefined();
    });
  });
});
