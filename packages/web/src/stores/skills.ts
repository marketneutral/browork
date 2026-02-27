import { create } from "zustand";

export interface SkillMeta {
  name: string;
  description: string;
  enabled: boolean;
}

export interface McpTool {
  name: string;           // e.g. "random_number"
  qualifiedName: string;  // e.g. "mcp__test-tools__random_number"
  description: string;
  serverName: string;     // e.g. "test-tools"
}

export interface McpServerStatus {
  name: string;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  toolCount: number;
  error?: string;
}

interface SkillsState {
  skills: SkillMeta[];
  mcpTools: McpTool[];
  mcpServers: McpServerStatus[];
  /** Currently active skill (if a skill is being executed) */
  activeSkill: { skill: string; label: string } | null;

  // Actions
  setSkills: (skills: SkillMeta[]) => void;
  setMcpTools: (tools: McpTool[]) => void;
  setMcpServers: (servers: McpServerStatus[]) => void;
  setActiveSkill: (skill: string, label: string) => void;
  clearActiveSkill: () => void;
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],
  mcpTools: [],
  mcpServers: [],
  activeSkill: null,

  setSkills: (skills) => set({ skills }),
  setMcpTools: (mcpTools) => set({ mcpTools }),
  setMcpServers: (mcpServers) => set({ mcpServers }),

  setActiveSkill: (skill, label) =>
    set({ activeSkill: { skill, label } }),

  clearActiveSkill: () => set({ activeSkill: null }),
}));
