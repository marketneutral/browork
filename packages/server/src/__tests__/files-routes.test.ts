import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

// Set DATA_ROOT to a temp directory before importing the routes
const TEST_DIR = resolve(tmpdir(), `browork-test-${randomBytes(4).toString("hex")}`);
process.env.DATA_ROOT = TEST_DIR;

// Dynamic import so env var is set first
const { fileRoutes } = await import("../routes/files.js");
const { initDatabase, closeDatabase } = await import("../db/database.js");
const { createSession } = await import("../db/session-store.js");

const TEST_SESSION_ID = "test-session-1";
const WORK_DIR = resolve(TEST_DIR, "workspaces", TEST_SESSION_ID, "workspace");

const q = `?sessionId=${TEST_SESSION_ID}`;

let app: FastifyInstance;

beforeAll(async () => {
  initDatabase(resolve(TEST_DIR, "test.db"));
  createSession(TEST_SESSION_ID, "Test Session");

  app = Fastify();
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(fileRoutes, { prefix: "/api" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  // Clean workspace before each test
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
});

describe("GET /api/files", () => {
  it("returns 400 without sessionId", async () => {
    const res = await app.inject({ method: "GET", url: "/api/files" });
    expect(res.statusCode).toBe(400);
  });

  it("returns empty array for empty workspace", async () => {
    const res = await app.inject({ method: "GET", url: `/api/files${q}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("lists files in the workspace", async () => {
    writeFileSync(join(WORK_DIR, "test.txt"), "hello");
    const res = await app.inject({ method: "GET", url: `/api/files${q}` });
    expect(res.statusCode).toBe(200);
    const files = res.json();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("test.txt");
    expect(files[0].type).toBe("file");
  });

  it("lists nested directories", async () => {
    mkdirSync(join(WORK_DIR, "subdir"), { recursive: true });
    writeFileSync(join(WORK_DIR, "subdir", "nested.csv"), "a,b");
    const res = await app.inject({ method: "GET", url: `/api/files${q}` });
    const files = res.json();
    expect(files.length).toBe(2);
    expect(files.find((f: any) => f.name === "subdir").type).toBe("directory");
    expect(files.find((f: any) => f.name === "nested.csv").path).toBe(
      "subdir/nested.csv",
    );
  });

  it("skips hidden files", async () => {
    writeFileSync(join(WORK_DIR, ".hidden"), "secret");
    writeFileSync(join(WORK_DIR, "visible.txt"), "public");
    const res = await app.inject({ method: "GET", url: `/api/files${q}` });
    const files = res.json();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("visible.txt");
  });
});

describe("PUT /api/files/*", () => {
  it("creates a new file", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/files/new.txt${q}`,
      payload: { content: "hello world" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(readFileSync(join(WORK_DIR, "new.txt"), "utf-8")).toBe("hello world");
  });

  it("creates parent directories if needed", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/files/deep/nested/file.txt${q}`,
      payload: { content: "deep content" },
    });
    expect(res.statusCode).toBe(200);
    expect(
      readFileSync(join(WORK_DIR, "deep/nested/file.txt"), "utf-8"),
    ).toBe("deep content");
  });

  it("returns 400 for missing content", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/files/bad.txt${q}`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("detects conflicts via lastModified", async () => {
    // Create file
    writeFileSync(join(WORK_DIR, "conflict.txt"), "original");

    // Save with a stale timestamp
    const res = await app.inject({
      method: "PUT",
      url: `/api/files/conflict.txt${q}`,
      payload: { content: "updated", lastModified: "1970-01-01T00:00:00.000Z" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("modified externally");
  });

  it("succeeds with matching lastModified", async () => {
    writeFileSync(join(WORK_DIR, "sync.txt"), "v1");
    // Get the actual mtime
    const listRes = await app.inject({ method: "GET", url: `/api/files${q}` });
    const mtime = listRes.json().find((f: any) => f.name === "sync.txt").modified;

    const res = await app.inject({
      method: "PUT",
      url: `/api/files/sync.txt${q}`,
      payload: { content: "v2", lastModified: mtime },
    });
    expect(res.statusCode).toBe(200);
    expect(readFileSync(join(WORK_DIR, "sync.txt"), "utf-8")).toBe("v2");
  });

  it("blocks path traversal on save", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/files/../../etc/passwd${q}`,
      payload: { content: "hacked" },
    });
    // Fastify normalizes ../ in URLs, so this either returns 400 (our check)
    // or 404 (normalized path doesn't exist). Either way, the file is not written.
    expect([400, 404]).toContain(res.statusCode);
  });
});

describe("GET /api/files/* (download)", () => {
  it("downloads a file", async () => {
    writeFileSync(join(WORK_DIR, "download.txt"), "file content");
    const res = await app.inject({
      method: "GET",
      url: `/api/files/download.txt${q}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("file content");
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  it("returns 404 for missing file", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/files/nonexistent.txt${q}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("blocks path traversal on download", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/files/../../../etc/passwd${q}`,
    });
    expect([400, 404]).toContain(res.statusCode);
  });
});

describe("DELETE /api/files/*", () => {
  it("deletes a file", async () => {
    writeFileSync(join(WORK_DIR, "deleteme.txt"), "bye");
    const res = await app.inject({
      method: "DELETE",
      url: `/api/files/deleteme.txt${q}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    // Verify it's gone
    const listRes = await app.inject({ method: "GET", url: `/api/files${q}` });
    expect(listRes.json()).toEqual([]);
  });

  it("returns 404 for missing file", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/files/ghost.txt${q}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("blocks path traversal on delete", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/files/../../etc/important${q}`,
    });
    expect([400, 404]).toContain(res.statusCode);
  });
});

describe("GET /api/files-preview/*", () => {
  it("previews a CSV file as parsed JSON", async () => {
    writeFileSync(join(WORK_DIR, "data.csv"), "name,age\nAlice,30\nBob,25");
    const res = await app.inject({
      method: "GET",
      url: `/api/files-preview/data.csv${q}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe("csv");
    expect(body.headers).toEqual(["name", "age"]);
    expect(body.rows).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
    expect(body.totalRows).toBe(2);
  });

  it("previews a text file", async () => {
    writeFileSync(join(WORK_DIR, "readme.md"), "# Hello\nWorld");
    const res = await app.inject({
      method: "GET",
      url: `/api/files-preview/readme.md${q}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe("text");
    expect(body.content).toBe("# Hello\nWorld");
  });

  it("previews an image file with URL containing sessionId", async () => {
    writeFileSync(join(WORK_DIR, "pic.png"), "fake-png-data");
    const res = await app.inject({
      method: "GET",
      url: `/api/files-preview/pic.png${q}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe("image");
    expect(body.url).toBe(`/api/files/pic.png?sessionId=${TEST_SESSION_ID}`);
  });

  it("returns binary type for unknown extensions", async () => {
    writeFileSync(join(WORK_DIR, "data.bin"), "binary stuff");
    const res = await app.inject({
      method: "GET",
      url: `/api/files-preview/data.bin${q}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().type).toBe("binary");
  });

  it("returns 404 for missing file", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/files-preview/missing.csv${q}`,
    });
    expect(res.statusCode).toBe(404);
  });
});
