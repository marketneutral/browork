import { describe, it, expect, beforeEach } from "vitest";
import { resolve } from "path";
import {
  initSkills,
  listSkills,
  getSkill,
  setSkillEnabled,
  expandSkillPrompt,
} from "../services/skill-manager.js";

const SKILLS_DIR = resolve(import.meta.dirname, "../../../skills");

describe("skill-manager", () => {
  beforeEach(async () => {
    await initSkills();
  });

  describe("initSkills", () => {
    it("should discover all bundled skills", () => {
      const skills = listSkills();
      expect(skills.length).toBe(6);
      const names = skills.map((s) => s.name).sort();
      expect(names).toEqual([
        "chart-generator",
        "data-cleaning",
        "data-validation",
        "excel-merge",
        "financial-report",
        "pivot-table",
      ]);
    });

    it("should load skills from extra directories", async () => {
      await initSkills([SKILLS_DIR]);
      // Should not duplicate — same dir scanned twice
      const skills = listSkills();
      expect(skills.length).toBe(6);
    });

    it("should ignore non-existent directories", async () => {
      await initSkills(["/tmp/nonexistent-skill-dir-12345"]);
      const skills = listSkills();
      expect(skills.length).toBe(6);
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
      const skill = getSkill("data-cleaning");
      expect(skill).toBeDefined();
      expect(skill!.name).toBe("data-cleaning");
      expect(skill!.description).toContain("Clean and standardize");
      expect(skill!.body).toContain("# Data Cleaning");
      expect(skill!.enabled).toBe(true);
    });

    it("should return undefined for unknown skills", () => {
      expect(getSkill("nonexistent")).toBeUndefined();
    });
  });

  describe("setSkillEnabled", () => {
    it("should disable a skill", () => {
      const result = setSkillEnabled("data-cleaning", false);
      expect(result).toBeDefined();
      expect(result!.enabled).toBe(false);

      const skill = getSkill("data-cleaning");
      expect(skill!.enabled).toBe(false);
    });

    it("should re-enable a skill", () => {
      setSkillEnabled("data-cleaning", false);
      const result = setSkillEnabled("data-cleaning", true);
      expect(result!.enabled).toBe(true);
    });

    it("should return undefined for unknown skills", () => {
      expect(setSkillEnabled("nonexistent", false)).toBeUndefined();
    });
  });

  describe("expandSkillPrompt", () => {
    it("should wrap skill body in <skill> tags", () => {
      const prompt = expandSkillPrompt("data-cleaning");
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('<skill name="data-cleaning">');
      expect(prompt).toContain("</skill>");
      expect(prompt).toContain("# Data Cleaning");
    });

    it("should append user args when provided", () => {
      const prompt = expandSkillPrompt(
        "data-cleaning",
        "Focus on Q4_revenue.csv",
      );
      expect(prompt).toContain("User request: Focus on Q4_revenue.csv");
    });

    it("should return null for disabled skills", () => {
      setSkillEnabled("data-cleaning", false);
      const prompt = expandSkillPrompt("data-cleaning");
      expect(prompt).toBeNull();
    });

    it("should return null for unknown skills", () => {
      expect(expandSkillPrompt("nonexistent")).toBeNull();
    });

    it("should handle empty args gracefully", () => {
      const prompt = expandSkillPrompt("data-cleaning", "  ");
      expect(prompt).not.toBeNull();
      expect(prompt).not.toContain("User request:");
    });
  });

  describe("frontmatter parsing", () => {
    it("should parse name and description from skill files", () => {
      const skill = getSkill("excel-merge");
      expect(skill).toBeDefined();
      expect(skill!.name).toBe("excel-merge");
      expect(skill!.description).toContain("Merge multiple");
    });

    it("should handle multiline description in frontmatter", () => {
      const skill = getSkill("data-cleaning");
      expect(skill).toBeDefined();
      // Description spans multiple lines in the YAML
      expect(skill!.description.length).toBeGreaterThan(20);
    });
  });
});
