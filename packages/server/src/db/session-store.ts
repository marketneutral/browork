/**
 * Session Store — SQLite-backed session CRUD and message persistence.
 */

import { getDb } from "./database.js";

export interface SessionRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  forked_from: string | null;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  forkedFrom: string | null;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ── Sessions ──

export function createSession(id: string, name: string): SessionMeta {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO sessions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
  ).run(id, name, now, now);

  return { id, name, createdAt: now, updatedAt: now, lastMessage: null, forkedFrom: null };
}

export function getSessionById(id: string): SessionMeta | undefined {
  const db = getDb();

  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;

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
  };
}

export function listSessions(): SessionMeta[] {
  const db = getDb();

  const rows = db
    .prepare("SELECT * FROM sessions ORDER BY updated_at DESC")
    .all() as SessionRow[];

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
  }));
}

export function renameSession(
  id: string,
  name: string,
): SessionMeta | undefined {
  const db = getDb();
  const result = db
    .prepare("UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, id);

  if (result.changes === 0) return undefined;
  return getSessionById(id);
}

export function deleteSession(id: string): boolean {
  const db = getDb();
  // Messages cascade-delete via foreign key
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return result.changes > 0;
}

export function forkSession(
  sourceId: string,
  newId: string,
  newName: string,
): SessionMeta | undefined {
  const db = getDb();

  // Verify source exists
  const source = db
    .prepare("SELECT id FROM sessions WHERE id = ?")
    .get(sourceId) as { id: string } | undefined;

  if (!source) return undefined;

  const now = new Date().toISOString();

  // Create forked session
  db.prepare(
    "INSERT INTO sessions (id, name, created_at, updated_at, forked_from) VALUES (?, ?, ?, ?, ?)",
  ).run(newId, newName, now, now, sourceId);

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

  // Touch session updated_at
  db.prepare(
    "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?",
  ).run(sessionId);
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
