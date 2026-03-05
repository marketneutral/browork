import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth";
import { adminApi } from "@/api/client";
import { LoginPage } from "./LoginPage";
import { ShieldX } from "lucide-react";

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { token, user, setAuth, logout } = useAuthStore();
  const [checking, setChecking] = useState(!!token);

  useEffect(() => {
    if (!token) return;
    adminApi.auth
      .me()
      .then(({ user: u }) => {
        setAuth(u, token);
      })
      .catch(() => logout())
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  if (!user.isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <ShieldX className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-foreground-secondary">
          This dashboard is restricted to admin users.
        </p>
        <button
          onClick={logout}
          className="mt-4 rounded-lg bg-primary px-6 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
