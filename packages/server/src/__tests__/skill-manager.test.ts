import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve, join } from "path";
import { mkdtempSync, existsSync, readlinkSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  initSkills,
  listSkills,
  getSkill,
  setSkillEnabled,
  symlinkGlobalSkills,
} from "../services/skill-manager.js";

const SKILLS_DIR = resolve(import.meta.dirname, "../../../skills");

describe("skill-manager", () => {
  beforeEach(async () => {
    await initSkills(undefined, { globalSkillsDir: mkdtempSync(join(tmpdir(), "pi-skills-test-")) });
  });

  describe("initSkills", () => {
    it("should discover all bundled skills", () => {
      const skills = listSkills();
      expect(skills.length).toBe(2);
      const names = skills.map((s) => s.name).sort();
      expect(names).toEqual([
        "chart-generator",
        "financial-report",
      ]);
    });

    it("should load skills from extra directories", async () => {
      await initSkills([SKILLS_DIR], { globalSkillsDir: mkdtempSync(join(tmpdir(), "pi-skills-test-")) });
      // Should not duplicate — same dir scanned twice
      const skills = listSkills();
      expect(skills.length).toBe(2);
    });

    it("should ignore non-existent directories", async () => {
      await initSkills(["/tmp/nonexistent-skill-dir-12345"], { globalSkillsDir: mkdtempSync(join(tmpdir(), "pi-skills-test-")) });
      const skills = listSkills();
      expect(skills.length).toBe(2);
    });
  });

  describe("listSkills", () => {
    it("should return metadata without body content", () => {
      const skills = listSkills();
      for (const skill of skills) {
        expect(skill).toHaveProperty("name");
        expect(skill).toHaveProperty("description");
        expect(skill).toHaveProperty("enabled");
        expect(skill).not.toHaveProperty("body");
      }
    });

    it("should have all skills enabled by default", () => {
      const skills = listSkills();
      for (const skill of skills) {
        expect(skill.enabled).toBe(true);
      }
    });
  });

  describe("getSkill", () => {
    it("should return full skill content", () => {
      const skill = getSkill("chart-generator");
      expect(skill).toBeDefined();
      expect(skill!.name).toBe("chart-generator");
      expect(skill!.description).toContain("charts and visualizations");
      expect(skill!.body).toBeTruthy();
      expect(skill!.enabled).toBe(true);
    });

    it("should include dirPath", () => {
      const skill = getSkill("chart-generator");
      expect(skill).toBeDefined();
      expect(skill!.dirPath).toContain("chart-generator");
      expect(existsSync(skill!.dirPath)).toBe(true);
    });

    it("should return undefined for unknown skills", () => {
      expect(getSkill("nonexistent")).toBeUndefined();
    });
  });

  describe("setSkillEnabled", () => {
    it("should disable a skill", () => {
      const result = setSkillEnabled("chart-generator", false);
      expect(result).toBeDefined();
      expect(result!.enabled).toBe(false);

      const skill = getSkill("chart-generator");
      expect(skill!.enabled).toBe(false);
    });

    it("should re-enable a skill", () => {
      setSkillEnabled("chart-generator", false);
      const result = setSkillEnabled("chart-generator", true);
      expect(result!.enabled).toBe(true);
    });

    it("should return undefined for unknown skills", () => {
      expect(setSkillEnabled("nonexistent", false)).toBeUndefined();
    });
  });

  describe("symlinkGlobalSkills", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = mkdtempSync(join(tmpdir(), "pi-skills-symlink-"));
      // Ensure skills are loaded
      await initSkills(undefined, { globalSkillsDir: tempDir });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("should create symlinks for all skills", async () => {
      await symlinkGlobalSkills(tempDir);
      const skills = listSkills();
      for (const skill of skills) {
        const linkPath = join(tempDir, skill.name);
        expect(existsSync(linkPath)).toBe(true);

        const target = readlinkSync(linkPath);
        expect(existsSync(target)).toBe(true);
      }
    });

    it("should create 2 symlinks", async () => {
      await symlinkGlobalSkills(tempDir);
      const { readdirSync } = await import("fs");
      const entries = readdirSync(tempDir);
      expect(entries.length).toBe(2);
    });

    it("should be idempotent — re-running does not fail", async () => {
      await symlinkGlobalSkills(tempDir);
      // Run again — should skip existing correct symlinks
      await expect(symlinkGlobalSkills(tempDir)).resolves.not.toThrow();
    });

    it("should replace stale symlinks", async () => {
      const { unlinkSync, symlinkSync } = await import("fs");
      const stalePath = join(tempDir, "chart-generator");
      // Remove the correct symlink created by initSkills, replace with stale one
      unlinkSync(stalePath);
      symlinkSync("/tmp/stale-target", stalePath, "dir");
      expect(readlinkSync(stalePath)).toBe("/tmp/stale-target");

      await symlinkGlobalSkills(tempDir);

      const target = readlinkSync(stalePath);
      expect(target).not.toBe("/tmp/stale-target");
      expect(target).toContain("chart-generator");
    });

    it("should create target directory if it does not exist", async () => {
      const nestedDir = join(tempDir, "nested", "skills");
      await symlinkGlobalSkills(nestedDir);
      expect(existsSync(nestedDir)).toBe(true);
    });
  });

  describe("frontmatter parsing", () => {
    it("should parse name and description from skill files", () => {
      const skill = getSkill("financial-report");
      expect(skill).toBeDefined();
      expect(skill!.name).toBe("financial-report");
      expect(skill!.description).toContain("financial metrics");
    });

    it("should handle description from frontmatter", () => {
      const skill = getSkill("chart-generator");
      expect(skill).toBeDefined();
      expect(skill!.description.length).toBeGreaterThan(20);
    });
  });
});
