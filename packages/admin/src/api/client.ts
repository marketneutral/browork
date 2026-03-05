import { useAuthStore } from "@/stores/auth";

const BASE = "/api";

function authHeaders(hasBody?: boolean): Record<string, string> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
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
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function authRequest<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Response types ───

export interface OverviewResponse {
  totalUsers: number;
  totalSessions: number;
  totalMessages: number;
  activeTokens: number;
  totalStorageBytes: number;
  todaySessions: number;
  todayMessages: number;
  newUsersThisWeek: number;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  sessionCount: number;
  messageCount: number;
  lastActive: string | null;
  isAdmin: boolean;
}

export interface AdminUserDetail {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  isAdmin: boolean;
  sessions: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    workspaceSizeBytes: number;
  }[];
  totals: {
    sessions: number;
    messages: number;
    storageBytes: number;
  };
}

export interface ActivityResponse {
  days: number;
  sessions: { day: string; count: number }[];
  messages: { day: string; count: number }[];
  activeUsers: { day: string; count: number }[];
  signups: { day: string; count: number }[];
}

export interface ToolUsageResponse {
  tools: { name: string; count: number; errorCount: number }[];
  totalCalls: number;
}

export interface SystemResponse {
  uptime: number;
  nodeVersion: string;
  platform: string;
  dbSizeBytes: number;
  memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
  host: {
    cpuModel: string;
    cpuCores: number;
    loadAvg: { load1: number; load5: number; load15: number };
    totalMemory: number;
    freeMemory: number;
    usedMemory: number;
    disk: { total: number; used: number; available: number; percent: number } | null;
  };
  sandbox: {
    enabled: boolean;
    dockerAvailable: boolean | null;
    imageAvailable: boolean | null;
    activeContainers: number;
  };
}

export interface ContainerStats {
  userId: string;
  containerId: string;
  name: string;
  status: string;
  cpuPercent: string;
  memUsage: string;
  memLimit: string;
  memPercent: string;
  netIO: string;
  pids: string;
  username: string | null;
  displayName: string | null;
}

export interface ContainersResponse {
  enabled: boolean;
  containers: ContainerStats[];
}

export interface PromptsResponse {
  systemMd: string | null;
  systemMdPath: string;
  appendSystemMd: string | null;
  appendSystemMdPath: string;
  assembledPrompt: string | null;
  promptError: string | null;
  builtInDefault: string | null;
}

// ─── MCP Types ───

export interface McpServerInfo {
  name: string;
  url: string;
  transport: "sse" | "streamable-http";
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  toolCount: number;
  error?: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  qualifiedName: string;
  serverName: string;
}

// ─── Skills Types ───

export interface SystemSkill {
  name: string;
  description: string;
  enabled: boolean;
  dirPath: string | null;
}

export interface UserSkillGroup {
  userId: string;
  username: string;
  displayName: string;
  skills: { name: string; description: string }[];
}

export interface SkillUsageStat {
  skill_name: string;
  count: number;
  last_used: number;
  user_count: number;
}

export interface SkillUsageResponse {
  stats: SkillUsageStat[];
  timeseries: { day: string; skill_name: string; count: number }[];
  days: number;
}

// ─── Active Sessions Types ───

export interface ActiveSessionInfo {
  sessionId: string;
  userId: string | null;
  isRunning: boolean;
  hasSocket: boolean;
  toolCallsInProgress: number;
  bufferLength: number;
  sessionName: string | null;
  createdAt: string | null;
  username: string | null;
  displayName: string | null;
}

// ─── API ───

export const adminApi = {
  auth: {
    login: (username: string, password: string) =>
      authRequest<{ user: { id: string; username: string; displayName: string; createdAt: string; isAdmin?: boolean }; token: string }>("/auth/login", { username, password }),
    me: () => request<{ user: { id: string; username: string; displayName: string; createdAt: string; isAdmin?: boolean } }>("/auth/me"),
  },
  overview: () => request<OverviewResponse>("/admin/overview"),
  users: () => request<AdminUserSummary[]>("/admin/users"),
  user: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),
  activity: (days?: number) => request<ActivityResponse>(`/admin/activity${days ? `?days=${days}` : ""}`),
  tools: () => request<ToolUsageResponse>("/admin/tools"),
  system: () => request<SystemResponse>("/admin/system"),
  containers: () => request<ContainersResponse>("/admin/containers"),
  killContainer: (userId: string) =>
    request<{ ok: boolean }>(`/admin/containers/${userId}`, { method: "DELETE" }),
  prompts: () => request<PromptsResponse>("/admin/prompts"),
  getAgentsMd: () => request<{ content: string; isCustom: boolean; defaultContent: string }>("/settings/agents-md"),
  saveDefaultAgentsMd: (content: string) =>
    request<{ ok: boolean }>("/settings/agents-md/default", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  // MCP
  mcpServers: () => request<McpServerInfo[]>("/admin/mcp/servers"),
  mcpReconnect: (name: string) =>
    request<{ ok: boolean }>(`/admin/mcp/servers/${encodeURIComponent(name)}/reconnect`, { method: "POST" }),
  mcpToggle: (name: string, enabled: boolean) =>
    request<McpServerInfo>(`/admin/mcp/servers/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  mcpTools: (name: string) =>
    request<McpToolInfo[]>(`/admin/mcp/servers/${encodeURIComponent(name)}/tools`),
  mcpAddServer: (input: { name: string; url: string; transport?: "sse" | "streamable-http"; headers?: Record<string, string> }) =>
    request<McpServerInfo>("/admin/mcp/servers", { method: "POST", body: JSON.stringify(input) }),
  mcpDeleteServer: (name: string) =>
    request<{ ok: boolean }>(`/admin/mcp/servers/${encodeURIComponent(name)}`, { method: "DELETE" }),
  // Skills
  skills: () => request<SystemSkill[]>("/admin/skills"),
  skillUsers: () => request<UserSkillGroup[]>("/admin/skills/users"),
  deleteSkill: (name: string) =>
    request<{ ok: boolean }>(`/admin/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
  skillUsage: (days?: number) =>
    request<SkillUsageResponse>(`/admin/skills/usage${days ? `?days=${days}` : ""}`),
  // Active Sessions
  activeSessions: () => request<ActiveSessionInfo[]>("/admin/sessions/active"),
  // User management
  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),
};
