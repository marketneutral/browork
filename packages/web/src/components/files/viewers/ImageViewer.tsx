import { useEffect, useState } from "react";
import { useAuthStore } from "../../../stores/auth";

interface ImageViewerProps {
  url: string;
}

export function ImageViewer({ url }: ImageViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    const token = useAuthStore.getState().token;

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!revoked) setError(true);
      });

    return () => {
      revoked = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [url]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-foreground-tertiary">
        Failed to load image
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-foreground-tertiary">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-4 overflow-auto bg-muted">
      <img
        src={blobUrl}
        alt="Preview"
        className="max-w-full max-h-full object-contain rounded shadow"
      />
    </div>
  );
}
