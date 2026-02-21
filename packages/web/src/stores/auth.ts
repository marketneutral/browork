import { create } from "zustand";

export interface User {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

interface AuthState {
  token: string | null;
  user: User | null;

  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

const STORAGE_KEY = "browork_token";

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(STORAGE_KEY),
  user: null,

  setAuth: (user, token) => {
    localStorage.setItem(STORAGE_KEY, token);
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ user: null, token: null });
  },
}));
