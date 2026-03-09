import { useState, useEffect, useRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});

let mermaidId = 0;

interface MarkdownEditorProps {
  content: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview] = useState<"edit" | "preview">(() =>
    content.trim() ? "preview" : "edit",
  );

  // Post-process rendered preview to replace mermaid code blocks with diagrams
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const processMermaidBlocks = () => {
      const codeBlocks = container.querySelectorAll("code.language-mermaid");
      codeBlocks.forEach(async (codeEl) => {
        const pre = codeEl.closest("pre");
        if (!pre || pre.getAttribute("data-mermaid") === "done") return;
        // Mark immediately (sync) to prevent double-processing
        pre.setAttribute("data-mermaid", "done");

        const source = (codeEl.textContent || "").trim();
        if (!source) return;

        try {
          const id = `mermaid-${++mermaidId}`;
          const { svg } = await mermaid.render(id, source);
          pre.style.textAlign = "center";
          pre.style.background = "transparent";
          pre.style.padding = "1rem 0";
          pre.innerHTML = svg;
        } catch (err) {
          pre.style.color = "#f87171";
          pre.textContent = String(err);
        }
      });
    };

    const scheduleProcess = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(processMermaidBlocks, 80);
    };

    // Process now and watch for future DOM changes (preview toggle, content edits)
    scheduleProcess();
    const observer = new MutationObserver(scheduleProcess);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="h-full" data-color-mode="dark" ref={containerRef}>
      <MDEditor
        value={content}
        onChange={(v) => onChange(v || "")}
        height="100%"
        preview={preview}
        visibleDragbar={false}
      />
    </div>
  );
}
