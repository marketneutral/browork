import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "child_process";

// Mock child_process before importing the module
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

// Import after mocking
import {
  isSandboxEnabled,
  ensureSandbox,
  removeSandbox,
  getSandboxInfo,
  listSandboxes,
  removeAllSandboxes,
  isDockerAvailable,
  isSandboxImageAvailable,
} from "../services/sandbox-manager.js";

const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.resetAllMocks();
  // Clear internal container cache by removing known entries
  removeAllSandboxes();
  // Reset mock call tracking after the cleanup call
  mockExecSync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SANDBOX_ENABLED;
});

describe("sandbox-manager", () => {
  describe("isSandboxEnabled", () => {
    it("should return false by default", () => {
      expect(isSandboxEnabled()).toBe(false);
    });

    it("should return true when SANDBOX_ENABLED=true", () => {
      process.env.SANDBOX_ENABLED = "true";
      expect(isSandboxEnabled()).toBe(true);
    });

    it("should return false for other values", () => {
      process.env.SANDBOX_ENABLED = "yes";
      expect(isSandboxEnabled()).toBe(false);
    });
  });

  describe("isDockerAvailable", () => {
    it("should return true when docker info succeeds", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(""));
      expect(isDockerAvailable()).toBe(true);
    });

    it("should return false when docker info fails", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("docker not found");
      });
      expect(isDockerAvailable()).toBe(false);
    });
  });

  describe("isSandboxImageAvailable", () => {
    it("should return true when image exists", () => {
      mockExecSync.mockReturnValueOnce("abc123def456\n");
      expect(isSandboxImageAvailable()).toBe(true);
    });

    it("should return false when image not found", () => {
      mockExecSync.mockReturnValueOnce("");
      expect(isSandboxImageAvailable()).toBe(false);
    });

    it("should return false on error", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("docker error");
      });
      expect(isSandboxImageAvailable()).toBe(false);
    });
  });

  describe("ensureSandbox", () => {
    it("should create a new container when none exists", () => {
      // findContainer returns empty (no existing)
      mockExecSync.mockReturnValueOnce("");
      // docker create returns container ID
      mockExecSync.mockReturnValueOnce("abc123\n");
      // docker start succeeds
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      const containerId = ensureSandbox("user1", "/data/workspaces/user1");
      expect(containerId).toBe("abc123");

      // Verify docker create was called with correct arguments
      const createCall = mockExecSync.mock.calls[1][0] as string;
      expect(createCall).toContain("docker create");
      expect(createCall).toContain("browork-sandbox-user1");
      expect(createCall).toContain("/data/workspaces/user1:/workspace");
      expect(createCall).toContain("--cap-drop");
      expect(createCall).toContain("--memory");
    });

    it("should reuse an existing running container", () => {
      // First call: create
      mockExecSync.mockReturnValueOnce("");
      mockExecSync.mockReturnValueOnce("abc123\n");
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      ensureSandbox("user1", "/data/workspaces/user1");

      // Second call: should check if running and return cached
      mockExecSync.mockReturnValueOnce("true\n"); // isContainerRunning

      const containerId = ensureSandbox("user1", "/data/workspaces/user1");
      expect(containerId).toBe("abc123");
    });

    it("should start a stopped container", () => {
      // findContainer returns existing
      mockExecSync.mockReturnValueOnce("existing123\n");
      // isContainerRunning returns false
      mockExecSync.mockReturnValueOnce("false\n");
      // docker start succeeds
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      const containerId = ensureSandbox("user2", "/data/workspaces/user2");
      expect(containerId).toBe("existing123");
    });

    it("should sanitize userId for container naming", () => {
      mockExecSync.mockReturnValueOnce("");
      mockExecSync.mockReturnValueOnce("abc123\n");
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      ensureSandbox("user@example.com", "/data/workspaces/test");

      const createCall = mockExecSync.mock.calls[1][0] as string;
      expect(createCall).toContain("browork-sandbox-user-example-com");
    });
  });

  describe("removeSandbox", () => {
    it("should remove a known container", () => {
      // Create first
      mockExecSync.mockReturnValueOnce("");
      mockExecSync.mockReturnValueOnce("abc123\n");
      mockExecSync.mockReturnValueOnce(Buffer.from(""));
      ensureSandbox("user1", "/data/workspaces/user1");

      // Remove
      removeSandbox("user1");

      // docker rm -f should have been called
      const rmCall = mockExecSync.mock.calls[3][0] as string;
      expect(rmCall).toContain("docker rm -f");
      expect(rmCall).toContain("abc123");
    });

    it("should handle non-existent container gracefully", () => {
      // Should not throw
      removeSandbox("nonexistent");
    });
  });

  describe("getSandboxInfo", () => {
    it("should return not_found for unknown user", () => {
      mockExecSync.mockReturnValueOnce("");
      const info = getSandboxInfo("unknown");
      expect(info.status).toBe("not_found");
      expect(info.containerId).toBe("");
    });

    it("should return running status for active container", () => {
      mockExecSync.mockReturnValueOnce("abc123\n"); // findContainer
      mockExecSync.mockReturnValueOnce("true\n"); // isContainerRunning

      const info = getSandboxInfo("user1");
      expect(info.status).toBe("running");
      expect(info.containerId).toBe("abc123");
    });

    it("should return stopped status for stopped container", () => {
      mockExecSync.mockReturnValueOnce("abc123\n"); // findContainer
      mockExecSync.mockReturnValueOnce("false\n"); // isContainerRunning

      const info = getSandboxInfo("user1");
      expect(info.status).toBe("stopped");
    });
  });

  describe("listSandboxes", () => {
    it("should return empty array when no containers", () => {
      mockExecSync.mockReturnValueOnce("");
      expect(listSandboxes()).toEqual([]);
    });

    it("should parse docker ps output", () => {
      mockExecSync.mockReturnValueOnce(
        "browork-sandbox-user1\tabc123\tUp 2 hours\n" +
        "browork-sandbox-user2\tdef456\tExited (0) 1 hour ago\n",
      );

      const sandboxes = listSandboxes();
      expect(sandboxes).toHaveLength(2);
      expect(sandboxes[0]).toEqual({
        userId: "user1",
        containerId: "abc123",
        status: "running",
      });
      expect(sandboxes[1]).toEqual({
        userId: "user2",
        containerId: "def456",
        status: "stopped",
      });
    });

    it("should handle docker errors gracefully", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("docker not available");
      });
      expect(listSandboxes()).toEqual([]);
    });
  });

  describe("removeAllSandboxes", () => {
    it("should attempt to remove all labeled containers", () => {
      removeAllSandboxes();
      // Should call docker rm -f with filter
      const calls = mockExecSync.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle errors gracefully", () => {
      mockExecSync.mockImplementation(() => {
        throw new Error("no containers");
      });
      // Should not throw
      removeAllSandboxes();
    });
  });
});
