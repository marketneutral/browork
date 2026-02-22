import { useAuthStore } from "../stores/auth";

const BASE = "/api";

function authHeaders(hasBody?: boolean): Record<string, string> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: authHeaders(!!init?.body),
    ...init,
  });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new AuthError("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface UserMeta {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  forkedFrom: string | null;
}

export interface SessionWithMessages extends SessionMeta {
  messages: { id: number; role: "user" | "assistant"; content: string; timestamp: number }[];
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

export interface SkillMeta {
  name: string;
  description: string;
  enabled: boolean;
}

export interface McpServerMeta {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ user: UserMeta; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    register: (username: string, displayName: string, password: string) =>
      request<{ user: UserMeta; token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, displayName, password }),
      }),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    me: () => request<{ user: UserMeta }>("/auth/me"),
  },
  skills: {
    list: () => request<SkillMeta[]>("/skills"),
    toggle: (name: string, enabled: boolean) =>
      request<SkillMeta>(`/skills/${name}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
  },
  mcp: {
    list: () => request<McpServerMeta[]>("/mcp/servers"),
    add: (server: { name: string; command: string; args?: string[]; env?: Record<string, string> }) =>
      request<McpServerMeta>("/mcp/servers", {
        method: "POST",
        body: JSON.stringify(server),
      }),
    update: (name: string, updates: { command?: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }) =>
      request<McpServerMeta>(`/mcp/servers/${name}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    delete: (name: string) =>
      request<{ ok: boolean }>(`/mcp/servers/${name}`, { method: "DELETE" }),
  },
  sessions: {
    list: () => request<SessionMeta[]>("/sessions"),
    create: () => request<SessionMeta>("/sessions", { method: "POST" }),
    get: (id: string) => request<SessionWithMessages>(`/sessions/${id}`),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" }),
    rename: (id: string, name: string) =>
      request<SessionMeta>(`/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    fork: (id: string) =>
      request<SessionMeta>(`/sessions/${id}/fork`, { method: "POST" }),
  },
  files: {
    list: (sessionId: string) => request<FileEntry[]>(`/files?sessionId=${sessionId}`),
    download: (path: string, sessionId: string) =>
      `${BASE}/files/${path}?sessionId=${sessionId}`,
    preview: (path: string, sessionId: string) =>
      request<FilePreview>(`/files-preview/${path}?sessionId=${sessionId}`),
    save: (path: string, content: string, sessionId: string, lastModified?: string) =>
      request<{ ok: boolean; modified: string }>(`/files/${path}?sessionId=${sessionId}`, {
        method: "PUT",
        body: JSON.stringify({ content, lastModified }),
      }),
    delete: (path: string, sessionId: string, force?: boolean) =>
      request<{ ok: boolean }>(
        `/files/${path}?sessionId=${sessionId}${force ? "&force=true" : ""}`,
        { method: "DELETE" },
      ),
    mkdir: (path: string, sessionId: string) =>
      request<{ ok: boolean }>(`/files/mkdir?sessionId=${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    move: (from: string, to: string, sessionId: string) =>
      request<{ ok: boolean }>(`/files/move?sessionId=${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ from, to }),
      }),
    exportZip: (sessionId: string) =>
      `${BASE}/files-export?sessionId=${sessionId}`,
    upload: async (
      files: File[],
      sessionId: string,
      targetPath = "",
      onProgress?: (pct: number) => void,
    ) => {
      const formData = new FormData();
      formData.append("path", targetPath);
      for (const file of files) {
        formData.append("file", file);
      }
      const token = useAuthStore.getState().token;
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
        xhr.open("POST", `${BASE}/files/upload?sessionId=${sessionId}`);
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.send(formData);
      });
    },
  },
};

/**
 * Build a WebSocket URL for a session stream.
 * Includes auth token as query parameter.
 */
export function wsUrl(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = useAuthStore.getState().token;
  const params = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}/api/sessions/${sessionId}/stream${params}`;
}
