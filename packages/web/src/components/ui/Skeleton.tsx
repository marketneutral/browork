/**
 * Skeleton — animated placeholder for loading states.
 * Shows a pulsing gray block matching the shape of content.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-[var(--surface-glass)] rounded ${className}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton for a session list item */
export function SessionSkeleton() {
  return (
    <div className="px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Skeleton className="w-3.5 h-3.5 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-3 w-40 ml-5" />
      <Skeleton className="h-2.5 w-16 ml-5" />
    </div>
  );
}

/** Skeleton for the chat panel (empty state while loading) */
export function ChatSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      {/* Simulated user message */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
      {/* Simulated assistant message */}
      <div className="flex justify-start">
        <div className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      {/* Another user message */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      {/* Another assistant message */}
      <div className="flex justify-start">
        <div className="space-y-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the file tree panel */
export function FileSkeleton() {
  return (
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-20" />
      <div className="ml-3 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <Skeleton className="h-4 w-16" />
      <div className="ml-3 space-y-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    </div>
  );
}
