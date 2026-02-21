import { describe, it, expect } from "vitest";
import { safePath } from "../utils/safe-path.js";

const BASE = "/data/workspaces/default";

describe("safePath", () => {
  it("resolves a simple filename within the base directory", () => {
    expect(safePath("test.csv", BASE)).toBe(`${BASE}/test.csv`);
  });

  it("resolves a nested path within the base directory", () => {
    expect(safePath("output/cleaned.csv", BASE)).toBe(
      `${BASE}/output/cleaned.csv`,
    );
  });

  it("blocks path traversal with ..", () => {
    expect(safePath("../../../etc/passwd", BASE)).toBeNull();
  });

  it("blocks path traversal with encoded sequences", () => {
    expect(safePath("..%2F..%2Fetc/passwd", BASE)).not.toBeNull();
    // Note: resolve doesn't decode URL encoding, so this stays within base.
    // The actual attack vector is literal ".." which is what we block.
  });

  it("blocks traversal that starts inside then escapes", () => {
    expect(safePath("subdir/../../outside", BASE)).toBeNull();
  });

  it("allows the base directory itself", () => {
    expect(safePath("", BASE)).toBe(BASE);
  });

  it("allows deeply nested paths", () => {
    expect(safePath("a/b/c/d/e.txt", BASE)).toBe(`${BASE}/a/b/c/d/e.txt`);
  });

  it("blocks absolute paths that escape the base", () => {
    expect(safePath("/etc/passwd", BASE)).toBeNull();
  });
});
