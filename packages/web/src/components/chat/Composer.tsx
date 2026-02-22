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
    <div className="p-4">
      <div className="glass-strong rounded-[var(--radius-xl)] p-3 focus-glow transition-all focus-within:scale-[1.005]">
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
            className="flex-1 resize-none bg-transparent border-0 px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-tertiary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="rounded-[var(--radius)] bg-gradient-primary text-white px-4 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Send
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-foreground-tertiary px-1">
        Press Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}
