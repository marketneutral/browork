import { useEffect, useCallback } from "react";
import { useFilesStore } from "../../stores/files";
import { api } from "../../api/client";
import { FileTree } from "./FileTree";
import { FileEditorPane } from "./FileEditorPane";
import { DropZone } from "./DropZone";

export function FilePanel() {
  const entries = useFilesStore((s) => s.entries);
  const openFile = useFilesStore((s) => s.openFile);
  const setEntries = useFilesStore((s) => s.setEntries);

  const refresh = useCallback(() => {
    api.files.list().then(setEntries).catch(console.error);
  }, [setEntries]);

  // Load file tree on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFileSelect = useCallback(
    async (path: string) => {
      useFilesStore.getState().selectFile(path);

      // Fetch preview to decide if editable
      try {
        const preview = await api.files.preview(path);
        if (preview.type === "text" || preview.type === "csv") {
          useFilesStore.getState().openFileForEdit(
            path,
            preview.content || JSON.stringify(preview.rows, null, 2),
            // Fetch actual modified time from the entries
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
    [entries],
  );

  const handleUpload = useCallback(
    async (files: File[]) => {
      useFilesStore.getState().setUploading(true, 0);
      try {
        await api.files.upload(files, "", (pct) => {
          useFilesStore.getState().setUploading(true, pct);
        });
        refresh();
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        useFilesStore.getState().setUploading(false);
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        await api.files.delete(path);
        if (useFilesStore.getState().openFile?.path === path) {
          useFilesStore.getState().closeFile();
        }
        refresh();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [refresh],
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
