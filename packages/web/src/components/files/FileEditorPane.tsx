import { useCallback, useEffect, useRef } from "react";
import { useFilesStore, type SaveStatus } from "../../stores/files";
import { useSessionStore } from "../../stores/session";
import { api } from "../../api/client";
import { CodeEditor } from "./editors/CodeEditor";
import { MarkdownEditor } from "./editors/MarkdownEditor";
import { CsvEditor } from "./editors/CsvEditor";
import { ImageViewer } from "./viewers/ImageViewer";
import { PdfViewer } from "./viewers/PdfViewer";

interface FileEditorPaneProps {
  onBack: () => void;
  onRefresh: () => void;
}

function extOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "";
}

export function FileEditorPane({ onBack, onRefresh }: FileEditorPaneProps) {
  const openFile = useFilesStore((s) => s.openFile);
  const saveStatus = useFilesStore((s) => s.saveStatus);
  const updateContent = useFilesStore((s) => s.updateOpenFileContent);
  const sessionId = useSessionStore((s) => s.sessionId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(async () => {
    const file = useFilesStore.getState().openFile;
    const sid = useSessionStore.getState().sessionId;
    if (!file || !file.dirty || !sid) return;

    useFilesStore.getState().setSaveStatus("saving");
    try {
      const result = await api.files.save(
        file.path,
        file.content,
        sid,
        file.lastModified,
      );
      useFilesStore.getState().markSaved(result.modified);
      onRefresh();
    } catch (err: any) {
      if (err.message?.includes("409") || err.message?.includes("modified externally")) {
        useFilesStore.getState().setSaveStatus("conflict");
      } else {
        console.error("Save failed:", err);
        useFilesStore.getState().setSaveStatus("unsaved");
      }
    }
  }, [onRefresh]);

  // Auto-save: 2 seconds after last edit
  const handleChange = useCallback(
    (content: string) => {
      updateContent(content);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(save, 2000);
    },
    [updateContent, save],
  );

  // Save on blur
  useEffect(() => {
    const handleBlur = () => save();
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [save]);

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!openFile) return null;

  const ext = extOf(openFile.path);
  const fileName = openFile.path.split("/").pop() || openFile.path;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </button>
        <span className="text-xs font-medium truncate flex-1">{fileName}</span>
        <SaveIndicator status={saveStatus} />
        <a
          href={sessionId ? api.files.download(openFile.path, sessionId) : "#"}
          download
          className="text-[10px] text-primary hover:underline"
        >
          Download
        </a>
      </div>

      {/* Editor/viewer area */}
      <div className="flex-1 overflow-hidden">
        {isImage(ext) && sessionId && (
          <ImageViewer url={api.files.download(openFile.path, sessionId)} />
        )}
        {ext === "pdf" && sessionId && (
          <PdfViewer url={api.files.download(openFile.path, sessionId)} />
        )}
        {ext === "csv" && (
          <CsvEditor content={openFile.content} onChange={handleChange} />
        )}
        {ext === "md" && (
          <MarkdownEditor content={openFile.content} onChange={handleChange} />
        )}
        {isCodeEditable(ext) && (
          <CodeEditor
            content={openFile.content}
            onChange={handleChange}
            language={langFromExt(ext)}
          />
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const styles: Record<SaveStatus, { text: string; color: string }> = {
    idle: { text: "", color: "" },
    saved: { text: "Saved", color: "text-success" },
    saving: { text: "Saving...", color: "text-warning" },
    unsaved: { text: "Unsaved", color: "text-warning" },
    conflict: { text: "Conflict!", color: "text-destructive" },
  };
  const s = styles[status];
  if (!s.text) return null;
  return <span className={`text-[10px] ${s.color}`}>{s.text}</span>;
}

function isImage(ext: string) {
  return ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);
}

function isCodeEditable(ext: string) {
  return ["json", "txt", "yaml", "yml", "ts", "js", "py", "html", "css", "xml", "toml", "ini", "sh", "sql"].includes(ext);
}

function langFromExt(ext: string): string {
  const map: Record<string, string> = {
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    ts: "typescript",
    js: "javascript",
    py: "python",
    html: "html",
    css: "css",
    xml: "xml",
    sql: "sql",
    sh: "shell",
    md: "markdown",
  };
  return map[ext] || "text";
}
