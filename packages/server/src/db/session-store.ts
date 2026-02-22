/**
 * Session Store — SQLite-backed session CRUD and message persistence.
 */

import { getDb } from "./database.js";

export interface SessionRow {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  forked_from: string | null;
  workspace_dir: string | null;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  forkedFrom: string | null;
  workspaceDir: string;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ── Sessions ──

export function createSession(id: string, name: string, userId?: string): SessionMeta {
  const db = getDb();
  const now = new Date().toISOString();
  const workspaceDir = `${id}/workspace`;

  db.prepare(
    "INSERT INTO sessions (id, user_id, name, created_at, updated_at, workspace_dir) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, userId ?? null, name, now, now, workspaceDir);

  return { id, name, createdAt: now, updatedAt: now, lastMessage: null, forkedFrom: null, workspaceDir };
}

export function getSessionById(id: string, userId?: string): SessionMeta | undefined {
  const db = getDb();

  const row = userId
    ? (db.prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?").get(id, userId) as SessionRow | undefined)
    : (db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined);

  if (!row) return undefined;

  const lastMsg = db
    .prepare(
      "SELECT content FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1",
    )
    .get(id) as { content: string } | undefined;

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessage: lastMsg ? truncate(lastMsg.content, 100) : null,
    forkedFrom: row.forked_from,
    workspaceDir: row.workspace_dir ?? `${row.id}/workspace`,
  };
}

export function listSessions(userId?: string): SessionMeta[] {
  const db = getDb();

  const rows = userId
    ? (db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as SessionRow[])
    : (db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as SessionRow[]);

  // Batch-fetch last messages for all sessions
  const lastMessages = new Map<string, string>();
  const msgRows = db
    .prepare(`
      SELECT m.session_id, m.content
      FROM messages m
      INNER JOIN (
        SELECT session_id, MAX(timestamp) as max_ts
        FROM messages
        GROUP BY session_id
      ) latest ON m.session_id = latest.session_id AND m.timestamp = latest.max_ts
    `)
    .all() as { session_id: string; content: string }[];

  for (const r of msgRows) {
    lastMessages.set(r.session_id, truncate(r.content, 100));
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessage: lastMessages.get(row.id) ?? null,
    forkedFrom: row.forked_from,
    workspaceDir: row.workspace_dir ?? `${row.id}/workspace`,
  }));
}

export function renameSession(
  id: string,
  name: string,
  userId?: string,
): SessionMeta | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  const result = userId
    ? db.prepare("UPDATE sessions SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(name, now, id, userId)
    : db.prepare("UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?").run(name, now, id);

  if (result.changes === 0) return undefined;
  return getSessionById(id);
}

export function deleteSession(id: string, userId?: string): boolean {
  const db = getDb();
  // Messages cascade-delete via foreign key
  const result = userId
    ? db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(id, userId)
    : db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return result.changes > 0;
}

export function forkSession(
  sourceId: string,
  newId: string,
  newName: string,
  userId?: string,
): SessionMeta | undefined {
  const db = getDb();

  // Verify source exists (and belongs to user if userId provided)
  const source = userId
    ? (db.prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?").get(sourceId, userId) as { id: string } | undefined)
    : (db.prepare("SELECT id FROM sessions WHERE id = ?").get(sourceId) as { id: string } | undefined);

  if (!source) return undefined;

  const now = new Date().toISOString();
  const workspaceDir = `${newId}/workspace`;

  // Create forked session
  db.prepare(
    "INSERT INTO sessions (id, user_id, name, created_at, updated_at, forked_from, workspace_dir) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(newId, userId ?? null, newName, now, now, sourceId, workspaceDir);

  // Copy all messages from source to fork
  db.prepare(`
    INSERT INTO messages (session_id, role, content, timestamp)
    SELECT ?, role, content, timestamp
    FROM messages
    WHERE session_id = ?
    ORDER BY timestamp
  `).run(newId, sourceId);

  return getSessionById(newId);
}

export function getSessionWorkspaceDir(sessionId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT workspace_dir FROM sessions WHERE id = ?").get(sessionId) as
    { workspace_dir: string | null } | undefined;
  if (!row) return null;
  return row.workspace_dir ?? `${sessionId}/workspace`;
}

// ── Messages ──

export function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  timestamp: number,
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
  ).run(sessionId, role, content, timestamp);

  // Touch session updated_at (use JS ISO string for millisecond precision)
  db.prepare(
    "UPDATE sessions SET updated_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), sessionId);
}

export function getMessages(
  sessionId: string,
): { id: number; role: "user" | "assistant"; content: string; timestamp: number }[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp",
    )
    .all(sessionId) as MessageRow[];
}

// ── Helpers ──

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}
