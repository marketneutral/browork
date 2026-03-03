/**
 * Image Injection — scans workspace for newly created images after bash
 * commands and returns them as ImageContent for the LLM to see.
 *
 * When Pi runs a bash command that produces an image (e.g. matplotlib),
 * this module detects the new file and appends the image data to the
 * tool result so the model can reason about what it created.
 */

import { readdir, stat, readFile } from "fs/promises";
import { join, extname } from "path";

/** Matches the Pi AI SDK ImageContent type */
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const EXCLUDED_DIRS = new Set([".pi-work", ".pi", "node_modules", ".git"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image

/**
 * Walk the workspace and find image files created/modified after `afterTimestamp`.
 * Returns at most `maxImages` ImageContent objects, most recent first.
 */
export async function scanNewImages(
  workDir: string,
  afterTimestamp: number,
  maxImages = 3,
): Promise<ImageContent[]> {
  const candidates: { path: string; mtime: number }[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(fullPath);
      } else {
        const ext = extname(entry.name).toLowerCase();
        if (!(ext in IMAGE_EXTENSIONS)) continue;

        try {
          const s = await stat(fullPath);
          if (s.mtimeMs >= afterTimestamp && s.size > 0 && s.size <= MAX_IMAGE_BYTES) {
            candidates.push({ path: fullPath, mtime: s.mtimeMs });
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(workDir);

  // Most recently modified first
  candidates.sort((a, b) => b.mtime - a.mtime);
  const top = candidates.slice(0, maxImages);

  const results: ImageContent[] = [];
  for (const { path } of top) {
    const ext = extname(path).toLowerCase();
    const mimeType = IMAGE_EXTENSIONS[ext];
    if (!mimeType) continue;

    try {
      const data = await readFile(path);
      results.push({ type: "image", data: data.toString("base64"), mimeType });
    } catch {
      // skip
    }
  }

  return results;
}

/**
 * Wrap a Pi bash tool so that after each execution, any newly created
 * image files in the workspace are appended to the tool result as
 * ImageContent. This lets the LLM see plots and charts it creates.
 */
export function wrapBashWithImageInjection(
  bashTool: any,
  hostWorkDir: string,
): any {
  const originalExecute = bashTool.execute.bind(bashTool);
  return {
    ...bashTool,
    async execute(...args: any[]) {
      const beforeTs = Date.now();
      const result = await originalExecute(...args);

      try {
        const newImages = await scanNewImages(hostWorkDir, beforeTs);
        if (newImages.length > 0) {
          console.log(
            `[image-inject] Injecting ${newImages.length} image(s) into bash tool result`,
          );
          const content = Array.isArray(result.content)
            ? [...result.content, ...newImages]
            : newImages;
          return { ...result, content };
        }
      } catch (err) {
        console.warn("[image-inject] Error scanning for new images:", err);
      }

      return result;
    },
  };
}
