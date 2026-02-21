/**
 * Skill Manager Service
 *
 * Discovers, loads, and manages Pi skills (workflows) from the
 * bundled skills directory and any additional configured paths.
 *
 * Skills are Markdown files (SKILL.md) with YAML frontmatter following
 * the Agent Skills standard (https://agentskills.io/specification).
 */

import { readdir, readFile } from "fs/promises";
import { resolve, join } from "path";
import { existsSync } from "fs";

// ── Types ──

export interface SkillMeta {
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillContent extends SkillMeta {
  /** Raw markdown body (frontmatter stripped) */
  body: string;
}

// ── Frontmatter parser ──

interface Frontmatter {
  name?: string;
  description?: string;
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Handles the simple key: value format used by skill files.
 */
function parseFrontmatter(raw: string): {
  data: Frontmatter;
  body: string;
} {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }

  const yamlBlock = match[1];
  const body = match[2];
  const data: Record<string, string> = {};

  // Parse simple YAML key: value pairs (handles multiline values with indentation)
  let currentKey = "";
  let currentValue = "";

  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      // Save previous key-value pair
      if (currentKey) {
        data[currentKey] = currentValue.trim();
      }
      currentKey = kvMatch[1];
      currentValue = kvMatch[2];
    } else if (currentKey && line.match(/^\s+/)) {
      // Continuation line (indented)
      currentValue += " " + line.trim();
    }
  }
  // Save last pair
  if (currentKey) {
    data[currentKey] = currentValue.trim();
  }

  return { data: data as Frontmatter, body };
}

// ── Skill Manager ──

/** Default directory for bundled skills */
const BUNDLED_SKILLS_DIR = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  "../../../skills",
);

/** Loaded skills indexed by name */
const skills = new Map<string, SkillContent>();

/** Additional skill directories to scan */
const skillDirs: string[] = [];

/**
 * Discover and load skills from all configured directories.
 * Called once at server startup.
 */
export async function initSkills(
  extraDirs?: string[],
): Promise<void> {
  skills.clear();

  const dirs = [BUNDLED_SKILLS_DIR, ...skillDirs, ...(extraDirs ?? [])];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    await scanSkillDirectory(dir);
  }

  console.log(
    `Loaded ${skills.size} skills: ${Array.from(skills.keys()).join(", ")}`,
  );
}

async function scanSkillDirectory(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillFile = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const raw = await readFile(skillFile, "utf-8");
      const { data, body } = parseFrontmatter(raw);

      const name = data.name || entry.name;
      const description = data.description || "";

      skills.set(name, {
        name,
        description,
        enabled: true,
        body,
      });
    } catch (err) {
      console.warn(`Failed to load skill from ${skillFile}:`, err);
    }
  }
}

/**
 * List all loaded skills (metadata only).
 */
export function listSkills(): SkillMeta[] {
  return Array.from(skills.values()).map(({ name, description, enabled }) => ({
    name,
    description,
    enabled,
  }));
}

/**
 * Get full skill content by name.
 */
export function getSkill(name: string): SkillContent | undefined {
  return skills.get(name);
}

/**
 * Enable or disable a skill.
 */
export function setSkillEnabled(
  name: string,
  enabled: boolean,
): SkillMeta | undefined {
  const skill = skills.get(name);
  if (!skill) return undefined;
  skill.enabled = enabled;
  return { name: skill.name, description: skill.description, enabled };
}

/**
 * Expand a skill into a prompt string suitable for sending to Pi.
 * Wraps the skill body in <skill> tags and appends user arguments.
 */
export function expandSkillPrompt(
  name: string,
  userArgs?: string,
): string | null {
  const skill = skills.get(name);
  if (!skill || !skill.enabled) return null;

  let prompt = `<skill name="${skill.name}">\n${skill.body.trim()}\n</skill>`;

  if (userArgs?.trim()) {
    prompt += `\n\nUser request: ${userArgs.trim()}`;
  }

  return prompt;
}
