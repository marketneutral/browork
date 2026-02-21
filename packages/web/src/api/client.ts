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
};

/**
 * Build a WebSocket URL for a session stream.
 * Uses wss:// in production, ws:// in dev.
 */
export function wsUrl(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/sessions/${sessionId}/stream`;
}
