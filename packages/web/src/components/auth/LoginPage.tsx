import { useState } from "react";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { LogIn, UserPlus } from "lucide-react";

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const { user, token } = await api.auth.login(username, password);
        setAuth(user, token);
      } else {
        const { user, token } = await api.auth.register(
          username,
          displayName || username,
          password,
        );
        setAuth(user, token);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full bg-[var(--accent-start)]/20 blur-[150px] pointer-events-none animate-float animate-gradient-shift" />
      <div className="absolute bottom-1/4 -right-32 w-[400px] h-[400px] rounded-full bg-[var(--accent-end)]/15 blur-[130px] pointer-events-none animate-float-slow animate-gradient-shift" />
      <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-[var(--accent-mid)]/12 blur-[120px] pointer-events-none animate-float-slower animate-gradient-shift" />

      <div className="w-full max-w-sm mx-4 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-5xl text-gradient animate-fade-in-up" style={{ fontFamily: "var(--font-display)" }}>
            Browork
          </h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-2 animate-fade-in-up stagger-1">
            AI-powered data analysis for your team
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-strong glow-accent rounded-[var(--radius-lg)] p-6 space-y-4 animate-fade-in-up stagger-2"
        >
          <h2 className="text-lg font-semibold text-center">
            {mode === "login" ? "Sign In" : "Create Account"}
          </h2>

          {error && (
            <div className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-[var(--foreground-secondary)]">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)] text-sm focus:outline-none focus:shadow-[var(--glow-focus)] transition-shadow"
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-sm font-medium mb-1 text-[var(--foreground-secondary)]">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)] text-sm focus:outline-none focus:shadow-[var(--glow-focus)] transition-shadow"
                placeholder="How others will see you"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-[var(--foreground-secondary)]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)] text-sm focus:outline-none focus:shadow-[var(--glow-focus)] transition-shadow"
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-md text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {mode === "login" ? (
              <>
                <LogIn size={16} /> Sign In
              </>
            ) : (
              <>
                <UserPlus size={16} /> Create Account
              </>
            )}
          </button>

          <div className="text-center text-sm text-[var(--foreground-secondary)]">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                  className="text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
