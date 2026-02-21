/**
 * User Store — SQLite-backed user accounts and token-based authentication.
 *
 * Uses Node.js crypto.scrypt for password hashing (no extra dependencies).
 * Tokens are random 64-char hex strings stored in the tokens table.
 */

import { randomBytes, scryptSync } from "crypto";
import { getDb } from "./database.js";

// ── Types ──

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

export interface UserMeta {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

interface TokenRow {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

// Token validity: 30 days
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── Password hashing ──

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function generateSalt(): string {
  return randomBytes(32).toString("hex");
}

// ── Users ──

export function createUser(
  id: string,
  username: string,
  displayName: string,
  password: string,
): UserMeta {
  const db = getDb();
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO users (id, username, display_name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, username, displayName, passwordHash, salt, now);

  return { id, username, displayName, createdAt: now };
}

export function getUserById(id: string): UserMeta | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;

  if (!row) return undefined;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export function getUserByUsername(username: string): UserRow | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
}

export function authenticateUser(
  username: string,
  password: string,
): UserMeta | undefined {
  const row = getUserByUsername(username);
  if (!row) return undefined;

  const hash = hashPassword(password, row.salt);
  if (hash !== row.password_hash) return undefined;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export function listUsers(): UserMeta[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM users ORDER BY created_at")
    .all() as UserRow[];

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  }));
}

export function deleteUser(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Tokens ──

export function createToken(userId: string): string {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  db.prepare(
    "INSERT INTO tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, now.toISOString(), expiresAt.toISOString());

  return token;
}

export function validateToken(token: string): UserMeta | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM tokens WHERE token = ?")
    .get(token) as TokenRow | undefined;

  if (!row) return undefined;

  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    // Token expired — clean it up
    db.prepare("DELETE FROM tokens WHERE token = ?").run(token);
    return undefined;
  }

  return getUserById(row.user_id);
}

export function deleteToken(token: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM tokens WHERE token = ?").run(token);
  return result.changes > 0;
}

export function deleteUserTokens(userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM tokens WHERE user_id = ?").run(userId);
}
