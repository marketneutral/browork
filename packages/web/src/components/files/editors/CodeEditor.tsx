import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { useMemo } from "react";

interface CodeEditorProps {
  content: string;
  onChange: (value: string) => void;
  language?: string;
}

export function CodeEditor({ content, onChange, language }: CodeEditorProps) {
  const extensions = useMemo(() => {
    switch (language) {
      case "json":
        return [json()];
      case "javascript":
      case "typescript":
        return [javascript({ typescript: language === "typescript" })];
      case "python":
        return [python()];
      case "html":
        return [html()];
      case "css":
        return [css()];
      case "xml":
        return [xml()];
      case "sql":
        return [sql()];
      case "yaml":
        return [yaml()];
      default:
        return [];
    }
  }, [language]);

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      extensions={extensions}
      theme={tokyoNight}
      height="100%"
      className="h-full text-sm"
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: false,
      }}
    />
  );
}
