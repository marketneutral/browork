/**
 * AGENTS.md Live Update Tracker
 *
 * Tracks changes to AGENTS.md in session workspaces. When the file changes,
 * the updated content is prepended to the next user prompt so the Pi agent
 * picks up the new instructions without requiring a session restart.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const AGENTS_MD = "AGENTS.md";

interface TrackerState {
  hash: string | null;
  dirty: boolean;
  cachedContent: string | null;
}

const trackers = new Map<string, TrackerState>();

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readAgentsMd(workDir: string): string | null {
  try {
    return readFileSync(join(workDir, AGENTS_MD), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Initialize tracking for a workspace. Reads the current AGENTS.md hash
 * so the first prompt doesn't unnecessarily re-inject.
 */
export function initAgentsMdTracking(workDir: string): void {
  const content = readAgentsMd(workDir);
  trackers.set(workDir, {
    hash: content ? hashContent(content) : null,
    dirty: false,
    cachedContent: null,
  });
}

/**
 * Called by the file watcher when files change. Checks if AGENTS.md
 * is among the changed paths and, if so, reads the new content and
 * marks the tracker dirty (only if the content hash actually changed).
 */
export function onFileChanged(workDir: string, paths: string[]): void {
  if (!paths.includes(AGENTS_MD)) return;

  let state = trackers.get(workDir);
  if (!state) {
    state = { hash: null, dirty: false, cachedContent: null };
    trackers.set(workDir, state);
  }

  const content = readAgentsMd(workDir);
  if (content === null) {
    // File was deleted — clear state
    if (state.hash !== null) {
      state.hash = null;
      state.dirty = false;
      state.cachedContent = null;
    }
    return;
  }

  const newHash = hashContent(content);
  if (newHash !== state.hash) {
    state.hash = newHash;
    state.dirty = true;
    state.cachedContent = content;
  }
}

/**
 * Returns the updated AGENTS.md content if it changed since the last
 * prompt. Clears the dirty flag so subsequent prompts don't re-inject.
 */
export function consumeAgentsMdUpdate(workDir: string): string | null {
  const state = trackers.get(workDir);
  if (!state || !state.dirty) return null;

  state.dirty = false;
  const content = state.cachedContent;
  state.cachedContent = null;
  return content;
}

/**
 * Wraps updated AGENTS.md content with XML tags and prepends it to the
 * user's message.
 */
export function formatAgentsMdInjection(agentsMdContent: string, userMessage: string): string {
  return `<updated-project-instructions>
The project instructions (AGENTS.md) have been updated. Follow these for all subsequent responses:

${agentsMdContent}
</updated-project-instructions>

${userMessage}`;
}

/**
 * Remove tracker state for a workspace. Called on cleanup.
 */
export function removeAgentsMdTracking(workDir: string): void {
  trackers.delete(workDir);
}
