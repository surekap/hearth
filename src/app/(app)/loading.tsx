import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant a navigation starts, before the page's data arrives. It
 * is the difference between "loading" and "broken" on a slow phone connection.
 */
export default function AppLoading() {
  return (
    <div className="grid gap-6" role="status" aria-live="polite" aria-label="Loading">
      <div className="grid gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
