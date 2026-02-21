interface ImageViewerProps {
  url: string;
}

export function ImageViewer({ url }: ImageViewerProps) {
  return (
    <div className="h-full flex items-center justify-center p-4 overflow-auto bg-[var(--muted)]">
      <img
        src={url}
        alt="Preview"
        className="max-w-full max-h-full object-contain rounded shadow"
      />
    </div>
  );
}
