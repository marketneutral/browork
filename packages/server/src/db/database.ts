/**
 * SQLite Database Layer
 *
 * Manages the SQLite database for persistent session metadata and
 * chat message history. Uses better-sqlite3 for synchronous access.
 */

import Database from "better-sqlite3";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

let db: Database.Database;

/**
 * Initialize the database connection and create tables.
 * Called once at server startup.
 */
export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? resolve(DATA_ROOT, "browork.db");

  // Ensure parent directory exists
  mkdirSync(resolve(resolvedPath, ".."), { recursive: true });

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables();

  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      forked_from TEXT,
      FOREIGN KEY (forked_from) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages(session_id, timestamp);
  `);
}

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized — call initDatabase() first");
  return db;
}

/**
 * Close the database connection. Used in tests and shutdown.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
