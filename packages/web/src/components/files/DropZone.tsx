import { useState, useCallback, type DragEvent, type ReactNode } from "react";
import { useFilesStore } from "../../stores/files";

export interface FileWithPath {
  file: File;
  /** Relative directory path, e.g. "myfolder/sub". Empty string for root. */
  dirPath: string;
}

interface DropZoneProps {
  onDrop: (files: FileWithPath[]) => void;
  children: ReactNode;
}

export function DropZone({ onDrop, children }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const uploading = useFilesStore((s) => s.uploading);
  const uploadProgress = useFilesStore((s) => s.uploadProgress);

  /** Only respond to external (OS) file drops, not internal react-dnd drags */
  const isExternalFileDrag = useCallback((e: DragEvent) => {
    return e.dataTransfer.types.includes("Files");
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    setDragOver(true);
  }, [isExternalFileDrag]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    setDragOver(false);
  }, [isExternalFileDrag]);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      setDragOver(false);

      const items = e.dataTransfer.items;
      if (!items || items.length === 0) return;

      // Try webkitGetAsEntry for directory support
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      if (entries.length > 0) {
        const collected: FileWithPath[] = [];
        await Promise.all(
          entries.map((entry) => walkEntry(entry, "", collected)),
        );
        if (collected.length > 0) onDrop(collected);
      } else {
        // Fallback: plain files
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          onDrop(files.map((file) => ({ file, dirPath: "" })));
        }
      }
    },
    [onDrop, isExternalFileDrag],
  );

  return (
    <div
      className="flex-1 flex flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {dragOver && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
          <p className="text-sm text-primary font-medium">
            Drop files or folders to upload
          </p>
        </div>
      )}

      {uploading && (
        <div className="absolute bottom-0 left-0 right-0 bg-background-secondary border-t border-border p-2">
          <div className="flex items-center gap-2 text-xs text-foreground-secondary">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Uploading... {uploadProgress}%</span>
          </div>
          <div className="mt-1 h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Recursively walk a FileSystemEntry, collecting files with their relative dir paths. */
async function walkEntry(
  entry: FileSystemEntry,
  parentPath: string,
  out: FileWithPath[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    out.push({ file, dirPath: parentPath });
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const dirPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    // readEntries may return results in batches — keep reading until empty
    let batch: FileSystemEntry[];
    do {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirReader.readEntries(resolve, reject);
      });
      await Promise.all(batch.map((child) => walkEntry(child, dirPath, out)));
    } while (batch.length > 0);
  }
}
