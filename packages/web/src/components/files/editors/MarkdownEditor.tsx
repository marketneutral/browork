import MDEditor from "@uiw/react-md-editor";

interface MarkdownEditorProps {
  content: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  return (
    <div className="h-full" data-color-mode="dark">
      <MDEditor
        value={content}
        onChange={(v) => onChange(v || "")}
        height="100%"
        preview="live"
        visibleDragbar={false}
      />
    </div>
  );
}
