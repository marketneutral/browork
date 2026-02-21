interface PdfViewerProps {
  url: string;
}

export function PdfViewer({ url }: PdfViewerProps) {
  return (
    <div className="h-full">
      <iframe src={url} className="w-full h-full border-0" title="PDF viewer" />
    </div>
  );
}
