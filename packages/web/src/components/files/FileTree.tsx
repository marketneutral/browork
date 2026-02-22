import { useMemo, useRef, useState, useCallback } from "react";
import { Tree, type NodeRendererProps, type TreeApi } from "react-arborist";
import {
  ChevronRight,
  ChevronDown,
  FolderPlus,
  FilePlus,
  Upload,
  Trash2,
} from "lucide-react";
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
  onDeleteDir: (path: string) => void;
  onUploadToFolder: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onMove: (from: string, to: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  treeRef?: React.MutableRefObject<TreeApi<TreeNode> | null | undefined>;
}

export function FileTree({
  entries,
  onSelect,
  onDelete,
  onDeleteDir,
  onUploadToFolder,
  onCreateFolder,
  onCreateFile,
  onMove,
  onRename,
  treeRef,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    ({
      dragIds,
      parentId,
    }: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      for (const dragId of dragIds) {
        const fileName = dragId.split("/").pop() || dragId;
        const newPath = parentId ? `${parentId}/${fileName}` : fileName;
        if (dragId !== newPath) {
          onMove(dragId, newPath);
        }
      }
    },
    [onMove],
  );

  const handleRename = useCallback(
    ({ id, name }: { id: string; name: string; node: unknown }) => {
      onRename(id, name);
    },
    [onRename],
  );

  const handleActivate = useCallback(
    (node: { data: TreeNode; isInternal: boolean }) => {
      if (!node.isInternal) {
        onSelect(node.data.path);
      }
    },
    [onSelect],
  );

  if (tree.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-muted-foreground">
        No files yet. Upload or drop files here.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <AutoSizedTree
        data={tree}
        containerRef={containerRef}
        treeRef={treeRef}
        onMove={handleMove}
        onRename={handleRename}
        onActivate={handleActivate}
        onSelect={onSelect}
        onDelete={onDelete}
        onDeleteDir={onDeleteDir}
        onUploadToFolder={onUploadToFolder}
        onCreateFolder={onCreateFolder}
        onCreateFile={onCreateFile}
      />
    </div>
  );
}

/** Wrapper that measures container and renders Tree at full size */
function AutoSizedTree({
  data,
  containerRef,
  treeRef,
  onMove,
  onRename,
  onActivate,
  onSelect,
  onDelete,
  onDeleteDir,
  onUploadToFolder,
  onCreateFolder,
  onCreateFile,
}: {
  data: TreeNode[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  treeRef?: React.MutableRefObject<TreeApi<TreeNode> | null | undefined>;
  onMove: (args: { dragIds: string[]; parentId: string | null; index: number }) => void;
  onRename: (args: { id: string; name: string; node: unknown }) => void;
  onActivate: (node: { data: TreeNode; isInternal: boolean }) => void;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteDir: (path: string) => void;
  onUploadToFolder: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
}) {
  const localRef = useRef<TreeApi<TreeNode> | null>(null);

  const setRef = useCallback(
    (api: TreeApi<TreeNode> | null | undefined) => {
      localRef.current = api ?? null;
      if (treeRef) treeRef.current = api;
    },
    [treeRef],
  );

  return (
    <Tree<TreeNode>
      ref={setRef}
      data={data}
      openByDefault
      width="100%"
      height={containerRef.current?.clientHeight || 600}
      rowHeight={28}
      indent={16}
      onMove={onMove}
      onRename={onRename}
      onActivate={onActivate}
      disableMultiSelection
      selectionFollowsFocus={false}
    >
      {(props) => (
        <Node
          {...props}
          onSelect={onSelect}
          onDelete={onDelete}
          onDeleteDir={onDeleteDir}
          onUploadToFolder={onUploadToFolder}
          onCreateFolder={onCreateFolder}
          onCreateFile={onCreateFile}
        />
      )}
    </Tree>
  );
}

function Node({
  node,
  style,
  dragHandle,
  onSelect,
  onDelete,
  onDeleteDir,
  onUploadToFolder,
  onCreateFolder,
  onCreateFile,
}: NodeRendererProps<TreeNode> & {
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteDir: (path: string) => void;
  onUploadToFolder: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
}) {
  const isDir = node.isInternal;
  const data = node.data;
  const [confirming, setConfirming] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Delay single-click action so double-click can cancel it
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        if (isDir) {
          node.toggle();
        } else {
          onSelect(data.path);
        }
      }, 250);
    },
    [isDir, node, onSelect, data.path],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Cancel the pending single-click action
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      node.edit();
    },
    [node],
  );

  // Show inline "Delete? Yes / No" for files
  if (confirming) {
    return (
      <div
        style={style}
        className="flex items-center gap-1.5 px-1.5 rounded bg-destructive/10"
      >
        <span className="w-3 shrink-0" />
        <span className="text-xs truncate flex-1 text-destructive">Delete "{data.name}"?</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(data.path); }}
          className="text-[10px] font-medium text-destructive hover:underline px-1"
        >
          Yes
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
          className="text-[10px] font-medium text-muted-foreground hover:underline px-1"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1.5 px-1.5 rounded cursor-pointer group ${
        node.isSelected ? "bg-surface-glass-hover" : "hover:bg-surface-glass-hover"
      }`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {isDir && (
        <span className="shrink-0 text-muted-foreground">
          {node.isOpen ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </span>
      )}
      {!isDir && <span className="w-3 shrink-0" />}

      {node.isEditing ? (
        <InlineInput
          defaultValue={data.name}
          onSubmit={(value) => node.submit(value)}
          onCancel={() => node.reset()}
        />
      ) : (
        <>
          <span className="text-xs shrink-0">
            {isDir ? "\u{1F4C1}" : fileIcon(data.name)}
          </span>
          <span className="truncate flex-1 text-xs">{data.name}</span>
          {!isDir && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatSize(data.size)}
            </span>
          )}
          {isDir && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFolder(data.path);
                }}
                className="p-0.5 text-muted-foreground hover:text-foreground"
                title="New folder"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFile(data.path);
                }}
                className="p-0.5 text-muted-foreground hover:text-foreground"
                title="New file"
              >
                <FilePlus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUploadToFolder(data.path);
                }}
                className="p-0.5 text-muted-foreground hover:text-foreground"
                title="Upload here"
              >
                <Upload className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDir(data.path);
                }}
                className="p-0.5 text-destructive hover:text-destructive"
                title="Delete folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          )}
          {!isDir && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="p-0.5 text-destructive opacity-0 group-hover:opacity-100 shrink-0"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function InlineInput({
  defaultValue,
  onSubmit,
  onCancel,
}: {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={(el) => {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        if (el) {
          el.focus();
          // Select filename without extension for files
          const dotIdx = defaultValue.lastIndexOf(".");
          if (dotIdx > 0) {
            el.setSelectionRange(0, dotIdx);
          } else {
            el.select();
          }
        }
      }}
      defaultValue={defaultValue}
      className="flex-1 text-xs bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:border-primary"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const trimmed = (e.target as HTMLInputElement).value.trim();
          if (trimmed) onSubmit(trimmed);
          else onCancel();
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={(e) => {
        const trimmed = e.target.value.trim();
        if (trimmed && trimmed !== defaultValue) {
          onSubmit(trimmed);
        } else {
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
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
