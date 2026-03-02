import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  initAgentsMdTracking,
  onFileChanged,
  consumeAgentsMdUpdate,
  formatAgentsMdInjection,
  removeAgentsMdTracking,
} from "../services/agents-md-tracker.js";

describe("agents-md-tracker", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "agents-md-test-"));
  });

  afterEach(() => {
    removeAgentsMdTracking(workDir);
    rmSync(workDir, { recursive: true, force: true });
  });

  it("returns null when no change has occurred", () => {
    writeFileSync(join(workDir, "AGENTS.md"), "initial content");
    initAgentsMdTracking(workDir);

    expect(consumeAgentsMdUpdate(workDir)).toBeNull();
  });

  it("detects a change and returns content once", () => {
    writeFileSync(join(workDir, "AGENTS.md"), "initial content");
    initAgentsMdTracking(workDir);

    // Simulate file change
    writeFileSync(join(workDir, "AGENTS.md"), "updated content");
    onFileChanged(workDir, ["AGENTS.md"]);

    // First consume returns the update
    expect(consumeAgentsMdUpdate(workDir)).toBe("updated content");
    // Second consume returns null (already consumed)
    expect(consumeAgentsMdUpdate(workDir)).toBeNull();
  });

  it("ignores changes to other files", () => {
    writeFileSync(join(workDir, "AGENTS.md"), "initial content");
    initAgentsMdTracking(workDir);

    onFileChanged(workDir, ["README.md", "src/index.ts"]);
    expect(consumeAgentsMdUpdate(workDir)).toBeNull();
  });

  it("does not trigger when content hash is unchanged", () => {
    writeFileSync(join(workDir, "AGENTS.md"), "same content");
    initAgentsMdTracking(workDir);

    // Re-write with identical content
    writeFileSync(join(workDir, "AGENTS.md"), "same content");
    onFileChanged(workDir, ["AGENTS.md"]);

    expect(consumeAgentsMdUpdate(workDir)).toBeNull();
  });

  it("handles file deletion gracefully", () => {
    writeFileSync(join(workDir, "AGENTS.md"), "initial content");
    initAgentsMdTracking(workDir);

    // Delete the file
    unlinkSync(join(workDir, "AGENTS.md"));
    onFileChanged(workDir, ["AGENTS.md"]);

    expect(consumeAgentsMdUpdate(workDir)).toBeNull();
  });

  it("handles missing initial file", () => {
    // No AGENTS.md exists
    initAgentsMdTracking(workDir);

    expect(consumeAgentsMdUpdate(workDir)).toBeNull();
  });

  it("detects creation of AGENTS.md when none existed initially", () => {
    initAgentsMdTracking(workDir);

    // Create the file
    writeFileSync(join(workDir, "AGENTS.md"), "new instructions");
    onFileChanged(workDir, ["AGENTS.md"]);

    expect(consumeAgentsMdUpdate(workDir)).toBe("new instructions");
  });

  it("works without prior init (lazy state creation)", () => {
    writeFileSync(join(workDir, "AGENTS.md"), "content");
    onFileChanged(workDir, ["AGENTS.md"]);

    expect(consumeAgentsMdUpdate(workDir)).toBe("content");
  });
});

describe("formatAgentsMdInjection", () => {
  it("wraps content in XML tags and prepends to user message", () => {
    const result = formatAgentsMdInjection("# Rules\nBe helpful", "Hello agent");
    expect(result).toBe(
      `<updated-project-instructions>\nThe project instructions (AGENTS.md) have been updated. Follow these for all subsequent responses:\n\n# Rules\nBe helpful\n</updated-project-instructions>\n\nHello agent`,
    );
  });
});
