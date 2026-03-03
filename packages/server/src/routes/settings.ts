import type { FastifyPluginAsync } from "fastify";
import { resolve, dirname } from "path";
import { readFile, writeFile, rm, mkdir } from "fs/promises";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");

export const DEFAULT_AGENTS_MD = `# Project Instructions

## Workspace Instructions

### Intermediate files

Write all intermediate and temporary files to a \`.pi-work/\` subdirectory
(e.g. helper scripts, thumbnail images, intermediate PDFs, conversion artifacts).

Only final deliverables belong in the workspace root. If the user asks for a document, powerpoint, plot, Excel sheet, etc. and doesn't specify a path, put it in the workspace root.
`;

function userAgentsMdPath(userId: string): string {
  return resolve(DATA_ROOT, "user-settings", userId, "AGENTS.md");
}

export async function readUserAgentsMd(userId: string): Promise<string | null> {
  try {
    return await readFile(userAgentsMdPath(userId), "utf-8");
  } catch {
    return null;
  }
}

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // Get user's custom AGENTS.md
  app.get("/settings/agents-md", async (req) => {
    const userId = req.user?.id;
    if (!userId) return { content: DEFAULT_AGENTS_MD, isCustom: false, defaultContent: DEFAULT_AGENTS_MD };

    const content = await readUserAgentsMd(userId);
    return {
      content: content ?? DEFAULT_AGENTS_MD,
      isCustom: content !== null,
      defaultContent: DEFAULT_AGENTS_MD,
    };
  });

  // Save user's custom AGENTS.md
  app.put<{ Body: { content: string } }>("/settings/agents-md", async (req) => {
    const userId = req.user?.id;
    if (!userId) return { ok: false };

    const { content } = req.body as { content: string };
    const filePath = userAgentsMdPath(userId);

    if (!content || content.trim() === "") {
      // Delete the file to revert to default
      await rm(filePath, { force: true }).catch(() => {});
      return { ok: true };
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
    return { ok: true };
  });
};
