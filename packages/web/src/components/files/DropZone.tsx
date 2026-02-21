import { useState, useCallback, type DragEvent, type ReactNode } from "react";
import { useFilesStore } from "../../stores/files";

interface DropZoneProps {
  onDrop: (files: File[]) => void;
  children: ReactNode;
}

export function DropZone({ onDrop, children }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const uploading = useFilesStore((s) => s.uploading);
  const uploadProgress = useFilesStore((s) => s.uploadProgress);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onDrop(files);
    },
    [onDrop],
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
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-10">
          <p className="text-sm text-blue-600 font-medium">
            Drop files to upload
          </p>
        </div>
      )}

      {uploading && (
        <div className="absolute bottom-0 left-0 right-0 bg-[var(--muted)] border-t border-[var(--border)] p-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Uploading... {uploadProgress}%</span>
          </div>
          <div className="mt-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
