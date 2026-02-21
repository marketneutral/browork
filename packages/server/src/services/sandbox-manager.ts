/**
 * Sandbox Manager — Docker container-per-user isolation
 *
 * Each user gets a Docker container with:
 *   - Python 3, pip, pandas, openpyxl, matplotlib
 *   - Node.js 20
 *   - Their workspace mounted at /workspace
 *
 * Pi agent sessions run inside these containers so that
 * `pip install`, `npm install`, bash commands, etc. are
 * fully isolated between users.
 *
 * When SANDBOX_ENABLED=true (default false), Pi sessions
 * are created inside the container. When disabled, Pi runs
 * directly on the host (development mode).
 */

import { execSync, execFile } from "child_process";
import { resolve } from "path";

const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || "browork-sandbox:latest";
const SANDBOX_MEMORY = process.env.SANDBOX_MEMORY || "512m";
const SANDBOX_CPUS = process.env.SANDBOX_CPUS || "1.0";
const SANDBOX_NETWORK = process.env.SANDBOX_NETWORK || "none";

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
 * Returns the container ID.
 */
export function ensureSandbox(userId: string, workDir: string): string {
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
  const containerId = createContainer(userId, workDir);
  containers.set(userId, containerId);
  return containerId;
}

/**
 * Execute a command inside the user's sandbox container.
 * Returns stdout. Throws on non-zero exit.
 */
export function execInSandbox(
  userId: string,
  command: string,
  timeoutMs = 120_000,
): string {
  const containerId = containers.get(userId);
  if (!containerId) {
    throw new Error(`No sandbox container for user ${userId}`);
  }

  return execSync(
    `docker exec ${containerId} /bin/bash -c ${shellEscape(command)}`,
    { timeout: timeoutMs, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
  );
}

/**
 * Execute a command inside the sandbox asynchronously.
 * Returns a promise that resolves with { stdout, stderr, exitCode }.
 */
export function execInSandboxAsync(
  userId: string,
  command: string,
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const containerId = containers.get(userId);
    if (!containerId) {
      return reject(new Error(`No sandbox container for user ${userId}`));
    }

    let stdout = "";
    let stderr = "";
    const child = execFile(
      "docker",
      ["exec", containerId, "/bin/bash", "-c", command],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (err, out, errOut) => {
        stdout = out || "";
        stderr = errOut || "";
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
      `docker ps -a --filter "label=browork.sandbox=true" --format "{{.Names}}\\t{{.ID}}\\t{{.Status}}"`,
      { encoding: "utf-8" },
    ).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [name, id, status] = line.split("\t");
      const userId = name.replace("browork-sandbox-", "");
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
      `docker rm -f $(docker ps -aq --filter "label=browork.sandbox=true") 2>/dev/null`,
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

// ── Internal helpers ──

function sandboxName(userId: string): string {
  // Sanitize userId for Docker container naming (alphanumeric + hyphens)
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
  return `browork-sandbox-${safe}`;
}

function createContainer(userId: string, workDir: string): string {
  const name = sandboxName(userId);
  const absWorkDir = resolve(workDir);

  const args = [
    "docker", "create",
    "--name", name,
    "--label", "browork.sandbox=true",
    "--label", `browork.user=${userId}`,
    // Resource limits
    "--memory", SANDBOX_MEMORY,
    "--cpus", SANDBOX_CPUS,
    // Network isolation (no network by default)
    "--network", SANDBOX_NETWORK,
    // Mount workspace
    "-v", `${absWorkDir}:/workspace`,
    "-w", "/workspace",
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
