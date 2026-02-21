import { useState, useRef, useCallback, type KeyboardEvent } from "react";

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
    <div className="border-t border-[var(--border)] p-4">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask me to analyze your data..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          Send
        </button>
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
        Press Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}
