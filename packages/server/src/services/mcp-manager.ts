/**
 * MCP Manager — CRUD for remote MCP server configurations.
 *
 * Stores server configs in SQLite. Servers are global (shared across all users).
 * The MCP client manager (mcp-client.ts) handles actual connections.
 */

import { getDb } from "../db/database.js";

// ── Types ──

export interface McpServerRow {
  name: string;
  url: string;
  transport: string;
  headers: string; // JSON object
  enabled: number;
  created_at: string;
}

export interface McpServerMeta {
  name: string;
  url: string;
  transport: "sse" | "streamable-http";
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

export interface McpServerInput {
  name: string;
  url: string;
  transport?: "sse" | "streamable-http";
  headers?: Record<string, string>;
}

// ── CRUD ──

export function addMcpServer(input: McpServerInput): McpServerMeta {
  const db = getDb();
  const now = new Date().toISOString();
  const transport = input.transport ?? "sse";
  const headersJson = JSON.stringify(input.headers ?? {});

  db.prepare(
    "INSERT INTO mcp_servers (name, url, transport, headers, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  ).run(input.name, input.url, transport, headersJson, now);

  return {
    name: input.name,
    url: input.url,
    transport,
    headers: input.headers ?? {},
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
  updates: Partial<Pick<McpServerInput, "url" | "transport" | "headers">> & { enabled?: boolean },
): McpServerMeta | undefined {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM mcp_servers WHERE name = ?")
    .get(name) as McpServerRow | undefined;

  if (!existing) return undefined;

  const url = updates.url ?? existing.url;
  const transport = updates.transport ?? existing.transport;
  const headers = updates.headers ? JSON.stringify(updates.headers) : existing.headers;
  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;

  db.prepare(
    "UPDATE mcp_servers SET url = ?, transport = ?, headers = ?, enabled = ? WHERE name = ?",
  ).run(url, transport, headers, enabled, name);

  return getMcpServer(name);
}

export function deleteMcpServer(name: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM mcp_servers WHERE name = ?").run(name);
  return result.changes > 0;
}

// ── Helpers ──

function rowToMeta(row: McpServerRow): McpServerMeta {
  return {
    name: row.name,
    url: row.url,
    transport: row.transport as "sse" | "streamable-http",
    headers: JSON.parse(row.headers),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}
