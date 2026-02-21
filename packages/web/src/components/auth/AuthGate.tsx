import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth";
import { api } from "../../api/client";
import { LoginPage } from "./LoginPage";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(!!token);

  // On mount, validate the stored token
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    api.auth
      .me()
      .then(({ user: u }) => {
        setAuth(u, token);
      })
      .catch(() => {
        logout();
      })
      .finally(() => {
        setChecking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-[var(--muted-foreground)] text-sm">Loading...</div>
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
