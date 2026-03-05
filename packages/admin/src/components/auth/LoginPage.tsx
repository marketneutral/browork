import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/stores/auth";
import { adminApi } from "@/api/client";
import { Shield } from "lucide-react";

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user, token } = await adminApi.auth.login(username, password);
      if (!user.isAdmin) {
        setError("This account does not have admin access.");
        return;
      }
      setAuth(user, token);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="glass w-full max-w-sm rounded-xl p-8 animate-fade-in-up"
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <Shield className="h-10 w-10 text-primary" />
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-foreground-secondary">Sign in with your admin account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium text-foreground-secondary">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background-secondary px-4 py-2.5 text-foreground outline-none focus-glow"
          autoFocus
          required
        />

        <label className="mb-1 block text-sm font-medium text-foreground-secondary">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-border bg-background-secondary px-4 py-2.5 text-foreground outline-none focus-glow"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
