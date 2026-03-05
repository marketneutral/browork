import { useEffect, useState } from "react";
import { useAuthStore } from "../../../stores/auth";

interface HtmlViewerProps {
  /** Direct download URL for the HTML file */
  url: string;
}

/**
 * Renders HTML files in a sandboxed iframe.
 * Fetches the full file via the download endpoint (no size truncation)
 * and renders via srcdoc. A <base> tag is injected so anchor links
 * navigate within the iframe instead of the parent window.
 */
export function HtmlViewer({ url }: HtmlViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = useAuthStore.getState().token;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((html) => {
        if (cancelled) return;
        // Inject a script that intercepts hash-link clicks so they scroll
        // within the iframe instead of navigating the parent window.
        // This is needed because srcDoc iframes share the parent's URL,
        // so bare #hash clicks would otherwise change the parent location.
        const hashFixScript = `<script>
document.addEventListener('click', function(e) {
  var a = e.target.closest('a[href^="#"]');
  if (!a) return;
  var id = a.getAttribute('href').slice(1);
  var el = document.getElementById(id) || document.querySelector('[name="' + id + '"]');
  if (el) { e.preventDefault(); el.scrollIntoView({behavior:'smooth'}); }
});
</script>`;
        html = html.replace(/<head([^>]*)>/i, `<head$1>${hashFixScript}`);
        setContent(html);
      })
      .catch((err) => {
        console.error("Failed to load HTML preview:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-foreground-secondary">
        Failed to load HTML file
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-foreground-secondary">
        Loading...
      </div>
    );
  }

  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      title="HTML Preview"
      className="w-full h-full border-0 bg-white"
    />
  );
}
