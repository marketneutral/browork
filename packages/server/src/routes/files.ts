import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  readdir,
  stat,
  readFile,
  writeFile,
  unlink,
  mkdir,
} from "fs/promises";
import { resolve, relative, extname, dirname } from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { parseCSVLine } from "../utils/csv.js";
import { safePath } from "../utils/safe-path.js";
import { getSessionById } from "../db/session-store.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

/** Resolve the session-scoped working directory */
function workDir(req: FastifyRequest): { dir: string } | { error: string; code: number } {
  const sessionId = (req.query as Record<string, string>).sessionId;
  if (!sessionId) {
    return { error: "sessionId query parameter is required", code: 400 };
  }
  const userId = req.user?.id;
  const session = getSessionById(sessionId, userId);
  if (!session) {
    return { error: "Session not found", code: 404 };
  }
  return { dir: resolve(DATA_ROOT, "workspaces", session.workspaceDir) };
}

/** File entry returned by the tree endpoint */
interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "file" | "directory";
}

/**
 * Recursively list directory contents as a flat array.
 */
async function listTree(dir: string, base: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  let items: string[];
  try {
    items = await readdir(dir);
  } catch {
    return entries;
  }

  for (const name of items) {
    if (name.startsWith(".")) continue; // skip hidden files
    const full = resolve(dir, name);
    try {
      const s = await stat(full);
      const relPath = relative(base, full);
      entries.push({
        name,
        path: relPath,
        size: s.size,
        modified: s.mtime.toISOString(),
        type: s.isDirectory() ? "directory" : "file",
      });
      if (s.isDirectory()) {
        entries.push(...(await listTree(full, base)));
      }
    } catch {
      // skip inaccessible files
    }
  }
  return entries;
}

function safeWorkPath(userPath: string, baseDir: string): string | null {
  return safePath(userPath, baseDir);
}

function mimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".csv": "text/csv",
    ".json": "application/json",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".ts": "text/typescript",
    ".js": "application/javascript",
    ".py": "text/x-python",
    ".html": "text/html",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
  };
  return types[ext] || "application/octet-stream";
}

export const fileRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/files — list file tree
  app.get("/files", async (req, reply) => {
    const result = workDir(req);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    const wd = result.dir;
    await mkdir(wd, { recursive: true });
    return listTree(wd, wd);
  });

  // POST /api/files/upload — multipart file upload
  app.post("/files/upload", async (req, reply) => {
    const result = workDir(req);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    const wd = result.dir;
    await mkdir(wd, { recursive: true });
    const parts = req.parts();
    const uploaded: string[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        const targetDir = (part.fields.path as any)?.value || "";
        const dir = safeWorkPath(targetDir, wd);
        if (!dir) {
          return reply.code(400).send({ error: "Invalid path" });
        }
        await mkdir(dir, { recursive: true });

        const dest = resolve(dir, part.filename);
        if (!dest.startsWith(wd)) {
          return reply.code(400).send({ error: "Invalid filename" });
        }

        await pipeline(part.file, createWriteStream(dest));
        uploaded.push(relative(wd, dest));
      }
    }

    return { uploaded };
  });

  // GET /api/files/* — download file
  app.get("/files/*", async (req, reply) => {
    const result = workDir(req);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    const wd = result.dir;
    const filePath = (req.params as { "*": string })["*"];

    if (filePath.endsWith("/preview")) {
      return;
    }

    const resolved = safeWorkPath(filePath, wd);
    if (!resolved) {
      return reply.code(400).send({ error: "Invalid path" });
    }

    try {
      const s = await stat(resolved);
      if (s.isDirectory()) {
        return reply.code(400).send({ error: "Path is a directory" });
      }
      const content = await readFile(resolved);
      reply.type(mimeType(resolved));
      return reply.send(content);
    } catch {
      return reply.code(404).send({ error: "File not found" });
    }
  });

  // PUT /api/files/* — save file content (from editor)
  app.put("/files/*", async (req, reply) => {
    const result = workDir(req);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    const wd = result.dir;
    const filePath = (req.params as { "*": string })["*"];
    const resolved = safeWorkPath(filePath, wd);
    if (!resolved) {
      return reply.code(400).send({ error: "Invalid path" });
    }

    const body = req.body as { content: string; lastModified?: string };
    if (typeof body.content !== "string") {
      return reply.code(400).send({ error: "Missing content" });
    }

    if (body.lastModified) {
      try {
        const s = await stat(resolved);
        const serverMtime = s.mtime.toISOString();
        if (serverMtime !== body.lastModified) {
          return reply.code(409).send({
            error: "File was modified externally",
            serverModified: serverMtime,
          });
        }
      } catch {
        // File doesn't exist yet
      }
    }

    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, body.content, "utf-8");
    const s = await stat(resolved);

    return { ok: true, modified: s.mtime.toISOString() };
  });

  // DELETE /api/files/* — delete file
  app.delete("/files/*", async (req, reply) => {
    const result = workDir(req);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    const wd = result.dir;
    const filePath = (req.params as { "*": string })["*"];
    const resolved = safeWorkPath(filePath, wd);
    if (!resolved) {
      return reply.code(400).send({ error: "Invalid path" });
    }

    try {
      await unlink(resolved);
      return { ok: true };
    } catch {
      return reply.code(404).send({ error: "File not found" });
    }
  });

  // GET /api/files-preview/* — preview data (CSV→JSON rows, text snippet)
  app.get("/files-preview/*", async (req, reply) => {
    const result = workDir(req);
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    const wd = result.dir;
    const filePath = (req.params as { "*": string })["*"];
    const resolved = safeWorkPath(filePath, wd);
    if (!resolved) {
      return reply.code(400).send({ error: "Invalid path" });
    }

    const ext = extname(resolved).toLowerCase();

    try {
      if (ext === ".csv") {
        const raw = await readFile(resolved, "utf-8");
        const lines = raw.split("\n").filter((l) => l.trim());
        const headers = parseCSVLine(lines[0] || "");
        const rows = lines.slice(1, 101).map((line) => {
          const values = parseCSVLine(line);
          const row: Record<string, string> = {};
          headers.forEach((h, i) => (row[h] = values[i] || ""));
          return row;
        });
        return { type: "csv", headers, rows, totalRows: lines.length - 1 };
      }

      if ([".json", ".txt", ".md", ".yaml", ".yml", ".ts", ".js", ".py", ".html", ".css"].includes(ext)) {
        const content = await readFile(resolved, "utf-8");
        return { type: "text", content: content.slice(0, 100_000) };
      }

      if ([".png", ".jpg", ".jpeg", ".gif", ".svg"].includes(ext)) {
        const sessionId = (req.query as Record<string, string>).sessionId;
        return { type: "image", url: `/api/files/${filePath}?sessionId=${sessionId}` };
      }

      if (ext === ".pdf") {
        const sessionId = (req.query as Record<string, string>).sessionId;
        return { type: "pdf", url: `/api/files/${filePath}?sessionId=${sessionId}` };
      }

      return { type: "binary", message: "Preview not available for this file type" };
    } catch {
      return reply.code(404).send({ error: "File not found" });
    }
  });
};

