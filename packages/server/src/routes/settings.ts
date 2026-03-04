import type { FastifyPluginAsync } from "fastify";
import { resolve, dirname } from "path";
import { readFile, writeFile, rm, mkdir } from "fs/promises";
import { isAdminUser } from "./auth.js";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");
const SYSTEM_AGENTS_MD_PATH = resolve(DATA_ROOT, "system-settings", "AGENTS.md");

export const DEFAULT_AGENTS_MD = `# Project Instructions

## Workspace Instructions

### Intermediate files

Write all intermediate and temporary files to a \`.pi-work/\` subdirectory
(e.g. helper scripts, thumbnail images, intermediate PDFs, conversion artifacts).

Only final deliverables belong in the workspace root. If the user asks for a document, powerpoint, plot, Excel sheet, etc. and doesn't specify a path, put it in the workspace root.
`;

export async function readSystemDefault(): Promise<string> {
  try {
    return await readFile(SYSTEM_AGENTS_MD_PATH, "utf-8");
  } catch {
    return DEFAULT_AGENTS_MD;
  }
}

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
    const systemDefault = await readSystemDefault();
    if (!userId) return { content: systemDefault, isCustom: false, defaultContent: systemDefault };

    const content = await readUserAgentsMd(userId);
    return {
      content: content ?? systemDefault,
      isCustom: content !== null,
      defaultContent: systemDefault,
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

  // Save system-wide default AGENTS.md (admin only)
  app.put<{ Body: { content: string } }>("/settings/agents-md/default", async (req, reply) => {
    const username = req.user?.username;
    if (!username || !isAdminUser(username)) {
      return reply.code(403).send({ error: "Admin access required" });
    }

    const { content } = req.body as { content: string };
    await mkdir(dirname(SYSTEM_AGENTS_MD_PATH), { recursive: true });
    await writeFile(SYSTEM_AGENTS_MD_PATH, content, "utf-8");
    return { ok: true };
  });
};
