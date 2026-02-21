const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "file" | "directory";
}

export interface FilePreview {
  type: "csv" | "text" | "image" | "pdf" | "binary";
  content?: string;
  headers?: string[];
  rows?: Record<string, string>[];
  totalRows?: number;
  url?: string;
  message?: string;
}

export const api = {
  sessions: {
    list: () => request<SessionMeta[]>("/sessions"),
    create: () => request<SessionMeta>("/sessions", { method: "POST" }),
    get: (id: string) => request<SessionMeta>(`/sessions/${id}`),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" }),
    rename: (id: string, name: string) =>
      request<SessionMeta>(`/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
  },
  files: {
    list: () => request<FileEntry[]>("/files"),
    download: (path: string) => `${BASE}/files/${path}`,
    preview: (path: string) => request<FilePreview>(`/files-preview/${path}`),
    save: (path: string, content: string, lastModified?: string) =>
      request<{ ok: boolean; modified: string }>(`/files/${path}`, {
        method: "PUT",
        body: JSON.stringify({ content, lastModified }),
      }),
    delete: (path: string) =>
      request<{ ok: boolean }>(`/files/${path}`, { method: "DELETE" }),
    upload: async (
      files: File[],
      targetPath = "",
      onProgress?: (pct: number) => void,
    ) => {
      const formData = new FormData();
      formData.append("path", targetPath);
      for (const file of files) {
        formData.append("file", file);
      }
      const xhr = new XMLHttpRequest();
      return new Promise<{ uploaded: string[] }>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("POST", `${BASE}/files/upload`);
        xhr.send(formData);
      });
    },
  },
};

/**
 * Build a WebSocket URL for a session stream.
 * Uses wss:// in production, ws:// in dev.
 */
export function wsUrl(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/sessions/${sessionId}/stream`;
}
