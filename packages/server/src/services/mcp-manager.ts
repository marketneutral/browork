/**
 * MCP Manager — Manages MCP server configurations.
 *
 * Stores server configs in SQLite and writes them to .pi/mcp.json
 * in each user's working directory so pi-mcp-adapter can discover them.
 *
 * MCP servers are global (shared across all users) — the admin configures
 * them once and they're available to all Pi sessions.
 */

import { getDb } from "../db/database.js";
import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";

// ── Types ──

export interface McpServerRow {
  name: string;
  command: string;
  args: string; // JSON array
  env: string; // JSON object
  enabled: number;
  created_at: string;
}

export interface McpServerMeta {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

export interface McpServerInput {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ── CRUD ──

export function addMcpServer(input: McpServerInput): McpServerMeta {
  const db = getDb();
  const now = new Date().toISOString();
  const argsJson = JSON.stringify(input.args ?? []);
  const envJson = JSON.stringify(input.env ?? {});

  db.prepare(
    "INSERT INTO mcp_servers (name, command, args, env, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  ).run(input.name, input.command, argsJson, envJson, now);

  return {
    name: input.name,
    command: input.command,
    args: input.args ?? [],
    env: input.env ?? {},
    enabled: true,
    createdAt: now,
  };
}

export function listMcpServers(): McpServerMeta[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM mcp_servers ORDER BY created_at")
    .all() as McpServerRow[];

  return rows.map(rowToMeta);
}

export function getMcpServer(name: string): McpServerMeta | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM mcp_servers WHERE name = ?")
    .get(name) as McpServerRow | undefined;

  if (!row) return undefined;
  return rowToMeta(row);
}

export function updateMcpServer(
  name: string,
  updates: Partial<Pick<McpServerInput, "command" | "args" | "env">> & { enabled?: boolean },
): McpServerMeta | undefined {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM mcp_servers WHERE name = ?")
    .get(name) as McpServerRow | undefined;

  if (!existing) return undefined;

  const command = updates.command ?? existing.command;
  const args = updates.args ? JSON.stringify(updates.args) : existing.args;
  const env = updates.env ? JSON.stringify(updates.env) : existing.env;
  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;

  db.prepare(
    "UPDATE mcp_servers SET command = ?, args = ?, env = ?, enabled = ? WHERE name = ?",
  ).run(command, args, env, enabled, name);

  return getMcpServer(name);
}

export function deleteMcpServer(name: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM mcp_servers WHERE name = ?").run(name);
  return result.changes > 0;
}

// ── Config file sync ──

/**
 * Write enabled MCP servers to .pi/mcp.json in the given working directory.
 * Called when a Pi session starts or when MCP config changes.
 */
export function writeMcpConfig(workDir: string): void {
  const servers = listMcpServers().filter((s) => s.enabled);

  const config: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
  for (const s of servers) {
    const entry: { command: string; args: string[]; env?: Record<string, string> } = {
      command: s.command,
      args: s.args,
    };
    if (Object.keys(s.env).length > 0) {
      entry.env = s.env;
    }
    config[s.name] = entry;
  }

  const piDir = resolve(workDir, ".pi");
  mkdirSync(piDir, { recursive: true });
  writeFileSync(
    resolve(piDir, "mcp.json"),
    JSON.stringify({ servers: config }, null, 2),
    "utf-8",
  );
}

/**
 * Read the current .pi/mcp.json from a working directory (for diagnostics).
 */
export function readMcpConfig(workDir: string): Record<string, unknown> | null {
  const configPath = resolve(workDir, ".pi", "mcp.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

// ── Helpers ──

function rowToMeta(row: McpServerRow): McpServerMeta {
  return {
    name: row.name,
    command: row.command,
    args: JSON.parse(row.args),
    env: JSON.parse(row.env),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}
