/**
 * Sandbox Manager — Docker container-per-user isolation
 *
 * Each user gets a single Docker container with:
 *   - Python 3, pip, pandas, openpyxl, matplotlib
 *   - Node.js 20
 *   - The workspaces root mounted at /workspaces
 *
 * Pi agent sessions run inside these containers so that
 * `pip install`, `npm install`, bash commands, etc. are
 * fully isolated between users. One container serves all
 * of a user's sessions — the per-session working directory
 * is set at exec time via `docker exec -w`.
 *
 * When SANDBOX_ENABLED=true (default false), Pi sessions
 * are created inside the container. When disabled, Pi runs
 * directly on the host (development mode).
 */

import { execSync, execFile, spawn } from "child_process";
import { readdirSync, lstatSync, realpathSync } from "fs";
import { resolve, join, dirname } from "path";
import { homedir } from "os";
import type { BashOperations } from "@mariozechner/pi-coding-agent";

const DATA_ROOT = process.env.DATA_ROOT || resolve(process.cwd(), "data");
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || "opentowork-sandbox:latest";
const SANDBOX_MEMORY = process.env.SANDBOX_MEMORY || "512m";
const SANDBOX_CPUS = process.env.SANDBOX_CPUS || "1.0";
const SANDBOX_NETWORK = process.env.SANDBOX_NETWORK || "bridge";
const PI_SKILLS_DIR = process.env.PI_SKILLS_DIR || join(homedir(), ".pi", "agent", "skills");

export interface SandboxInfo {
  userId: string;
  containerId: string;
  status: "running" | "stopped" | "not_found";
}

// In-memory cache of container IDs per user
const containers = new Map<string, string>();

/**
 * Check whether sandbox mode is enabled via environment.
 */
export function isSandboxEnabled(): boolean {
  return process.env.SANDBOX_ENABLED === "true";
}

/**
 * Ensure a sandbox container is running for the given user.
 * Creates one if it doesn't exist, starts it if stopped.
 * The container mounts the entire workspaces root so it can
 * serve any of the user's sessions.
 * Returns the container ID.
 */
export function ensureSandbox(userId: string): string {
  // Check in-memory cache first
  const cached = containers.get(userId);
  if (cached && isContainerRunning(cached)) {
    return cached;
  }

  // Check if a container already exists with the expected name
  const containerName = sandboxName(userId);
  const existing = findContainer(containerName);

  if (existing) {
    if (!isContainerRunning(existing)) {
      startContainer(existing);
    }
    containers.set(userId, existing);
    return existing;
  }

  // Create a new container
  const containerId = createContainer(userId);
  containers.set(userId, containerId);
  return containerId;
}

/**
 * Execute a command inside the user's sandbox container.
 * Optionally set the working directory (container-relative path,
 * e.g. "/workspaces/{sessionId}/workspace").
 * Returns stdout. Throws on non-zero exit.
 */
export function execInSandbox(
  userId: string,
  command: string,
  cwd?: string,
  timeoutMs = 120_000,
): string {
  const containerId = containers.get(userId);
  if (!containerId) {
    throw new Error(`No sandbox container for user ${userId}`);
  }

  const cwdFlag = cwd ? `-w ${cwd} ` : "";
  return execSync(
    `docker exec ${cwdFlag}${containerId} /bin/bash -c ${shellEscape(command)}`,
    { timeout: timeoutMs, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
  );
}

/**
 * Execute a command inside the sandbox asynchronously.
 * Optionally set the working directory (container-relative path).
 * Returns a promise that resolves with { stdout, stderr, exitCode }.
 */
export function execInSandboxAsync(
  userId: string,
  command: string,
  cwd?: string,
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const containerId = containers.get(userId);
    if (!containerId) {
      return reject(new Error(`No sandbox container for user ${userId}`));
    }

    const args = ["exec"];
    if (cwd) args.push("-w", cwd);
    args.push(containerId, "/bin/bash", "-c", command);

    execFile(
      "docker",
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (err, out, errOut) => {
        const stdout = out || "";
        const stderr = errOut || "";
        const exitCode = err && "code" in err ? (err as any).code : 0;
        resolve({ stdout, stderr, exitCode: typeof exitCode === "number" ? exitCode : 1 });
      },
    );
  });
}

/**
 * Stop and remove a user's sandbox container.
 */
export function removeSandbox(userId: string): void {
  const containerId = containers.get(userId);
  if (!containerId) return;

  try {
    execSync(`docker rm -f ${containerId}`, { stdio: "ignore" });
  } catch {
    // Container may already be removed
  }

  containers.delete(userId);
}

/**
 * Get sandbox info for a user (for admin/status endpoints).
 */
export function getSandboxInfo(userId: string): SandboxInfo {
  const containerName = sandboxName(userId);
  const containerId = findContainer(containerName);

  if (!containerId) {
    return { userId, containerId: "", status: "not_found" };
  }

  return {
    userId,
    containerId,
    status: isContainerRunning(containerId) ? "running" : "stopped",
  };
}

/**
 * List all active sandbox containers.
 */
export function listSandboxes(): SandboxInfo[] {
  try {
    const output = execSync(
      `docker ps -a --filter "label=opentowork.sandbox=true" --format "{{.Names}}\\t{{.ID}}\\t{{.Status}}"`,
      { encoding: "utf-8" },
    ).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [name, id, status] = line.split("\t");
      const userId = name.replace("opentowork-sandbox-", "");
      return {
        userId,
        containerId: id,
        status: status.startsWith("Up") ? "running" : "stopped",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Remove all sandbox containers (used for cleanup).
 */
export function removeAllSandboxes(): void {
  try {
    execSync(
      `docker rm -f $(docker ps -aq --filter "label=opentowork.sandbox=true") 2>/dev/null`,
      { stdio: "ignore" },
    );
  } catch {
    // No containers to remove
  }
  containers.clear();
}

/**
 * Check if Docker is available on the system.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the sandbox image exists locally.
 */
export function isSandboxImageAvailable(): boolean {
  try {
    const output = execSync(`docker images -q ${SANDBOX_IMAGE}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a BashOperations-compatible object that routes commands
 * through `docker exec` into the user's sandbox container.
 * Used by Pi's createCodingTools to redirect bash execution.
 */
export function createSandboxBashOps(userId: string): BashOperations {
  return {
    async exec(command, cwd, options) {
      const containerId = containers.get(userId);
      if (!containerId) {
        throw new Error(`No sandbox container for user ${userId}`);
      }

      // Translate host path → container path
      const workspacesRoot = resolve(DATA_ROOT, "workspaces");
      const containerCwd = cwd.replace(workspacesRoot, "/workspaces");

      const startTime = Date.now();
      console.log(`[sandbox-exec] container=${containerId.slice(0, 12)} cwd=${containerCwd} cmd=${command.slice(0, 80)}`);
      if (containerCwd === cwd) {
        console.warn(`[sandbox-exec] WARNING: cwd was not translated! host=${cwd} workspacesRoot=${workspacesRoot}`);
      }

      const args = [
        "exec", "-w", containerCwd, containerId,
        "/bin/bash", "-c", command,
      ];

      return new Promise((promiseResolve, promiseReject) => {
        const child = spawn("docker", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        if (options.timeout && options.timeout > 0) {
          timeoutId = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, options.timeout * 1000); // Pi SDK passes timeout in seconds
        }

        const onAbort = () => child.kill("SIGKILL");
        if (options.signal) {
          if (options.signal.aborted) {
            child.kill("SIGKILL");
          } else {
            options.signal.addEventListener("abort", onAbort, { once: true });
          }
        }

        let dataChunks = 0;
        let dataBytes = 0;
        child.stdout.on("data", (data: Buffer) => { dataChunks++; dataBytes += data.length; options.onData(data); });
        child.stderr.on("data", (data: Buffer) => { dataChunks++; dataBytes += data.length; options.onData(data); });

        child.on("error", (err) => {
          console.error(`[sandbox-exec] spawn error: ${err.message}`);
          if (timeoutId) clearTimeout(timeoutId);
          options.signal?.removeEventListener("abort", onAbort);
          promiseReject(err);
        });

        child.on("close", (code) => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[sandbox-exec] exit=${code} timedOut=${timedOut} chunks=${dataChunks} bytes=${dataBytes} elapsed=${elapsed}s`);
          if (timeoutId) clearTimeout(timeoutId);
          options.signal?.removeEventListener("abort", onAbort);
          if (options.signal?.aborted) {
            promiseReject(new Error("aborted"));
          } else if (timedOut) {
            promiseReject(new Error(`timeout:${options.timeout}`));
          } else {
            promiseResolve({ exitCode: code });
          }
        });
      });
    },
  };
}

// ── Internal helpers ──

function sandboxName(userId: string): string {
  // Sanitize userId for Docker container naming (alphanumeric + hyphens)
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
  return `opentowork-sandbox-${safe}`;
}

/**
 * Scan PI_SKILLS_DIR for symlinks, resolve their targets, and return
 * `-v` flag pairs so the symlink targets are accessible inside the container.
 */
function getSkillSymlinkMounts(): string[] {
  try {
    const entries = readdirSync(PI_SKILLS_DIR);
    const resolvedDirs = new Set<string>();

    for (const entry of entries) {
      const fullPath = join(PI_SKILLS_DIR, entry);
      try {
        const stat = lstatSync(fullPath);
        if (!stat.isSymbolicLink()) continue;
        const realPath = realpathSync(fullPath);
        const parentDir = dirname(realPath);
        // Skip if already under PI_SKILLS_DIR (already mounted)
        if (parentDir.startsWith(PI_SKILLS_DIR)) continue;
        resolvedDirs.add(parentDir);
      } catch {
        // Skip unresolvable symlinks
      }
    }

    const flags: string[] = [];
    for (const dir of resolvedDirs) {
      flags.push("-v", `${dir}:${dir}:ro`);
    }
    return flags;
  } catch {
    // PI_SKILLS_DIR may not exist yet
    return [];
  }
}

function createContainer(userId: string): string {
  const name = sandboxName(userId);
  const workspacesRoot = resolve(DATA_ROOT, "workspaces");

  const args = [
    "docker", "create",
    "--name", name,
    "--label", "opentowork.sandbox=true",
    "--label", `opentowork.user=${userId}`,
    // Resource limits
    "--memory", SANDBOX_MEMORY,
    "--cpus", SANDBOX_CPUS,
    // Network isolation (no network by default)
    "--network", SANDBOX_NETWORK,
    // Mount entire workspaces root so all sessions are accessible
    "-v", `${workspacesRoot}:/workspaces`,
    // Mount Pi skills so bash commands can access skill scripts at their host paths
    "-v", `${PI_SKILLS_DIR}:${PI_SKILLS_DIR}:ro`,
    // Mount symlink targets so skills resolve correctly inside the container
    ...getSkillSymlinkMounts(),
    "-w", "/workspaces",
    // Security: drop all capabilities, no new privileges
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    // Keep container running
    SANDBOX_IMAGE,
    "sleep", "infinity",
  ];

  const containerId = execSync(args.join(" "), { encoding: "utf-8" }).trim();

  // Start the container
  execSync(`docker start ${containerId}`, { stdio: "ignore" });

  return containerId;
}

function findContainer(name: string): string | null {
  try {
    const id = execSync(`docker ps -aq --filter "name=^${name}$"`, {
      encoding: "utf-8",
    }).trim();
    return id || null;
  } catch {
    return null;
  }
}

function isContainerRunning(containerId: string): boolean {
  try {
    const status = execSync(
      `docker inspect -f "{{.State.Running}}" ${containerId}`,
      { encoding: "utf-8" },
    ).trim();
    return status === "true";
  } catch {
    return false;
  }
}

function startContainer(containerId: string): void {
  execSync(`docker start ${containerId}`, { stdio: "ignore" });
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
