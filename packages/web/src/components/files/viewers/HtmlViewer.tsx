interface HtmlViewerProps {
  content: string;
}

export function HtmlViewer({ content }: HtmlViewerProps) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      title="HTML Preview"
      className="w-full h-full border-0 bg-white"
    />
  );
}
