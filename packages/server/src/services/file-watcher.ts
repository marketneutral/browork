import { watch, type FSWatcher } from "chokidar";
import { relative } from "path";
import type { WebSocket } from "ws";

type FileChangeListener = (paths: string[]) => void;

/**
 * Watches a directory for file changes and notifies listeners.
 * Batches rapid changes into a single notification (100ms debounce).
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private listeners = new Set<FileChangeListener>();
  private pendingPaths = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly watchDir: string,
    private readonly debounceMs = 100,
  ) {}

  start() {
    if (this.watcher) return;

    this.watcher = watch(this.watchDir, {
      ignoreInitial: true,
      // no ignore pattern — watch all files including dotfiles
      persistent: true,
    });

    const onChange = (fullPath: string) => {
      const relPath = relative(this.watchDir, fullPath);
      this.pendingPaths.add(relPath);

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const paths = Array.from(this.pendingPaths);
        this.pendingPaths.clear();
        for (const listener of this.listeners) {
          listener(paths);
        }
      }, this.debounceMs);
    };

    this.watcher.on("add", onChange);
    this.watcher.on("change", onChange);
    this.watcher.on("unlink", onChange);
    this.watcher.on("addDir", onChange);
    this.watcher.on("unlinkDir", onChange);
  }

  subscribe(listener: FileChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async stop() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.watcher?.close();
    this.watcher = null;
    this.listeners.clear();
  }
}

// Per-directory watcher map
const watchers = new Map<string, FileWatcher>();

export function getFileWatcher(watchDir: string): FileWatcher {
  let watcher = watchers.get(watchDir);
  if (!watcher) {
    watcher = new FileWatcher(watchDir);
    watcher.start();
    watchers.set(watchDir, watcher);
  }
  return watcher;
}

export async function removeFileWatcher(watchDir: string): Promise<void> {
  const watcher = watchers.get(watchDir);
  if (watcher) {
    await watcher.stop();
    watchers.delete(watchDir);
  }
}

/**
 * Wire a WebSocket to receive file change notifications.
 */
export function subscribeWsToFileChanges(
  ws: WebSocket,
  watchDir: string,
): () => void {
  const watcher = getFileWatcher(watchDir);
  return watcher.subscribe((paths) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "files_changed", paths }));
    }
  });
}
