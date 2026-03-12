/**
 * Token Usage Store — tracks LLM token consumption per user/session
 * and enforces weekly budget caps.
 */

import { getDb } from "./database.js";

export interface TokenUsageRecord {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costTotal: number;
}

export interface WeeklyUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export interface BudgetStatus {
  overBudget: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** Percent used (0-100+), null if unlimited */
  percent: number | null;
  /** ISO timestamp when the budget resets (next Sunday midnight UTC) */
  resetsAt: string;
}

/** Get the start of the current budget week (Sunday 00:00 UTC) as epoch ms. */
export function getWeekStartMs(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - day,
    0, 0, 0, 0,
  ));
  return start.getTime();
}

/** Get the next budget reset time (next Sunday 00:00 UTC) as ISO string. */
export function getNextResetIso(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilSunday,
    0, 0, 0, 0,
  ));
  return next.toISOString();
}

// ── Recording ──

export function recordTokenUsage(
  userId: string,
  sessionId: string,
  usage: TokenUsageRecord,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO token_usage (user_id, session_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost_total, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    sessionId,
    usage.input,
    usage.output,
    usage.cacheRead,
    usage.cacheWrite,
    usage.totalTokens,
    usage.costTotal,
    Date.now(),
  );
}

// ── Querying ──

export function getWeeklyUsage(userId: string, weekStartMs?: number): WeeklyUsage {
  const db = getDb();
  const start = weekStartMs ?? getWeekStartMs();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(cost_total), 0) as cost
    FROM token_usage
    WHERE user_id = ? AND timestamp >= ?
  `).get(userId, start) as WeeklyUsage;
  return row;
}

export function getSessionUsage(sessionId: string): WeeklyUsage {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(cost_total), 0) as cost
    FROM token_usage
    WHERE session_id = ?
  `).get(sessionId) as WeeklyUsage;
  return row;
}

export function getAllUsersWeeklyUsage(): { userId: string; totalTokens: number; cost: number }[] {
  const db = getDb();
  const start = getWeekStartMs();
  return db.prepare(`
    SELECT user_id as userId, SUM(total_tokens) as totalTokens, SUM(cost_total) as cost
    FROM token_usage
    WHERE timestamp >= ?
    GROUP BY user_id
    ORDER BY totalTokens DESC
  `).all(start) as any[];
}

export function getUserUsageHistory(userId: string, weeks: number = 12): { weekStart: string; totalTokens: number; cost: number }[] {
  const db = getDb();
  const cutoffMs = Date.now() - weeks * 7 * 86_400_000;
  // Group by ISO week start (Sunday)
  return db.prepare(`
    SELECT
      date(datetime(timestamp / 1000, 'unixepoch'), 'weekday 0', '-6 days') as weekStart,
      SUM(total_tokens) as totalTokens,
      SUM(cost_total) as cost
    FROM token_usage
    WHERE user_id = ? AND timestamp >= ?
    GROUP BY weekStart
    ORDER BY weekStart
  `).all(userId, cutoffMs) as any[];
}

// ── Budget management ──

export function getUserBudget(userId: string): number | null {
  const db = getDb();
  const row = db.prepare("SELECT weekly_token_limit FROM user_budgets WHERE user_id = ?").get(userId) as { weekly_token_limit: number } | undefined;
  return row?.weekly_token_limit ?? null;
}

export function setUserBudget(userId: string, weeklyLimit: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_budgets (user_id, weekly_token_limit, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET weekly_token_limit = excluded.weekly_token_limit, updated_at = datetime('now')
  `).run(userId, weeklyLimit);
}

export function removeUserBudget(userId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM user_budgets WHERE user_id = ?").run(userId);
  return result.changes > 0;
}

/** System-wide default weekly token limit. 0 = unlimited. */
export function getSystemDefaultBudget(): number {
  return parseInt(process.env.DEFAULT_WEEKLY_TOKEN_LIMIT || "0", 10);
}

export function getEffectiveBudget(userId: string): number {
  return getUserBudget(userId) ?? getSystemDefaultBudget();
}

export function getBudgetStatus(userId: string): BudgetStatus {
  const limit = getEffectiveBudget(userId);
  const usage = getWeeklyUsage(userId);
  const used = usage.totalTokens;
  const remaining = limit > 0 ? Math.max(0, limit - used) : Infinity;
  const overBudget = limit > 0 && used >= limit;
  const percent = limit > 0 ? (used / limit) * 100 : null;

  return {
    overBudget,
    used,
    limit,
    remaining: remaining === Infinity ? -1 : remaining,
    percent,
    resetsAt: getNextResetIso(),
  };
}
