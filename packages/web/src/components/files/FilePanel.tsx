import { useEffect, useCallback } from "react";
import { useFilesStore } from "../../stores/files";
import { useSessionStore } from "../../stores/session";
import { api } from "../../api/client";
import { FileTree } from "./FileTree";
import { FileEditorPane } from "./FileEditorPane";
import { DropZone } from "./DropZone";

export function FilePanel() {
  const entries = useFilesStore((s) => s.entries);
  const openFile = useFilesStore((s) => s.openFile);
  const setEntries = useFilesStore((s) => s.setEntries);
  const sessionId = useSessionStore((s) => s.sessionId);

  const refresh = useCallback(() => {
    if (!sessionId) return;
    api.files.list(sessionId).then(setEntries).catch(console.error);
  }, [setEntries, sessionId]);

  // Load file tree on mount and when sessionId changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!sessionId) return;
      useFilesStore.getState().selectFile(path);

      // Fetch preview to decide if editable
      try {
        const preview = await api.files.preview(path, sessionId);
        if (preview.type === "text" || preview.type === "csv") {
          useFilesStore.getState().openFileForEdit(
            path,
            preview.content || "",
            entries.find((e) => e.path === path)?.modified || "",
          );
        } else {
          // For non-editable files, open in view mode
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
    async (files: File[]) => {
      if (!sessionId) return;
      useFilesStore.getState().setUploading(true, 0);
      try {
        await api.files.upload(files, sessionId, "", (pct) => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>Files</h2>
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

      {openFile ? (
        <FileEditorPane
          onBack={() => useFilesStore.getState().closeFile()}
          onRefresh={refresh}
        />
      ) : (
        <DropZone onDrop={handleUpload}>
          <FileTree
            entries={entries}
            onSelect={handleFileSelect}
            onDelete={handleDelete}
          />
        </DropZone>
      )}
    </div>
  );
}
