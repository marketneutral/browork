import { useEffect, useCallback, useRef, useState } from "react";
import { FolderPlus, FilePlus, Download } from "lucide-react";
import type { TreeApi } from "react-arborist";
import { useFilesStore } from "../../stores/files";
import { useSessionStore } from "../../stores/session";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../api/client";
import { FileTree, FileIcon } from "./FileTree";
import { FileEditorPane } from "./FileEditorPane";
import { DropZone, type FileWithPath } from "./DropZone";

export function FilePanel() {
  const entries = useFilesStore((s) => s.entries);
  const openFile = useFilesStore((s) => s.openFile);
  const setEntries = useFilesStore((s) => s.setEntries);
  const saveTreeState = useFilesStore((s) => s.saveTreeState);
  const sessionId = useSessionStore((s) => s.sessionId);
  const initialOpenState = useFilesStore((s) =>
    sessionId ? s.treeOpenState[sessionId] : undefined,
  );

  const treeRef = useRef<TreeApi<any> | null | undefined>(null);
  const prevSessionRef = useRef<string | null>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const folderUploadTargetRef = useRef<string>("");
  const [creatingIn, setCreatingIn] = useState<{ parentPath: string; type: "folder" | "file" } | null>(null);
  const [confirmingDirDelete, setConfirmingDirDelete] = useState<{ path: string; childCount: number } | null>(null);

  const refresh = useCallback(() => {
    if (!sessionId) return;
    api.files.list(sessionId).then(setEntries).catch(console.error);
  }, [setEntries, sessionId]);

  // Load file tree on mount and when sessionId changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Save tree open state when switching sessions
  useEffect(() => {
    const prev = prevSessionRef.current;
    if (prev && prev !== sessionId && treeRef.current) {
      saveTreeState(prev, treeRef.current.openState);
    }
    prevSessionRef.current = sessionId;
  }, [sessionId, saveTreeState]);

  // Save tree open state on every toggle so it's always current
  const handleTreeToggle = useCallback(
    (_id: string) => {
      if (sessionId && treeRef.current) {
        saveTreeState(sessionId, treeRef.current.openState);
      }
    },
    [sessionId, saveTreeState],
  );

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!sessionId) return;
      useFilesStore.getState().selectFile(path);

      try {
        const preview = await api.files.preview(path, sessionId);
        if (preview.type === "text" || preview.type === "csv") {
          useFilesStore.getState().openFileForEdit(
            path,
            preview.content || "",
            entries.find((e) => e.path === path)?.modified || "",
          );
        } else {
          useFilesStore.getState().openFileForEdit(
            path,
            "",
            entries.find((e) => e.path === path)?.modified || "",
          );
        }
      } catch {
        console.error("Failed to load file preview");
      }
    },
    [entries, sessionId],
  );

  const handleUpload = useCallback(
    async (files: File[], targetPath = "") => {
      if (!sessionId) return;
      useFilesStore.getState().setUploading(true, 0);
      try {
        await api.files.upload(files, sessionId, targetPath, (pct) => {
          useFilesStore.getState().setUploading(true, pct);
        });
        refresh();
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        useFilesStore.getState().setUploading(false);
      }
    },
    [refresh, sessionId],
  );

  const handleDrop = useCallback(
    async (items: FileWithPath[]) => {
      if (!sessionId || items.length === 0) return;

      // Group files by their directory path so each batch uses one targetPath
      const groups = new Map<string, File[]>();
      for (const { file, dirPath } of items) {
        const existing = groups.get(dirPath);
        if (existing) {
          existing.push(file);
        } else {
          groups.set(dirPath, [file]);
        }
      }

      useFilesStore.getState().setUploading(true, 0);
      try {
        const groupEntries = [...groups.entries()];
        for (let i = 0; i < groupEntries.length; i++) {
          const [dirPath, files] = groupEntries[i];
          await api.files.upload(files, sessionId, dirPath, (pct) => {
            // Approximate overall progress across groups
            const groupProgress = (i / groupEntries.length) * 100;
            const withinGroup = (pct / groupEntries.length);
            useFilesStore.getState().setUploading(true, Math.round(groupProgress + withinGroup));
          });
        }
        refresh();
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        useFilesStore.getState().setUploading(false);
      }
    },
    [refresh, sessionId],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!sessionId) return;
      try {
        await api.files.delete(path, sessionId);
        if (useFilesStore.getState().openFile?.path === path) {
          useFilesStore.getState().closeFile();
        }
        refresh();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [refresh, sessionId],
  );

  const handleDeleteDir = useCallback(
    async (path: string) => {
      if (!sessionId) return;
      try {
        await api.files.delete(path, sessionId);
        refresh();
      } catch (err: any) {
        // 409 = non-empty directory — show inline confirmation
        if (err.message?.includes("not empty")) {
          setConfirmingDirDelete({ path, childCount: 0 });
        } else {
          console.error("Delete folder failed:", err);
        }
      }
    },
    [refresh, sessionId],
  );

  const handleForceDeleteDir = useCallback(
    async () => {
      if (!sessionId || !confirmingDirDelete) return;
      try {
        await api.files.delete(confirmingDirDelete.path, sessionId, true);
        refresh();
      } catch (err) {
        console.error("Force delete failed:", err);
      } finally {
        setConfirmingDirDelete(null);
      }
    },
    [refresh, sessionId, confirmingDirDelete],
  );

  const handleUploadToFolder = useCallback(
    (parentPath: string) => {
      folderUploadTargetRef.current = parentPath;
      folderUploadRef.current?.click();
    },
    [],
  );

  const handleCreateFolder = useCallback(
    (parentPath: string) => {
      setCreatingIn({ parentPath, type: "folder" });
    },
    [],
  );

  const handleCreateFile = useCallback(
    (parentPath: string) => {
      setCreatingIn({ parentPath, type: "file" });
    },
    [],
  );

  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (!sessionId || !creatingIn) return;
      const fullPath = creatingIn.parentPath ? `${creatingIn.parentPath}/${name}` : name;
      try {
        if (creatingIn.type === "folder") {
          await api.files.mkdir(fullPath, sessionId);
        } else {
          await api.files.save(fullPath, "", sessionId);
        }
        refresh();
        if (creatingIn.type === "file") {
          setTimeout(() => handleFileSelect(fullPath), 200);
        }
      } catch (err) {
        console.error("Create failed:", err);
      } finally {
        setCreatingIn(null);
      }
    },
    [sessionId, creatingIn, refresh, handleFileSelect],
  );

  const handleMove = useCallback(
    async (from: string, to: string) => {
      if (!sessionId) return;
      try {
        await api.files.move(from, to, sessionId);
        refresh();
      } catch (err) {
        console.error("Move failed:", err);
      }
    },
    [refresh, sessionId],
  );

  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      if (!sessionId) return;

      const lastSlash = oldPath.lastIndexOf("/");
      const newPath = lastSlash > 0
        ? `${oldPath.slice(0, lastSlash)}/${newName}`
        : newName;

      if (oldPath === newPath) return;

      try {
        await api.files.move(oldPath, newPath, sessionId);
        // If the renamed file was open in the editor, reopen at new path
        const openFilePath = useFilesStore.getState().openFile?.path;
        if (openFilePath === oldPath) {
          useFilesStore.getState().closeFile();
          setTimeout(() => handleFileSelect(newPath), 200);
        }
        refresh();
      } catch (err) {
        console.error("Rename failed:", err);
      }
    },
    [refresh, sessionId, handleFileSelect],
  );

  const handleDownload = useCallback(
    async (path: string) => {
      if (!sessionId) return;
      try {
        const token = useAuthStore.getState().token;
        const res = await fetch(api.files.download(path, sessionId), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = path.split("/").pop() || path;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        console.error("Download failed:", err);
      }
    },
    [sessionId],
  );

  const handleExportZip = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(api.files.exportZip(sessionId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "workspace.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>Session Files</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCreateFolder("")}
            className="text-muted-foreground hover:text-foreground"
            title="New folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleCreateFile("")}
            className="text-muted-foreground hover:text-foreground"
            title="New file"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          {entries.length > 0 && (
            <button
              onClick={handleExportZip}
              className="text-muted-foreground hover:text-foreground"
              title="Download all as zip"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          <label className="text-xs text-primary cursor-pointer hover:underline">
            Upload
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) handleUpload(files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {/* Hidden file input for folder-targeted uploads */}
      <input
        ref={folderUploadRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) handleUpload(files, folderUploadTargetRef.current);
          e.target.value = "";
        }}
      />

      {creatingIn && (
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <FileIcon name={creatingIn.type === "folder" ? "" : "file"} isDir={creatingIn.type === "folder"} />
          <InlineNameInput
            placeholder={creatingIn.type === "folder" ? "folder name" : "file name"}
            onSubmit={handleCreateSubmit}
            onCancel={() => setCreatingIn(null)}
          />
          {creatingIn.parentPath && (
            <span className="text-[10px] text-muted-foreground truncate shrink-0">
              in {creatingIn.parentPath}
            </span>
          )}
        </div>
      )}

      {confirmingDirDelete && (
        <div className="px-3 py-2 border-b border-border bg-destructive/5 flex items-center gap-2">
          <span className="text-xs text-destructive truncate flex-1">
            Folder "{confirmingDirDelete.path.split("/").pop()}" is not empty. Delete all contents?
          </span>
          <button
            onClick={handleForceDeleteDir}
            className="text-[10px] font-medium text-destructive hover:underline px-1 shrink-0"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmingDirDelete(null)}
            className="text-[10px] font-medium text-muted-foreground hover:underline px-1 shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {openFile ? (
        <FileEditorPane
          onBack={() => useFilesStore.getState().closeFile()}
          onRefresh={refresh}
        />
      ) : (
        <DropZone onDrop={handleDrop}>
          <FileTree
            entries={entries}
            onSelect={handleFileSelect}
            onDelete={handleDelete}
            onDeleteDir={handleDeleteDir}
            onDownload={handleDownload}
            onUploadToFolder={handleUploadToFolder}
            onCreateFolder={handleCreateFolder}
            onCreateFile={handleCreateFile}
            onMove={handleMove}
            onRename={handleRename}
            treeRef={treeRef}
            initialOpenState={initialOpenState}
            onToggle={handleTreeToggle}
          />
        </DropZone>
      )}
    </div>
  );
}

function InlineNameInput({
  placeholder,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="flex-1 text-xs bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onSubmit(trimmed);
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      onBlur={onCancel}
    />
  );
}
