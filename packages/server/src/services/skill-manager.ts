/**
 * Skill Manager Service
 *
 * Discovers, loads, and manages Pi skills (workflows) from the
 * bundled skills directory and any additional configured paths.
 *
 * Skills are Markdown files (SKILL.md) with YAML frontmatter following
 * the Agent Skills standard (https://agentskills.io/specification).
 */

import { readdir, readFile, mkdir, symlink, readlink, unlink, lstat, cp, rm, writeFile } from "fs/promises";
import { resolve, join, basename, dirname } from "path";
import { existsSync, realpathSync } from "fs";
import { homedir } from "os";

// ── Types ──

export interface SkillMeta {
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillContent extends SkillMeta {
  /** Raw markdown body (frontmatter stripped) */
  body: string;
  /** Absolute path to the skill's directory */
  dirPath: string;
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

/** Default global skills directory for Pi's DefaultResourceLoader */
const GLOBAL_SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

function getDataRoot(): string {
  return process.env.DATA_ROOT || resolve(process.cwd(), "data");
}

/** Per-user installed skills directory */
function userSkillsDir(userId: string): string {
  return join(getDataRoot(), "user-skills", userId);
}

/** Session-local skills directory inside a workspace */
function sessionSkillsDir(workspaceDir: string): string {
  return join(workspaceDir, ".pi", "skills");
}

/**
 * Discover and load skills from all configured directories.
 * Called once at server startup.
 */
export async function initSkills(
  extraDirs?: string[],
  opts?: { globalSkillsDir?: string },
): Promise<void> {
  skills.clear();

  const dirs = [BUNDLED_SKILLS_DIR, ...skillDirs, ...(extraDirs ?? [])];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    await scanSkillDirectory(dir);
  }

  // Symlink bundled skills to Pi's global skills directory
  const globalDir = opts?.globalSkillsDir ?? GLOBAL_SKILLS_DIR;
  await symlinkGlobalSkills(globalDir);

  // Clean up broken symlinks in the global skills directory
  await cleanBrokenSymlinks(globalDir);

  // Scan global skills dir to pick up externally-installed skills (e.g. via install-skill)
  if (existsSync(globalDir)) {
    await scanSkillDirectory(globalDir);
  }

  // Write APPEND_SYSTEM.md with skill directory mappings so Pi resolves relative paths
  await writeSkillPathsAppendPrompt(globalDir);

  console.log(
    `Loaded ${skills.size} skills: ${Array.from(skills.keys()).join(", ")}`,
  );
}

export async function scanSkillDirectory(dir: string, opts?: { register?: boolean }): Promise<SkillContent[]> {
  const shouldRegister = opts?.register !== false;
  const results: SkillContent[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
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

      const skill: SkillContent = {
        name,
        description,
        enabled: true,
        body,
        dirPath: join(dir, entry.name),
      };

      results.push(skill);
      if (shouldRegister) {
        skills.set(name, skill);
      }
    } catch (err) {
      console.warn(`Failed to load skill from ${skillFile}:`, err);
    }
  }
  return results;
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
 * Symlink all discovered skills into Pi's global skills directory
 * so Pi's DefaultResourceLoader discovers them natively.
 *
 * Creates: ~/.pi/agent/skills/<name> → <skill dirPath>
 */
export async function symlinkGlobalSkills(
  targetDir?: string,
): Promise<void> {
  const dir = targetDir ?? GLOBAL_SKILLS_DIR;

  await mkdir(dir, { recursive: true });

  for (const skill of skills.values()) {
    const linkPath = join(dir, skill.name);
    const target = resolve(skill.dirPath);

    try {
      // Check if something already exists at the link path (lstat follows broken symlinks)
      let exists = false;
      try {
        await lstat(linkPath);
        exists = true;
      } catch {
        // Nothing at linkPath
      }

      if (exists) {
        try {
          const existing = await readlink(linkPath);
          if (resolve(existing) === target) continue; // Already correct
        } catch {
          // Not a symlink or unreadable — remove and recreate
        }
        await unlink(linkPath);
      }

      await symlink(target, linkPath, "dir");
    } catch (err) {
      console.warn(`Failed to symlink skill ${skill.name} to ${linkPath}:`, err);
    }
  }
}

/**
 * Remove broken symlinks from the skills directory.
 * These can accumulate when bundled skills are removed or repos move.
 */
async function cleanBrokenSymlinks(dir: string): Promise<void> {
  if (!existsSync(dir)) return;
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = await lstat(fullPath);
        if (!stat.isSymbolicLink()) continue;
        // Check if target exists
        try {
          realpathSync(fullPath);
        } catch {
          // Target doesn't exist — broken symlink
          console.log(`Removing broken skill symlink: ${entry}`);
          await unlink(fullPath);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Directory not readable
  }
}

/**
 * Write ~/.pi/agent/APPEND_SYSTEM.md with skill directory mappings.
 * This tells Pi the absolute base directory for each installed skill so it
 * can resolve relative paths (scripts, reference docs) in SKILL.md files.
 */
async function writeSkillPathsAppendPrompt(globalDir: string): Promise<void> {
  const piAgentDir = dirname(globalDir);
  const appendPath = join(piAgentDir, "APPEND_SYSTEM.md");

  // Collect skills that have supporting files (scripts/ dir or extra .md files)
  const skillEntries: { name: string; dirPath: string }[] = [];
  for (const skill of skills.values()) {
    skillEntries.push({ name: skill.name, dirPath: resolve(skill.dirPath) });
  }

  if (skillEntries.length === 0) {
    // Clean up if no skills
    await rm(appendPath, { force: true }).catch(() => {});
    return;
  }

  const lines = [
    "## Skill Directories",
    "",
    "When a SKILL.md references relative paths (e.g. `scripts/thumbnail.py`, `editing.md`),",
    "resolve them against that skill's base directory listed below — NOT the workspace cwd.",
    "Always use the absolute path in bash commands and read tool calls.",
    "",
    "| Skill | Base Directory |",
    "|-------|---------------|",
    ...skillEntries.map((s) => `| ${s.name} | \`${s.dirPath}\` |`),
    "",
    "## Pre-installed Packages",
    "",
    "The following packages are already installed globally. Do NOT run pip install or npm install for these.",
    "",
    "**Python:** pandas, numpy, scipy, matplotlib, seaborn, openpyxl, xlsxwriter, pypdf, pypdfium2,",
    "pdfplumber, reportlab, Pillow, pytesseract, pdf2image, markitdown, defusedxml, yfinance, fredapi,",
    "pandas-datareader, requests, python-dateutil",
    "",
    "**Node.js (global, NODE_PATH set):** pptxgenjs, docx, pdf-lib, pdfjs-dist",
    "",
    "**System tools:** LibreOffice (soffice), poppler-utils (pdftoppm, pdftotext, pdfimages),",
    "qpdf, tesseract-ocr, imagemagick, pandoc, ripgrep, jq, git, curl",
  ];

  await mkdir(piAgentDir, { recursive: true });
  await writeFile(appendPath, lines.join("\n") + "\n", "utf-8");
}

// ── User & Session Skills ──

/** Validate a skill name to prevent path traversal */
function validateSkillName(name: string): void {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid skill name: ${name}`);
  }
}

/**
 * List a user's installed cross-session skills.
 */
export async function listUserSkills(userId: string): Promise<SkillMeta[]> {
  const dir = userSkillsDir(userId);
  if (!existsSync(dir)) return [];
  const results = await scanSkillDirectory(dir, { register: false });
  return results.map(({ name, description, enabled }) => ({ name, description, enabled }));
}

/**
 * List session-local skills from a workspace directory.
 */
export async function listSessionSkills(workspaceDir: string): Promise<SkillMeta[]> {
  const dir = sessionSkillsDir(workspaceDir);
  if (!existsSync(dir)) return [];
  const results = await scanSkillDirectory(dir, { register: false });
  return results.map(({ name, description, enabled }) => ({ name, description, enabled }));
}

/**
 * Get a user's installed skill by name.
 */
export async function getUserSkill(userId: string, name: string): Promise<SkillContent | undefined> {
  validateSkillName(name);
  const dir = userSkillsDir(userId);
  const results = await scanSkillDirectory(dir, { register: false });
  return results.find((s) => s.name === name);
}

/**
 * Get a session-local skill by name.
 */
export async function getSessionSkill(workspaceDir: string, name: string): Promise<SkillContent | undefined> {
  validateSkillName(name);
  const dir = sessionSkillsDir(workspaceDir);
  const results = await scanSkillDirectory(dir, { register: false });
  return results.find((s) => s.name === name);
}

/**
 * Promote a session skill to the user's installed skills.
 * Copies the entire skill directory (SKILL.md + supporting files).
 */
export async function promoteSessionSkill(
  userId: string,
  workspaceDir: string,
  skillName: string,
): Promise<void> {
  validateSkillName(skillName);

  const srcDir = join(sessionSkillsDir(workspaceDir), skillName);
  const destDir = join(userSkillsDir(userId), skillName);

  // If already promoted (srcDir is a symlink to the user copy), no-op
  try {
    const linkTarget = await readlink(srcDir);
    if (resolve(linkTarget) === resolve(destDir)) {
      return;
    }
  } catch {
    // Not a symlink — it's a real directory, proceed with promote
  }

  const skillFile = join(srcDir, "SKILL.md");
  if (!existsSync(skillFile)) {
    throw new Error(`Session skill "${skillName}" not found`);
  }

  await mkdir(userSkillsDir(userId), { recursive: true });

  // Remove existing user copy if present, then copy from session
  if (existsSync(destDir)) {
    await rm(destDir, { recursive: true });
  }
  await cp(srcDir, destDir, { recursive: true });

  // Replace session copy with a symlink to the user copy.
  // This keeps Pi's skill discovery working (symlink to dir) while
  // ensuring listSessionSkills() skips it (Dirent.isDirectory() is
  // false for symlinks, so scanSkillDirectory filters it out).
  await rm(srcDir, { recursive: true });
  await symlink(resolve(destDir), srcDir, "dir");
}

/**
 * Demote an installed user skill back to the current session for editing.
 * Copies the skill into the session workspace, then removes it from installed.
 */
export async function demoteUserSkill(
  userId: string,
  workspaceDir: string,
  skillName: string,
): Promise<void> {
  validateSkillName(skillName);

  const srcDir = join(userSkillsDir(userId), skillName);
  const skillFile = join(srcDir, "SKILL.md");
  if (!existsSync(skillFile)) {
    throw new Error(`User skill "${skillName}" not found`);
  }

  const destDir = join(sessionSkillsDir(workspaceDir), skillName);
  await mkdir(sessionSkillsDir(workspaceDir), { recursive: true });

  // Remove existing session copy or symlink (including broken symlinks)
  try {
    await lstat(destDir);
    // Something exists — remove it (works for real dirs, symlinks, broken symlinks)
    await rm(destDir, { recursive: true });
  } catch {
    // Nothing at destDir
  }
  await cp(srcDir, destDir, { recursive: true });

  // Remove from installed location
  await rm(srcDir, { recursive: true });
}

/**
 * Delete an installed user skill.
 */
export async function deleteUserSkill(userId: string, skillName: string): Promise<void> {
  validateSkillName(skillName);

  const dir = join(userSkillsDir(userId), skillName);
  if (!existsSync(dir)) {
    throw new Error(`User skill "${skillName}" not found`);
  }
  await rm(dir, { recursive: true });
}

/**
 * Symlink a user's installed skills into a session workspace so Pi discovers them.
 * Called before creating a Pi session.
 */
export async function symlinkUserSkillsToWorkspace(
  userId: string,
  workspaceDir: string,
): Promise<void> {
  const srcDir = userSkillsDir(userId);
  if (!existsSync(srcDir)) return;

  const targetDir = sessionSkillsDir(workspaceDir);
  await mkdir(targetDir, { recursive: true });

  let entries;
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(srcDir, entry.name, "SKILL.md"))) continue;

    const linkPath = join(targetDir, entry.name);
    const target = resolve(srcDir, entry.name);

    try {
      let exists = false;
      try {
        await lstat(linkPath);
        exists = true;
      } catch {
        // Nothing at linkPath
      }

      if (exists) {
        // If it's already a symlink pointing to the right place, skip
        try {
          const existing = await readlink(linkPath);
          if (resolve(existing) === target) continue;
        } catch {
          // Not a symlink — it's a real directory (session-local skill), don't overwrite
          continue;
        }
        await unlink(linkPath);
      }

      await symlink(target, linkPath, "dir");
    } catch (err) {
      console.warn(`Failed to symlink user skill ${entry.name}:`, err);
    }
  }
}
