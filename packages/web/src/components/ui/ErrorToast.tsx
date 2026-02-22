/**
 * ErrorToast — dismissible error notification.
 * Slides in from the top, auto-dismisses after 6 seconds.
 */

import { useEffect } from "react";
import { X, AlertCircle } from "lucide-react";

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up max-w-md w-full">
      <div className="mx-4 flex items-center gap-3 px-4 py-3 bg-[var(--destructive)]/90 backdrop-blur-md border border-[var(--destructive)]/30 text-white rounded-lg shadow-2xl">
        <AlertCircle size={18} className="shrink-0" />
        <p className="text-sm flex-1">{message}</p>
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded hover:bg-white/20"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
