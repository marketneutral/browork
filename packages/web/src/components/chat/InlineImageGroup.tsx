import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth";
import { useSessionStore } from "../../stores/session";
import { useFilesStore } from "../../stores/files";
import { api } from "../../api/client";

interface InlineImageGroupProps {
  paths: string[];
}

function InlineImage({ path }: { path: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const sessionId = useSessionStore((s) => s.sessionId);

  useEffect(() => {
    if (!sessionId) return;
    let revoked = false;
    const token = useAuthStore.getState().token;
    const url = api.files.download(path, sessionId);

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
  }, [path, sessionId]);

  const handleClick = () => {
    useFilesStore.getState().selectFile(path);
  };

  if (error) {
    return (
      <div className="w-48 h-32 rounded-lg bg-surface-secondary flex items-center justify-center text-xs text-foreground-tertiary">
        Failed to load
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="w-48 h-32 rounded-lg bg-surface-secondary flex items-center justify-center text-xs text-foreground-tertiary animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="block rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors cursor-pointer"
      title={path}
    >
      <img
        src={blobUrl}
        alt={path.split("/").pop() ?? "image"}
        className="max-h-[300px] max-w-full object-contain"
      />
    </button>
  );
}

export function InlineImageGroup({ paths }: InlineImageGroupProps) {
  return (
    <div className="flex flex-wrap gap-2 pl-10">
      {paths.map((p) => (
        <InlineImage key={p} path={p} />
      ))}
    </div>
  );
}
