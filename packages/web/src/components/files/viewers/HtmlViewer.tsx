import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../../../stores/auth";

interface HtmlViewerProps {
  /** Direct download URL for the HTML file */
  url: string;
}

/**
 * Renders HTML files in a sandboxed iframe.
 * Uses a blob URL so the iframe gets its own origin — anchor links
 * (e.g. Quarto TOC) navigate within the iframe instead of the parent.
 */
export function HtmlViewer({ url }: HtmlViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const prevBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = useAuthStore.getState().token;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        // Revoke previous blob URL
        if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = objectUrl;
      })
      .catch((err) => {
        console.error("Failed to load HTML preview:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-foreground-secondary">
        Failed to load HTML file
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-foreground-secondary">
        Loading...
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      sandbox="allow-scripts allow-same-origin"
      title="HTML Preview"
      className="w-full h-full border-0 bg-white"
    />
  );
}
