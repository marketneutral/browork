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
      .catch((err) => {
        // Only logout on explicit auth rejection (401).
        // Network errors / server unavailable should not wipe the token.
        if (err.message?.includes("Session expired") || err.message?.includes("Unauthorized")) {
          logout();
        }
      })
      .finally(() => {
        setChecking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <h1 className="text-3xl text-gradient animate-pulse-glow" style={{ fontFamily: "var(--font-display)" }}>Browork</h1>
      </div>
    );
  }

  // If we have a token but no user yet, the /me call may have failed
  // due to a transient error. Show the app — API calls will retry auth.
  if (!token) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
