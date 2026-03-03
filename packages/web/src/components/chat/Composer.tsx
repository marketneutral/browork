import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from "react";
import { useSkillsStore } from "../../stores/skills";
import { useFilesStore } from "../../stores/files";

type SlashItem =
  | { kind: "skill"; name: string; description: string }
  | { kind: "mcp-tool"; name: string; qualifiedName: string; description: string; serverName: string }
  | { kind: "builtin"; name: string; description: string };

const builtinCommands = [
  { name: "compact", description: "Compact context to free up token space" },
];

interface ComposerProps {
  onSend: (text: string) => void;
  onInvokeSkill: (skillName: string, args?: string) => void;
  onCompact: () => void;
  disabled?: boolean;
}

export function Composer({ onSend, onInvokeSkill, onCompact, disabled }: ComposerProps) {
  const [text, setText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const filePopupRef = useRef<HTMLDivElement>(null);

  const fileEntries = useFilesStore((s) => s.entries);
  const skills = useSkillsStore((s) => s.skills);
  const userSkills = useSkillsStore((s) => s.userSkills);
  const sessionSkills = useSkillsStore((s) => s.sessionSkills);
  const mcpTools = useSkillsStore((s) => s.mcpTools) ?? [];

  // Merge all skill sources, deduplicating by name (admin > user > session precedence)
  const enabledSkills = useMemo(() => {
    const seen = new Set<string>();
    const merged = [];
    for (const list of [skills, userSkills, sessionSkills]) {
      for (const s of list) {
        if (s.enabled && !seen.has(s.name)) {
          seen.add(s.name);
          merged.push(s);
        }
      }
    }
    return merged;
  }, [skills, userSkills, sessionSkills]);

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

  // Filter MCP tools by the query
  const filteredMcpTools = useMemo(() => {
    if (slashQuery === null) return [];
    if (slashQuery === "") return mcpTools;
    return mcpTools.filter(
      (t) =>
        t.name.toLowerCase().includes(slashQuery) ||
        t.description.toLowerCase().includes(slashQuery),
    );
  }, [slashQuery, mcpTools]);

  // Filter built-in commands by the query
  const filteredBuiltins = useMemo(() => {
    if (slashQuery === null) return [];
    if (slashQuery === "") return builtinCommands;
    return builtinCommands.filter(
      (c) =>
        c.name.toLowerCase().includes(slashQuery) ||
        c.description.toLowerCase().includes(slashQuery),
    );
  }, [slashQuery]);

  // Extract @ mention query: search backwards from cursor for '@'
  const atMention = useMemo(() => {
    if (cursorPos === 0) return null;
    const before = text.slice(0, cursorPos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return null;
    // '@' must be at start of input or preceded by a space/newline
    if (atIdx > 0 && !/[\s]/.test(before[atIdx - 1])) return null;
    const query = before.slice(atIdx + 1);
    // Break on whitespace — the user has moved past the token
    if (/\s/.test(query)) return null;
    return { query: query.toLowerCase(), start: atIdx, end: cursorPos };
  }, [text, cursorPos]);

  // Filter workspace files by @ query
  const filteredFiles = useMemo(() => {
    if (atMention === null) return [];
    const files = fileEntries.filter((e) => e.type === "file");
    if (atMention.query === "") return files.slice(0, 20);
    return files
      .filter(
        (f) =>
          f.name.toLowerCase().includes(atMention.query) ||
          f.path.toLowerCase().includes(atMention.query),
      )
      .slice(0, 20);
  }, [atMention, fileEntries]);

  // Combined flat list for keyboard navigation
  const filteredItems = useMemo<SlashItem[]>(() => {
    const items: SlashItem[] = [];
    for (const s of filteredSkills) {
      items.push({ kind: "skill", name: s.name, description: s.description });
    }
    for (const t of filteredMcpTools) {
      items.push({
        kind: "mcp-tool",
        name: t.name,
        qualifiedName: t.qualifiedName,
        description: t.description,
        serverName: t.serverName,
      });
    }
    for (const c of filteredBuiltins) {
      items.push({ kind: "builtin", name: c.name, description: c.description });
    }
    return items;
  }, [filteredSkills, filteredMcpTools, filteredBuiltins]);

  // Derive popup visibility directly (no effect delay)
  const showSlashDerived = filteredItems.length > 0 && slashQuery !== null;
  const showFileMention = filteredFiles.length > 0 && atMention !== null;
  const activePopup: "slash" | "file" | null = showSlashDerived ? "slash" : showFileMention ? "file" : null;

  // Reset selection when either popup's filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length, slashQuery, filteredFiles.length, atMention?.query]);

  // Re-focus textarea when it becomes enabled again
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const selectItem = useCallback(
    (item: SlashItem) => {
      setText(`/${item.name} `);
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

  const selectFile = useCallback(
    (filePath: string) => {
      if (!atMention) return;
      const before = text.slice(0, atMention.start);
      const after = text.slice(atMention.end);
      const inserted = filePath + " ";
      const newText = before + inserted + after;
      setText(newText);
      const newCursor = before.length + inserted.length;
      setCursorPos(newCursor);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.height = Math.min(el.scrollHeight, 200) + "px";
          el.focus();
          el.selectionStart = newCursor;
          el.selectionEnd = newCursor;
        }
      });
    },
    [text, atMention],
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

      // Check built-in commands
      if (cmdName === "compact") {
        onCompact();
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }

      // Verify it matches an enabled skill
      const skillMatch = enabledSkills.find((s) => s.name === cmdName);
      if (skillMatch) {
        onInvokeSkill(skillMatch.name, args);
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }

      // Check MCP tools
      const toolMatch = mcpTools.find((t) => t.name === cmdName);
      if (toolMatch) {
        const prompt = args
          ? `Use the ${toolMatch.qualifiedName} tool to: ${args}`
          : `Use the ${toolMatch.qualifiedName} tool`;
        onSend(prompt);
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
  }, [text, disabled, onSend, onInvokeSkill, onCompact, enabledSkills, mcpTools]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (activePopup === "slash") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          selectItem(filteredItems[selectedIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        return;
      }
    }

    if (activePopup === "file") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredFiles[selectedIndex]) {
          selectFile(filteredFiles[selectedIndex].path);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Remove the @query text to dismiss
        if (atMention) {
          const before = text.slice(0, atMention.start);
          const after = text.slice(atMention.end);
          setText(before + after);
          const newCursor = before.length;
          setCursorPos(newCursor);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
              el.focus();
              el.selectionStart = newCursor;
              el.selectionEnd = newCursor;
            }
          });
        }
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
    <div className="px-4 pt-2 pb-3">
      <div className="relative">
        {/* Slash command popup */}
        {showSlashDerived && (
          <div
            ref={popupRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-background-secondary border border-border rounded-[var(--radius-lg)] shadow-lg overflow-hidden z-50"
          >
            {filteredSkills.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-foreground-tertiary border-b border-border">
                  Skills
                </div>
                {filteredSkills.map((skill) => {
                  const idx = filteredItems.findIndex(
                    (it) => it.kind === "skill" && it.name === skill.name,
                  );
                  return (
                    <button
                      key={`skill-${skill.name}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectItem(filteredItems[idx])}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                        idx === selectedIndex
                          ? "bg-surface-glass text-foreground"
                          : "text-foreground-secondary hover:bg-surface-glass-hover"
                      }`}
                    >
                      <span className="text-sm font-medium text-primary">/{skill.name}</span>
                      <span className="text-xs text-foreground-tertiary truncate">{skill.description}</span>
                    </button>
                  );
                })}
              </>
            )}
            {filteredMcpTools.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-foreground-tertiary border-b border-border">
                  MCP Tools
                </div>
                {filteredMcpTools.map((tool) => {
                  const idx = filteredItems.findIndex(
                    (it) => it.kind === "mcp-tool" && it.name === tool.name && it.serverName === tool.serverName,
                  );
                  return (
                    <button
                      key={`mcp-${tool.serverName}-${tool.name}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectItem(filteredItems[idx])}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                        idx === selectedIndex
                          ? "bg-surface-glass text-foreground"
                          : "text-foreground-secondary hover:bg-surface-glass-hover"
                      }`}
                    >
                      <span className="text-sm font-medium text-primary">/{tool.name}</span>
                      <span className="text-xs text-foreground-tertiary truncate">{tool.serverName}: {tool.description}</span>
                    </button>
                  );
                })}
              </>
            )}
            {filteredBuiltins.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-foreground-tertiary border-b border-border">
                  Commands
                </div>
                {filteredBuiltins.map((cmd) => {
                  const idx = filteredItems.findIndex(
                    (it) => it.kind === "builtin" && it.name === cmd.name,
                  );
                  return (
                    <button
                      key={`builtin-${cmd.name}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectItem(filteredItems[idx])}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                        idx === selectedIndex
                          ? "bg-surface-glass text-foreground"
                          : "text-foreground-secondary hover:bg-surface-glass-hover"
                      }`}
                    >
                      <span className="text-sm font-medium text-primary">/{cmd.name}</span>
                      <span className="text-xs text-foreground-tertiary truncate">{cmd.description}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* File mention popup */}
        {activePopup === "file" && (
          <div
            ref={filePopupRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-background-secondary border border-border rounded-[var(--radius-lg)] shadow-lg overflow-hidden z-50 max-h-64 overflow-y-auto"
          >
            <div className="px-3 py-1.5 text-xs text-foreground-tertiary border-b border-border">
              Files
            </div>
            {filteredFiles.map((file, idx) => (
              <button
                key={file.path}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectFile(file.path)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                  idx === selectedIndex
                    ? "bg-surface-glass text-foreground"
                    : "text-foreground-secondary hover:bg-surface-glass-hover"
                }`}
              >
                <span className="text-xs text-foreground-tertiary">@</span>
                <span className="text-sm font-medium text-primary truncate">{file.name}</span>
                {file.name !== file.path && (
                  <span className="text-xs text-foreground-tertiary truncate">{file.path}</span>
                )}
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
                setCursorPos(e.target.selectionStart ?? 0);
                handleInput();
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              placeholder="Ask me to analyze your data... Type / for workflows, @ to mention files"
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
