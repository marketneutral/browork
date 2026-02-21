import { resolve } from "path";

/**
 * Resolve a user-provided path safely within a base directory.
 * Returns null if the resolved path escapes the base (path traversal).
 */
export function safePath(
  userPath: string,
  baseDir: string,
): string | null {
  const resolved = resolve(baseDir, userPath);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}
