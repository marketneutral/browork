import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  listUserSkills,
  listSessionSkills,
  promoteSessionSkill,
  demoteUserSkill,
  deleteUserSkill,
  getUserSkill,
  getSessionSkill,
} from "../services/skill-manager.js";

/** Create a minimal SKILL.md in the given directory */
function createSkill(dir: string, name: string, description = "Test skill") {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nDo the thing.\n`,
  );
  return skillDir;
}

/** Create a skill with subdirectories and supporting files */
function createSkillWithSupportFiles(dir: string, name: string) {
  const skillDir = createSkill(dir, name, "Skill with support files");
  // Add a supporting code file
  writeFileSync(join(skillDir, "helper.py"), 'print("helper")');
  // Add a subdirectory with a data file
  const subDir = join(skillDir, "templates");
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, "report.md"), "# Report Template\n");
  return skillDir;
}

describe("user-skills", () => {
  let userSkillsRoot: string;
  let workspaceDir: string;
  const userId = "test-user-123";

  beforeEach(() => {
    // Create temp dirs that simulate the data layout
    const tmp = mkdtempSync(join(tmpdir(), "user-skills-test-"));
    userSkillsRoot = join(tmp, "user-skills", userId);
    workspaceDir = join(tmp, "workspaces", "session-1", "workspace");
    mkdirSync(workspaceDir, { recursive: true });

    // Override DATA_ROOT for tests
    process.env.DATA_ROOT = tmp;
  });

  afterEach(() => {
    const tmp = process.env.DATA_ROOT!;
    delete process.env.DATA_ROOT;
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("listUserSkills", () => {
    it("should return empty array when no user skills exist", async () => {
      const result = await listUserSkills(userId);
      expect(result).toEqual([]);
    });

    it("should list installed user skills", async () => {
      createSkill(userSkillsRoot, "my-analysis");
      createSkill(userSkillsRoot, "my-pipeline");

      const result = await listUserSkills(userId);
      expect(result).toHaveLength(2);
      const names = result.map((s) => s.name).sort();
      expect(names).toEqual(["my-analysis", "my-pipeline"]);
    });

    it("should return metadata without body", async () => {
      createSkill(userSkillsRoot, "my-skill");
      const result = await listUserSkills(userId);
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("description");
      expect(result[0]).toHaveProperty("enabled");
      expect(result[0]).not.toHaveProperty("body");
    });
  });

  describe("listSessionSkills", () => {
    it("should return empty array when no session skills exist", async () => {
      const result = await listSessionSkills(workspaceDir);
      expect(result).toEqual([]);
    });

    it("should list session-local skills", async () => {
      const sessionSkillsDir = join(workspaceDir, ".pi", "skills");
      createSkill(sessionSkillsDir, "local-skill");

      const result = await listSessionSkills(workspaceDir);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("local-skill");
    });
  });

  describe("getUserSkill / getSessionSkill", () => {
    it("should return a user skill by name", async () => {
      createSkill(userSkillsRoot, "my-analysis");
      const skill = await getUserSkill(userId, "my-analysis");
      expect(skill).toBeDefined();
      expect(skill!.name).toBe("my-analysis");
      expect(skill!.body).toContain("Do the thing");
    });

    it("should return undefined for unknown user skill", async () => {
      const skill = await getUserSkill(userId, "nonexistent");
      expect(skill).toBeUndefined();
    });

    it("should return a session skill by name", async () => {
      const sessionSkillsDir = join(workspaceDir, ".pi", "skills");
      createSkill(sessionSkillsDir, "local-skill");
      const skill = await getSessionSkill(workspaceDir, "local-skill");
      expect(skill).toBeDefined();
      expect(skill!.name).toBe("local-skill");
    });
  });

  describe("promoteSessionSkill", () => {
    it("should copy a session skill to user skills", async () => {
      const sessionSkillsDir = join(workspaceDir, ".pi", "skills");
      createSkill(sessionSkillsDir, "new-skill");

      await promoteSessionSkill(userId, workspaceDir, "new-skill");

      expect(existsSync(join(userSkillsRoot, "new-skill", "SKILL.md"))).toBe(true);
      const content = readFileSync(join(userSkillsRoot, "new-skill", "SKILL.md"), "utf-8");
      expect(content).toContain("new-skill");
    });

    it("should copy supporting files and subdirectories", async () => {
      const sessionSkillsDir = join(workspaceDir, ".pi", "skills");
      createSkillWithSupportFiles(sessionSkillsDir, "complex-skill");

      await promoteSessionSkill(userId, workspaceDir, "complex-skill");

      expect(existsSync(join(userSkillsRoot, "complex-skill", "helper.py"))).toBe(true);
      expect(existsSync(join(userSkillsRoot, "complex-skill", "templates", "report.md"))).toBe(true);
    });

    it("should throw for nonexistent session skill", async () => {
      await expect(
        promoteSessionSkill(userId, workspaceDir, "nonexistent"),
      ).rejects.toThrow("not found");
    });

    it("should reject path traversal in skill name", async () => {
      await expect(
        promoteSessionSkill(userId, workspaceDir, "../../../etc"),
      ).rejects.toThrow("Invalid skill name");
    });

    it("should overwrite existing user skill on re-promote", async () => {
      const sessionSkillsDir = join(workspaceDir, ".pi", "skills");
      createSkill(sessionSkillsDir, "evolving-skill", "Version 1");
      await promoteSessionSkill(userId, workspaceDir, "evolving-skill");

      // Update the session skill
      writeFileSync(
        join(sessionSkillsDir, "evolving-skill", "SKILL.md"),
        "---\nname: evolving-skill\ndescription: Version 2\n---\n\nUpdated.\n",
      );
      await promoteSessionSkill(userId, workspaceDir, "evolving-skill");

      const content = readFileSync(join(userSkillsRoot, "evolving-skill", "SKILL.md"), "utf-8");
      expect(content).toContain("Version 2");
    });
  });

  describe("demoteUserSkill", () => {
    it("should copy a user skill to session and remove from installed", async () => {
      createSkill(userSkillsRoot, "installed-skill");

      await demoteUserSkill(userId, workspaceDir, "installed-skill");

      // Should exist in session workspace
      const sessionPath = join(workspaceDir, ".pi", "skills", "installed-skill", "SKILL.md");
      expect(existsSync(sessionPath)).toBe(true);

      // Should be removed from user skills
      expect(existsSync(join(userSkillsRoot, "installed-skill"))).toBe(false);
    });

    it("should copy supporting files on demote", async () => {
      createSkillWithSupportFiles(userSkillsRoot, "complex-skill");

      await demoteUserSkill(userId, workspaceDir, "complex-skill");

      const sessionSkillDir = join(workspaceDir, ".pi", "skills", "complex-skill");
      expect(existsSync(join(sessionSkillDir, "helper.py"))).toBe(true);
      expect(existsSync(join(sessionSkillDir, "templates", "report.md"))).toBe(true);
    });

    it("should throw for nonexistent user skill", async () => {
      await expect(
        demoteUserSkill(userId, workspaceDir, "nonexistent"),
      ).rejects.toThrow("not found");
    });

    it("should reject path traversal in skill name", async () => {
      await expect(
        demoteUserSkill(userId, workspaceDir, "../../etc"),
      ).rejects.toThrow("Invalid skill name");
    });
  });

  describe("deleteUserSkill", () => {
    it("should remove an installed user skill", async () => {
      createSkill(userSkillsRoot, "doomed-skill");
      expect(existsSync(join(userSkillsRoot, "doomed-skill"))).toBe(true);

      await deleteUserSkill(userId, "doomed-skill");

      expect(existsSync(join(userSkillsRoot, "doomed-skill"))).toBe(false);
    });

    it("should throw for nonexistent skill", async () => {
      await expect(
        deleteUserSkill(userId, "nonexistent"),
      ).rejects.toThrow("not found");
    });

    it("should reject path traversal", async () => {
      await expect(
        deleteUserSkill(userId, "../important"),
      ).rejects.toThrow("Invalid skill name");
    });
  });
});
