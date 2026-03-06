import { useState, useEffect } from "react";
import { adminApi, type PromptsResponse } from "@/api/client";
import { FileText, Check, RotateCcw, Terminal, ChevronDown, ChevronRight } from "lucide-react";

const HARDCODED_DEFAULT = `You are a helpful coding assistant. Follow the user's instructions carefully.`;

/** Read-only collapsible prompt viewer card — reused for assembled prompt, SYSTEM.md, APPEND_SYSTEM.md */
function PromptViewer({
  title,
  description,
  content,
  filePath,
  emptyLabel,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  content: string | null;
  filePath?: string;
  emptyLabel: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="glass rounded-xl animate-fade-in-up">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 p-5 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-foreground-tertiary" /> : <ChevronRight className="h-4 w-4 text-foreground-tertiary" />}
        <Terminal className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {content ? (
          <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
            {content.length.toLocaleString()} chars
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-foreground-tertiary/15 px-2 py-0.5 text-xs text-foreground-tertiary">{emptyLabel}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-5 pb-5">
          {description && <p className="mt-3 text-xs text-foreground-secondary">{description}</p>}
          {filePath && <p className="mt-2 font-mono text-xs text-foreground-tertiary">{filePath}</p>}
          {content ? (
            <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-sm text-foreground">
              {content}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-foreground-secondary italic">{emptyLabel}.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const [content, setContent] = useState("");
  const [defaultContent, setDefaultContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [prompts, setPrompts] = useState<PromptsResponse | null>(null);

  useEffect(() => {
    adminApi
      .getAgentsMd()
      .then((res) => {
        setContent(res.systemDefault);
        setDefaultContent(res.systemDefault);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    adminApi.prompts().then(setPrompts).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await adminApi.saveDefaultAgentsMd(content);
      setDefaultContent(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Default AGENTS.md */}
      <div className="glass rounded-xl p-5 animate-fade-in-up">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Default AGENTS.md</h3>
          </div>
          <button
            onClick={() => setContent(HARDCODED_DEFAULT)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-surface-glass-hover hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
        <p className="mb-3 text-xs text-foreground-secondary">
          System-wide default project instructions written into every new session. Individual users can override this in their own settings.
        </p>

        {loading ? (
          <div className="h-64 animate-shimmer rounded-lg bg-surface-glass" />
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
              style={{ height: "40vh", minHeight: 200 }}
              spellCheck={false}
            />

            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

            <div className="mt-3 flex items-center justify-end gap-3">
              {content !== defaultContent && (
                <span className="text-xs text-warning">Unsaved changes</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || content === defaultContent}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4" /> Saved
                  </>
                ) : saving ? (
                  "Saving..."
                ) : (
                  "Save Default"
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Pi System Prompt — assembled by the SDK */}
      {prompts && (
        <>
          <PromptViewer
            title="Assembled System Prompt"
            description="The full prompt Pi receives, built by the SDK from SYSTEM.md, APPEND_SYSTEM.md, AGENTS.md, skills, and tool descriptions."
            content={prompts.assembledPrompt}
            emptyLabel={prompts.promptError || "Pi SDK not installed (mock mode)"}
            defaultOpen={!!prompts.assembledPrompt}
          />
          <PromptViewer
            title="SYSTEM.md"
            description={prompts.systemMd
              ? "Custom base prompt override file."
              : "No custom override file — the SDK uses its built-in default (see Assembled System Prompt above)."}
            content={prompts.systemMd}
            filePath={prompts.systemMdPath}
            emptyLabel="Using SDK built-in default"
          />
          <PromptViewer
            title="APPEND_SYSTEM.md"
            description="Generated at startup by the skill manager with skill paths and pre-installed packages."
            content={prompts.appendSystemMd}
            filePath={prompts.appendSystemMdPath}
            emptyLabel="Not set"
          />
        </>
      )}
    </div>
  );
}
