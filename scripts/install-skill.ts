#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";

const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

function usage(): never {
  console.error(
    `Usage: npm run install-skill -- <repo-url> <skill-name> [--force]

Examples:
  npm run install-skill -- https://github.com/anthropics/skills pdf-tools
  npm run install-skill -- https://github.com/anthropics/skills data-processing --force`
  );
  process.exit(1);
}

function fatal(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const positional = args.filter((a) => a !== "--force");

if (positional.length !== 2) usage();

const [repoUrl, skillName] = positional;

// Validate skill name (no path traversal)
if (skillName.includes("/") || skillName.includes("\\") || skillName === ".." || skillName === ".") {
  fatal("Invalid skill name");
}

const dest = join(SKILLS_DIR, skillName);

if (existsSync(dest) && !force) {
  fatal(
    `Skill "${skillName}" already exists at ${dest}. Use --force to overwrite.`
  );
}

// Shallow-clone the repo
const tmp = mkdtempSync(join(tmpdir(), "install-skill-"));
try {
  console.log(`Cloning ${repoUrl}...`);
  execSync(`git clone --depth 1 ${repoUrl} ${tmp}/repo`, {
    stdio: ["ignore", "ignore", "inherit"],
  });

  // Locate the skill: try <name>/SKILL.md at root, then skills/<name>/SKILL.md
  const candidates = [
    join(tmp, "repo", skillName),
    join(tmp, "repo", "skills", skillName),
  ];

  const skillDir = candidates.find((c) => existsSync(join(c, "SKILL.md")));

  if (!skillDir) {
    fatal(
      `Skill "${skillName}" not found in repo. Looked for:\n  ${candidates.map((c) => c.replace(tmp + "/repo", "<repo>")).join("\n  ")}`
    );
  }

  // Copy to ~/.pi/agent/skills/<name>/
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true });
  }
  cpSync(skillDir, dest, { recursive: true });

  console.log(`Installed skill "${skillName}" to ${dest}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
