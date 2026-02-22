import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth";
import { LoginPage } from "./LoginPage";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  // Only show a loading spinner when we have a token but no cached user
  // (first-ever load after login from a different tab, or localStorage
  // was partially cleared). If we already have both token + user from
  // localStorage, render the app immediately and validate in the background.
  const [checking, setChecking] = useState(!!token && !user);

  // On mount, validate the stored token with the server.
  // Uses a direct fetch() instead of the shared request() helper so that
  // request()'s auto-logout on 401 doesn't race with this validation.
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    fetch("/api/auth/me", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const { user: u } = await res.json();
          setAuth(u, token);
        } else if (res.status === 401) {
          // Token is genuinely invalid/expired — clear auth state
          logout();
        }
        // For other errors (500, 502, etc.), keep the current auth state.
        // The server may be temporarily unavailable.
      })
      .catch(() => {
        // Network error (server down, proxy unreachable) —
        // don't wipe auth, the token may still be valid.
      })
      .finally(() => {
        setChecking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <h1 className="text-3xl text-gradient animate-pulse" style={{ fontFamily: "var(--font-display)" }}>Browork</h1>
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
