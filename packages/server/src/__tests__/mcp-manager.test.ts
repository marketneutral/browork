import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { mkdirSync, rmSync } from "fs";
import { initDatabase, closeDatabase } from "../db/database.js";
import {
  addMcpServer,
  listMcpServers,
  getMcpServer,
  updateMcpServer,
  deleteMcpServer,
} from "../services/mcp-manager.js";

const TEST_DIR = resolve(import.meta.dirname, "../../.test-data-mcp");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  initDatabase(resolve(TEST_DIR, "test.db"));
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("mcp-manager", () => {
  describe("addMcpServer", () => {
    it("should add a server with name and url", () => {
      const server = addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      expect(server.name).toBe("my-tools");
      expect(server.url).toBe("http://localhost:3002/sse");
      expect(server.transport).toBe("sse");
      expect(server.headers).toEqual({});
      expect(server.enabled).toBe(true);
      expect(server.createdAt).toBeDefined();
    });

    it("should add a server with streamable-http transport", () => {
      const server = addMcpServer({
        name: "http-tools",
        url: "http://localhost:3002/mcp",
        transport: "streamable-http",
      });
      expect(server.transport).toBe("streamable-http");
    });

    it("should add a server with custom headers", () => {
      const server = addMcpServer({
        name: "authed-tools",
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer sk-test", "X-Custom": "value" },
      });
      expect(server.headers).toEqual({
        Authorization: "Bearer sk-test",
        "X-Custom": "value",
      });
    });

    it("should reject duplicate names", () => {
      addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      expect(() =>
        addMcpServer({ name: "my-tools", url: "http://localhost:3003/sse" }),
      ).toThrow();
    });
  });

  describe("listMcpServers", () => {
    it("should return empty array when no servers", () => {
      expect(listMcpServers()).toEqual([]);
    });

    it("should return all servers", () => {
      addMcpServer({ name: "tools-a", url: "http://localhost:3002/sse" });
      addMcpServer({ name: "tools-b", url: "http://localhost:3003/sse" });
      const servers = listMcpServers();
      expect(servers.length).toBe(2);
      expect(servers[0].name).toBe("tools-a");
      expect(servers[1].name).toBe("tools-b");
    });
  });

  describe("getMcpServer", () => {
    it("should return a server by name", () => {
      addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      const server = getMcpServer("my-tools");
      expect(server).toBeDefined();
      expect(server!.name).toBe("my-tools");
      expect(server!.url).toBe("http://localhost:3002/sse");
    });

    it("should return undefined for non-existent server", () => {
      expect(getMcpServer("nonexistent")).toBeUndefined();
    });
  });

  describe("updateMcpServer", () => {
    it("should update the url", () => {
      addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      const updated = updateMcpServer("my-tools", { url: "http://localhost:4000/sse" });
      expect(updated).toBeDefined();
      expect(updated!.url).toBe("http://localhost:4000/sse");
    });

    it("should toggle enabled", () => {
      addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      const disabled = updateMcpServer("my-tools", { enabled: false });
      expect(disabled!.enabled).toBe(false);

      const enabled = updateMcpServer("my-tools", { enabled: true });
      expect(enabled!.enabled).toBe(true);
    });

    it("should update transport and headers", () => {
      addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      const updated = updateMcpServer("my-tools", {
        transport: "streamable-http",
        headers: { "X-Key": "val" },
      });
      expect(updated!.transport).toBe("streamable-http");
      expect(updated!.headers).toEqual({ "X-Key": "val" });
    });

    it("should return undefined for non-existent server", () => {
      expect(updateMcpServer("nonexistent", { enabled: false })).toBeUndefined();
    });
  });

  describe("deleteMcpServer", () => {
    it("should delete a server", () => {
      addMcpServer({ name: "my-tools", url: "http://localhost:3002/sse" });
      expect(deleteMcpServer("my-tools")).toBe(true);
      expect(getMcpServer("my-tools")).toBeUndefined();
    });

    it("should return false for non-existent server", () => {
      expect(deleteMcpServer("nonexistent")).toBe(false);
    });
  });
});
