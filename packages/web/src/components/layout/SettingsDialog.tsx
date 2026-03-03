import { useState, useEffect, useCallback } from "react";
import { X, RotateCcw } from "lucide-react";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [content, setContent] = useState("");
  const [defaultContent, setDefaultContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    api.settings.getAgentsMd().then((res) => {
      setContent(res.content);
      setDefaultContent(res.defaultContent);
      setLoading(false);
    }).catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.settings.saveAgentsMd(content);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [content, onClose]);

  const handleSaveDefault = useCallback(async () => {
    setSavingDefault(true);
    setError(null);
    try {
      await api.settings.saveDefaultAgentsMd(content);
      setDefaultSaved(true);
      setTimeout(() => setDefaultSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save default");
    } finally {
      setSavingDefault(false);
    }
  }, [content]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="max-w-2xl w-full max-h-[80vh] flex flex-col rounded-xl border border-border bg-background-secondary shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-glass-hover text-foreground-secondary hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col px-4 py-3 overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">AGENTS.md</label>
            {!loading && (
              <button
                onClick={() => setContent(defaultContent)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-surface-glass-hover text-foreground-secondary hover:text-foreground transition-colors"
                title="Revert to system default"
              >
                <RotateCcw size={12} />
                Default
              </button>
            )}
          </div>
          <p className="text-xs text-foreground-secondary mb-2">
            Project instructions written into every new session's workspace.
          </p>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-foreground-secondary text-sm">
              Loading...
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-md border border-border bg-background p-3 text-sm font-mono text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              style={{ height: "40vh" }}
              spellCheck={false}
            />
          )}

          {error && (
            <p className="text-xs text-destructive mt-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          {user?.isAdmin && (
            <button
              onClick={handleSaveDefault}
              disabled={savingDefault || loading}
              className="mr-auto px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-glass-hover text-foreground-secondary transition-colors disabled:opacity-50"
            >
              {defaultSaved ? "Saved!" : savingDefault ? "Saving..." : "Save as Default"}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-surface-glass-hover text-foreground-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
