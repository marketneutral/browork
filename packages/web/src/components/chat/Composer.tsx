import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from "react";
import { useSkillsStore } from "../../stores/skills";

interface ComposerProps {
  onSend: (text: string) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, onInvokeSkill, disabled }: ComposerProps) {
  const [text, setText] = useState("");
  const [showSlash, setShowSlash] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const skills = useSkillsStore((s) => s.skills);
  const enabledSkills = useMemo(() => skills.filter((s) => s.enabled), [skills]);

  // Extract the slash prefix the user has typed so far (e.g. "/cle")
  const slashQuery = useMemo(() => {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("/")) return null;
    const firstSpace = trimmed.indexOf(" ");
    // Still typing the command (no space yet)
    if (firstSpace === -1) return trimmed.slice(1).toLowerCase();
    return null; // already past the slash-word
  }, [text]);

  // Filter skills by the query
  const filteredSkills = useMemo(() => {
    if (slashQuery === null) return [];
    if (slashQuery === "") return enabledSkills;
    return enabledSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(slashQuery) ||
        s.description.toLowerCase().includes(slashQuery),
    );
  }, [slashQuery, enabledSkills]);

  // Show/hide popup based on filter results
  useEffect(() => {
    setShowSlash(filteredSkills.length > 0 && slashQuery !== null);
    setSelectedIndex(0);
  }, [filteredSkills.length, slashQuery]);

  // Re-focus textarea when it becomes enabled again
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const selectSkill = useCallback(
    (skillName: string) => {
      setText(`/${skillName} `);
      setShowSlash(false);
      // Resize textarea after setting text
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.height = Math.min(el.scrollHeight, 200) + "px";
          el.focus();
          // Place cursor at end
          el.selectionStart = el.value.length;
          el.selectionEnd = el.value.length;
        }
      });
    },
    [],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Check if this is a slash command invocation
    if (trimmed.startsWith("/")) {
      const withoutSlash = trimmed.slice(1);
      const spaceIndex = withoutSlash.indexOf(" ");
      const cmdName = spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex);
      const args = spaceIndex === -1 ? undefined : withoutSlash.slice(spaceIndex + 1).trim() || undefined;

      // Verify it matches an enabled skill
      const match = enabledSkills.find((s) => s.name === cmdName);
      if (match) {
        onInvokeSkill(match.name, args);
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
    }

    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [text, disabled, onSend, onInvokeSkill, enabledSkills]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredSkills.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredSkills[selectedIndex]) {
          selectSkill(filteredSkills[selectedIndex].name);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlash(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  };

  return (
    <div className="p-4">
      <div className="relative">
        {/* Slash command popup */}
        {showSlash && (
          <div
            ref={popupRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-background-secondary border border-border rounded-[var(--radius-lg)] shadow-lg overflow-hidden z-50"
          >
            <div className="px-3 py-1.5 text-xs text-foreground-tertiary border-b border-border">
              Workflows
            </div>
            {filteredSkills.map((skill, i) => (
              <button
                key={skill.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSkill(skill.name)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                  i === selectedIndex
                    ? "bg-surface-glass text-foreground"
                    : "text-foreground-secondary hover:bg-surface-glass-hover"
                }`}
              >
                <span className="text-sm font-medium text-primary">/{skill.name}</span>
                <span className="text-xs text-foreground-tertiary truncate">{skill.description}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bg-background-tertiary border border-border rounded-[var(--radius-xl)] p-3 focus-glow transition-all">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                handleInput();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to analyze your data... Type / for workflows"
              disabled={disabled}
              rows={1}
              className="flex-1 resize-none bg-transparent border-0 px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-tertiary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
              disabled={disabled || !text.trim()}
              className="rounded-[var(--radius)] bg-gradient-primary text-white px-4 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-foreground-tertiary px-1">
        Press Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}
