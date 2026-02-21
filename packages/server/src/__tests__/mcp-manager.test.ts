import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { mkdirSync, rmSync, readFileSync, existsSync } from "fs";
import { initDatabase, closeDatabase } from "../db/database.js";
import {
  addMcpServer,
  listMcpServers,
  getMcpServer,
  updateMcpServer,
  deleteMcpServer,
  writeMcpConfig,
  readMcpConfig,
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
    it("should add a server with name and command", () => {
      const server = addMcpServer({ name: "postgres", command: "npx" });
      expect(server.name).toBe("postgres");
      expect(server.command).toBe("npx");
      expect(server.args).toEqual([]);
      expect(server.env).toEqual({});
      expect(server.enabled).toBe(true);
      expect(server.createdAt).toBeDefined();
    });

    it("should add a server with args and env", () => {
      const server = addMcpServer({
        name: "postgres",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: { DATABASE_URL: "postgresql://localhost/mydb" },
      });
      expect(server.args).toEqual(["-y", "@modelcontextprotocol/server-postgres"]);
      expect(server.env).toEqual({ DATABASE_URL: "postgresql://localhost/mydb" });
    });

    it("should reject duplicate names", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      expect(() => addMcpServer({ name: "postgres", command: "node" })).toThrow();
    });
  });

  describe("listMcpServers", () => {
    it("should return empty array when no servers", () => {
      expect(listMcpServers()).toEqual([]);
    });

    it("should return all servers", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      addMcpServer({ name: "filesystem", command: "npx" });
      const servers = listMcpServers();
      expect(servers.length).toBe(2);
      expect(servers[0].name).toBe("postgres");
      expect(servers[1].name).toBe("filesystem");
    });
  });

  describe("getMcpServer", () => {
    it("should return a server by name", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      const server = getMcpServer("postgres");
      expect(server).toBeDefined();
      expect(server!.name).toBe("postgres");
    });

    it("should return undefined for non-existent server", () => {
      expect(getMcpServer("nonexistent")).toBeUndefined();
    });
  });

  describe("updateMcpServer", () => {
    it("should update the command", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      const updated = updateMcpServer("postgres", { command: "node" });
      expect(updated).toBeDefined();
      expect(updated!.command).toBe("node");
    });

    it("should toggle enabled", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      const disabled = updateMcpServer("postgres", { enabled: false });
      expect(disabled!.enabled).toBe(false);

      const enabled = updateMcpServer("postgres", { enabled: true });
      expect(enabled!.enabled).toBe(true);
    });

    it("should update args and env", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      const updated = updateMcpServer("postgres", {
        args: ["-y", "server-pg"],
        env: { DB: "test" },
      });
      expect(updated!.args).toEqual(["-y", "server-pg"]);
      expect(updated!.env).toEqual({ DB: "test" });
    });

    it("should return undefined for non-existent server", () => {
      expect(updateMcpServer("nonexistent", { enabled: false })).toBeUndefined();
    });
  });

  describe("deleteMcpServer", () => {
    it("should delete a server", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      expect(deleteMcpServer("postgres")).toBe(true);
      expect(getMcpServer("postgres")).toBeUndefined();
    });

    it("should return false for non-existent server", () => {
      expect(deleteMcpServer("nonexistent")).toBe(false);
    });
  });

  describe("writeMcpConfig", () => {
    it("should write .pi/mcp.json with enabled servers", () => {
      addMcpServer({
        name: "postgres",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: { DATABASE_URL: "postgresql://localhost/test" },
      });
      addMcpServer({ name: "filesystem", command: "npx", args: ["-y", "server-fs"] });

      const workDir = resolve(TEST_DIR, "workspace");
      mkdirSync(workDir, { recursive: true });
      writeMcpConfig(workDir);

      const configPath = resolve(workDir, ".pi", "mcp.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.servers.postgres).toBeDefined();
      expect(config.servers.postgres.command).toBe("npx");
      expect(config.servers.postgres.args).toEqual(["-y", "@modelcontextprotocol/server-postgres"]);
      expect(config.servers.postgres.env).toEqual({ DATABASE_URL: "postgresql://localhost/test" });
      expect(config.servers.filesystem).toBeDefined();
    });

    it("should exclude disabled servers from config", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      addMcpServer({ name: "disabled-one", command: "npx" });
      updateMcpServer("disabled-one", { enabled: false });

      const workDir = resolve(TEST_DIR, "workspace2");
      mkdirSync(workDir, { recursive: true });
      writeMcpConfig(workDir);

      const config = JSON.parse(
        readFileSync(resolve(workDir, ".pi", "mcp.json"), "utf-8"),
      );
      expect(config.servers.postgres).toBeDefined();
      expect(config.servers["disabled-one"]).toBeUndefined();
    });

    it("should write empty servers object when none enabled", () => {
      const workDir = resolve(TEST_DIR, "workspace3");
      mkdirSync(workDir, { recursive: true });
      writeMcpConfig(workDir);

      const config = JSON.parse(
        readFileSync(resolve(workDir, ".pi", "mcp.json"), "utf-8"),
      );
      expect(config.servers).toEqual({});
    });

    it("should omit env when empty", () => {
      addMcpServer({ name: "postgres", command: "npx", args: ["-y", "pg"] });
      const workDir = resolve(TEST_DIR, "workspace4");
      mkdirSync(workDir, { recursive: true });
      writeMcpConfig(workDir);

      const config = JSON.parse(
        readFileSync(resolve(workDir, ".pi", "mcp.json"), "utf-8"),
      );
      expect(config.servers.postgres.env).toBeUndefined();
    });
  });

  describe("readMcpConfig", () => {
    it("should return null when no config exists", () => {
      const workDir = resolve(TEST_DIR, "no-config");
      mkdirSync(workDir, { recursive: true });
      expect(readMcpConfig(workDir)).toBeNull();
    });

    it("should read a previously written config", () => {
      addMcpServer({ name: "postgres", command: "npx" });
      const workDir = resolve(TEST_DIR, "workspace5");
      mkdirSync(workDir, { recursive: true });
      writeMcpConfig(workDir);

      const config = readMcpConfig(workDir);
      expect(config).toBeDefined();
      expect((config as any).servers.postgres).toBeDefined();
    });
  });
});
