import { create } from "zustand";
import {
  adminApi,
  type OverviewResponse,
  type AdminUserSummary,
  type ActivityResponse,
  type ToolUsageResponse,
  type SystemResponse,
} from "@/api/client";

interface AdminState {
  overview: OverviewResponse | null;
  users: AdminUserSummary[];
  activity: ActivityResponse | null;
  tools: ToolUsageResponse | null;
  system: SystemResponse | null;
  loading: Record<string, boolean>;

  fetchOverview: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchActivity: (days?: number) => Promise<void>;
  fetchTools: () => Promise<void>;
  fetchSystem: () => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  overview: null,
  users: [],
  activity: null,
  tools: null,
  system: null,
  loading: {},

  fetchOverview: async () => {
    set({ loading: { ...get().loading, overview: true } });
    try {
      const overview = await adminApi.overview();
      set({ overview });
    } finally {
      set({ loading: { ...get().loading, overview: false } });
    }
  },

  fetchUsers: async () => {
    set({ loading: { ...get().loading, users: true } });
    try {
      const users = await adminApi.users();
      set({ users });
    } finally {
      set({ loading: { ...get().loading, users: false } });
    }
  },

  fetchActivity: async (days?: number) => {
    set({ loading: { ...get().loading, activity: true } });
    try {
      const activity = await adminApi.activity(days);
      set({ activity });
    } finally {
      set({ loading: { ...get().loading, activity: false } });
    }
  },

  fetchTools: async () => {
    set({ loading: { ...get().loading, tools: true } });
    try {
      const tools = await adminApi.tools();
      set({ tools });
    } finally {
      set({ loading: { ...get().loading, tools: false } });
    }
  },

  fetchSystem: async () => {
    set({ loading: { ...get().loading, system: true } });
    try {
      const system = await adminApi.system();
      set({ system });
    } finally {
      set({ loading: { ...get().loading, system: false } });
    }
  },
}));
