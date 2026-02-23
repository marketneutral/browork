import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync, spawn } from "child_process";
import { EventEmitter } from "events";

// Mock child_process before importing the module
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
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
  createSandboxBashOps,
} from "../services/sandbox-manager.js";

const mockExecSync = vi.mocked(execSync);
const mockSpawn = vi.mocked(spawn);

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

      const containerId = ensureSandbox("user1");
      expect(containerId).toBe("abc123");

      // Verify docker create was called with correct arguments
      const createCall = mockExecSync.mock.calls[1][0] as string;
      expect(createCall).toContain("docker create");
      expect(createCall).toContain("opentowork-sandbox-user1");
      expect(createCall).toContain(":/workspaces");
      expect(createCall).toContain("--cap-drop");
      expect(createCall).toContain("--memory");
    });

    it("should reuse an existing running container", () => {
      // First call: create
      mockExecSync.mockReturnValueOnce("");
      mockExecSync.mockReturnValueOnce("abc123\n");
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      ensureSandbox("user1");

      // Second call: should check if running and return cached
      mockExecSync.mockReturnValueOnce("true\n"); // isContainerRunning

      const containerId = ensureSandbox("user1");
      expect(containerId).toBe("abc123");
    });

    it("should start a stopped container", () => {
      // findContainer returns existing
      mockExecSync.mockReturnValueOnce("existing123\n");
      // isContainerRunning returns false
      mockExecSync.mockReturnValueOnce("false\n");
      // docker start succeeds
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      const containerId = ensureSandbox("user2");
      expect(containerId).toBe("existing123");
    });

    it("should sanitize userId for container naming", () => {
      mockExecSync.mockReturnValueOnce("");
      mockExecSync.mockReturnValueOnce("abc123\n");
      mockExecSync.mockReturnValueOnce(Buffer.from(""));

      ensureSandbox("user@example.com");

      const createCall = mockExecSync.mock.calls[1][0] as string;
      expect(createCall).toContain("opentowork-sandbox-user-example-com");
    });
  });

  describe("removeSandbox", () => {
    it("should remove a known container", () => {
      // Create first
      mockExecSync.mockReturnValueOnce("");
      mockExecSync.mockReturnValueOnce("abc123\n");
      mockExecSync.mockReturnValueOnce(Buffer.from(""));
      ensureSandbox("user1");

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
        "opentowork-sandbox-user1\tabc123\tUp 2 hours\n" +
        "opentowork-sandbox-user2\tdef456\tExited (0) 1 hour ago\n",
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

  describe("createSandboxBashOps", () => {
    /** Helper: create a fake child process with piped stdout/stderr */
    function createMockChild() {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      return child;
    }

    /** Provision a sandbox so the container map has an entry */
    function provisionUser(userId: string, containerId: string) {
      mockExecSync.mockReturnValueOnce(""); // findContainer
      mockExecSync.mockReturnValueOnce(`${containerId}\n`); // docker create
      mockExecSync.mockReturnValueOnce(Buffer.from("")); // docker start
      ensureSandbox(userId);
      mockExecSync.mockReset();
    }

    it("should return an object with an exec function", () => {
      const ops = createSandboxBashOps("user1");
      expect(ops).toHaveProperty("exec");
      expect(typeof ops.exec).toBe("function");
    });

    it("should throw when no sandbox container exists for user", async () => {
      const ops = createSandboxBashOps("no-container-user");
      await expect(
        ops.exec("ls", "/tmp", { onData: vi.fn() }),
      ).rejects.toThrow("No sandbox container for user no-container-user");
    });

    it("should call docker exec with correct container path translation", async () => {
      provisionUser("user1", "abc123");

      const child = createMockChild();
      mockSpawn.mockReturnValueOnce(child as any);

      const ops = createSandboxBashOps("user1");
      const onData = vi.fn();

      const dataRoot = process.env.DATA_ROOT || `${process.cwd()}/data`;
      const hostCwd = `${dataRoot}/workspaces/session1/workspace`;
      const execPromise = ops.exec("echo hello", hostCwd, { onData });

      // Verify spawn was called with correct args
      expect(mockSpawn).toHaveBeenCalledWith(
        "docker",
        ["exec", "-w", "/workspaces/session1/workspace", "abc123", "/bin/bash", "-c", "echo hello"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      // Simulate process completing
      child.emit("close", 0);

      const result = await execPromise;
      expect(result).toEqual({ exitCode: 0 });
    });

    it("should stream stdout and stderr via onData callback", async () => {
      provisionUser("user2", "def456");

      const child = createMockChild();
      mockSpawn.mockReturnValueOnce(child as any);

      const ops = createSandboxBashOps("user2");
      const onData = vi.fn();

      const dataRoot = process.env.DATA_ROOT || `${process.cwd()}/data`;
      const hostCwd = `${dataRoot}/workspaces/s1/workspace`;
      const execPromise = ops.exec("ls", hostCwd, { onData });

      // Simulate stdout and stderr data
      const stdoutData = Buffer.from("file1.txt\n");
      const stderrData = Buffer.from("warning: something\n");
      child.stdout.emit("data", stdoutData);
      child.stderr.emit("data", stderrData);
      child.emit("close", 0);

      await execPromise;

      expect(onData).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledWith(stdoutData);
      expect(onData).toHaveBeenCalledWith(stderrData);
    });

    it("should return non-zero exit code on failure", async () => {
      provisionUser("user3", "ghi789");

      const child = createMockChild();
      mockSpawn.mockReturnValueOnce(child as any);

      const ops = createSandboxBashOps("user3");

      const dataRoot = process.env.DATA_ROOT || `${process.cwd()}/data`;
      const execPromise = ops.exec("false", `${dataRoot}/workspaces/s1/workspace`, {
        onData: vi.fn(),
      });

      child.emit("close", 1);

      const result = await execPromise;
      expect(result).toEqual({ exitCode: 1 });
    });

    it("should kill child process when abort signal fires", async () => {
      provisionUser("user4", "jkl012");

      const child = createMockChild();
      mockSpawn.mockReturnValueOnce(child as any);

      const controller = new AbortController();
      const ops = createSandboxBashOps("user4");

      const dataRoot = process.env.DATA_ROOT || `${process.cwd()}/data`;
      const execPromise = ops.exec("sleep 100", `${dataRoot}/workspaces/s1/workspace`, {
        onData: vi.fn(),
        signal: controller.signal,
      });

      // Abort the command
      controller.abort();
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");

      // Simulate process exit after kill
      child.emit("close", null);

      await expect(execPromise).rejects.toThrow("aborted");
    });
  });
});
