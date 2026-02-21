import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { mkdirSync, rmSync } from "fs";
import { initDatabase, closeDatabase } from "../db/database.js";
import {
  createSession,
  getSessionById,
  listSessions,
  renameSession,
  deleteSession,
  forkSession,
  addMessage,
  getMessages,
} from "../db/session-store.js";

const TEST_DIR = resolve(import.meta.dirname, "../../.test-data-sessions");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  initDatabase(resolve(TEST_DIR, "test.db"));
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("session-store", () => {
  describe("createSession", () => {
    it("should create a session with id and name", () => {
      const session = createSession("s1", "Test Session");
      expect(session.id).toBe("s1");
      expect(session.name).toBe("Test Session");
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
      expect(session.lastMessage).toBeNull();
      expect(session.forkedFrom).toBeNull();
    });
  });

  describe("getSessionById", () => {
    it("should return a session by id", () => {
      createSession("s1", "Session 1");
      const session = getSessionById("s1");
      expect(session).toBeDefined();
      expect(session!.name).toBe("Session 1");
    });

    it("should return undefined for non-existent session", () => {
      expect(getSessionById("nonexistent")).toBeUndefined();
    });

    it("should include last message preview", () => {
      createSession("s1", "Session 1");
      addMessage("s1", "user", "Hello", Date.now());
      addMessage("s1", "assistant", "Hi there!", Date.now() + 1);

      const session = getSessionById("s1");
      expect(session!.lastMessage).toBe("Hi there!");
    });
  });

  describe("listSessions", () => {
    it("should return empty array when no sessions", () => {
      expect(listSessions()).toEqual([]);
    });

    it("should return sessions sorted by updated_at descending", () => {
      createSession("s1", "First");
      createSession("s2", "Second");
      // Add a message to s2 to ensure its updated_at is later
      addMessage("s2", "user", "bump", Date.now());
      const sessions = listSessions();
      expect(sessions.length).toBe(2);
      expect(sessions[0].id).toBe("s2");
      expect(sessions[1].id).toBe("s1");
    });

    it("should include last message previews", () => {
      createSession("s1", "Session 1");
      addMessage("s1", "user", "Hello", Date.now());

      const sessions = listSessions();
      expect(sessions[0].lastMessage).toBe("Hello");
    });

    it("should truncate long last messages", () => {
      createSession("s1", "Session 1");
      const longMsg = "A".repeat(200);
      addMessage("s1", "user", longMsg, Date.now());

      const sessions = listSessions();
      expect(sessions[0].lastMessage!.length).toBeLessThanOrEqual(100);
      expect(sessions[0].lastMessage!.endsWith("\u2026")).toBe(true);
    });
  });

  describe("renameSession", () => {
    it("should rename a session", () => {
      createSession("s1", "Old Name");
      const result = renameSession("s1", "New Name");
      expect(result).toBeDefined();
      expect(result!.name).toBe("New Name");
    });

    it("should return undefined for non-existent session", () => {
      expect(renameSession("nonexistent", "Name")).toBeUndefined();
    });
  });

  describe("deleteSession", () => {
    it("should delete a session and its messages", () => {
      createSession("s1", "Session 1");
      addMessage("s1", "user", "Hello", Date.now());

      expect(deleteSession("s1")).toBe(true);
      expect(getSessionById("s1")).toBeUndefined();
      expect(getMessages("s1")).toEqual([]);
    });

    it("should return false for non-existent session", () => {
      expect(deleteSession("nonexistent")).toBe(false);
    });
  });

  describe("forkSession", () => {
    it("should create a fork with copied messages", () => {
      createSession("s1", "Original");
      addMessage("s1", "user", "Hello", 1000);
      addMessage("s1", "assistant", "Hi!", 2000);

      const forked = forkSession("s1", "s2", "Original (fork)");
      expect(forked).toBeDefined();
      expect(forked!.id).toBe("s2");
      expect(forked!.name).toBe("Original (fork)");
      expect(forked!.forkedFrom).toBe("s1");

      // Fork should have the same messages
      const messages = getMessages("s2");
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe("Hello");
      expect(messages[1].content).toBe("Hi!");
    });

    it("should return undefined for non-existent source", () => {
      expect(forkSession("nonexistent", "s2", "Fork")).toBeUndefined();
    });

    it("should not affect original session messages", () => {
      createSession("s1", "Original");
      addMessage("s1", "user", "Hello", 1000);
      forkSession("s1", "s2", "Fork");

      // Add a message to the fork
      addMessage("s2", "user", "New message", 3000);

      // Original should still have only 1 message
      expect(getMessages("s1").length).toBe(1);
      expect(getMessages("s2").length).toBe(2);
    });
  });

  describe("messages", () => {
    it("should add and retrieve messages", () => {
      createSession("s1", "Session 1");
      addMessage("s1", "user", "Hello", 1000);
      addMessage("s1", "assistant", "Hi!", 2000);

      const messages = getMessages("s1");
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
      expect(messages[0].timestamp).toBe(1000);
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Hi!");
    });

    it("should return messages in chronological order", () => {
      createSession("s1", "Session 1");
      addMessage("s1", "assistant", "Second", 2000);
      addMessage("s1", "user", "First", 1000);

      const messages = getMessages("s1");
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
    });

    it("should return empty array for session with no messages", () => {
      createSession("s1", "Session 1");
      expect(getMessages("s1")).toEqual([]);
    });

    it("should have updated_at set when adding messages", () => {
      createSession("s1", "Session 1");
      addMessage("s1", "user", "Hello", Date.now());

      const session = getSessionById("s1");
      expect(session!.updatedAt).toBeDefined();
      // updated_at should be a valid date string
      expect(new Date(session!.updatedAt).getTime()).not.toBeNaN();
    });
  });
});
