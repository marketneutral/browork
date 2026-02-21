import { useMemo } from "react";
import type { FileEntry } from "../../stores/files";

interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  children?: TreeNode[];
}

interface FileTreeProps {
  entries: FileEntry[];
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}

/**
 * Simple file tree built from flat entries.
 * Phase 2 uses a lightweight custom tree; react-arborist can be swapped in later
 * if virtualization is needed for large directories.
 */
export function FileTree({ entries, onSelect, onDelete }: FileTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries]);

  if (tree.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-[var(--muted-foreground)]">
        No files yet. Upload or drop files here.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 text-sm">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  onSelect,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const isDir = node.type === "directory";
  const icon = isDir ? "\u{1F4C1}" : fileIcon(node.name);

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[var(--accent)] cursor-pointer group"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        onClick={() => !isDir && onSelect(node.path)}
      >
        <span className="text-xs shrink-0">{icon}</span>
        <span className="truncate flex-1 text-xs">{node.name}</span>
        {!isDir && (
          <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
            {formatSize(node.size)}
          </span>
        )}
        {!isDir && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.path);
            }}
            className="text-[10px] text-[var(--destructive)] opacity-0 group-hover:opacity-100 shrink-0"
            title="Delete"
          >
            x
          </button>
        )}
      </div>
      {isDir &&
        node.children?.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

function buildTree(entries: FileEntry[]): TreeNode[] {
  const dirs = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Sort so directories come first, then files
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of sorted) {
    const node: TreeNode = {
      id: entry.path,
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      children: entry.type === "directory" ? [] : undefined,
    };

    if (entry.type === "directory") {
      dirs.set(entry.path, node);
    }

    // Find parent directory
    const lastSlash = entry.path.lastIndexOf("/");
    if (lastSlash > 0) {
      const parentPath = entry.path.slice(0, lastSlash);
      const parent = dirs.get(parentPath);
      if (parent) {
        parent.children!.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "csv":
    case "xlsx":
    case "xls":
      return "\u{1F4CA}";
    case "json":
    case "yaml":
    case "yml":
      return "\u{1F4CB}";
    case "md":
      return "\u{1F4DD}";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return "\u{1F5BC}";
    case "pdf":
      return "\u{1F4C4}";
    default:
      return "\u{1F4C4}";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
