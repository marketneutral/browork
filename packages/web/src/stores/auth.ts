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

const TOKEN_KEY = "browork_token";
const USER_KEY = "browork_user";

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: loadUser(),

  setAuth: (user, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, token: null });
  },
}));
