import { useState, useEffect, useCallback } from "react";
import { X, RotateCcw } from "lucide-react";
import { api } from "@/api/client";

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [userContent, setUserContent] = useState("");
  const [systemDefault, setSystemDefault] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings.getAgentsMd().then((res) => {
      setUserContent(res.userContent);
      setSystemDefault(res.systemDefault);
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
      await api.settings.saveAgentsMd(userContent);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [userContent, onClose]);

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
        <div className="flex-1 min-h-0 flex flex-col px-4 py-3 overflow-y-auto">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-foreground-secondary text-sm">
              Loading...
            </div>
          ) : (
            <>
              {/* System default (read-only) */}
              <label className="text-sm font-medium mb-1">System Default</label>
              <p className="text-xs text-foreground-secondary mb-2">
                Set by your administrator. Applied to every new session.
              </p>
              <textarea
                value={systemDefault}
                readOnly
                className="w-full rounded-md border border-border bg-background/50 p-3 text-sm font-mono text-foreground-secondary resize-none cursor-default"
                style={{ height: "16vh" }}
                spellCheck={false}
              />

              {/* User additions */}
              <div className="flex items-center justify-between mt-4 mb-1">
                <label className="text-sm font-medium">Your Additions</label>
                {userContent && (
                  <button
                    onClick={() => setUserContent("")}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-surface-glass-hover text-foreground-secondary hover:text-foreground transition-colors"
                    title="Clear your additions"
                  >
                    <RotateCcw size={12} />
                    Clear
                  </button>
                )}
              </div>
              <p className="text-xs text-foreground-secondary mb-2">
                Your custom instructions, appended after the system default in every new session.
              </p>
              <textarea
                value={userContent}
                onChange={(e) => setUserContent(e.target.value)}
                placeholder="Add your custom instructions here..."
                className="w-full rounded-md border border-border bg-background p-3 text-sm font-mono text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                style={{ height: "24vh" }}
                spellCheck={false}
              />
            </>
          )}

          {error && (
            <p className="text-xs text-destructive mt-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
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
