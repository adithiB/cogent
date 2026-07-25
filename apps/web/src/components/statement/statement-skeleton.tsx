import { Skeleton } from "@/components/ui/skeleton";

/** spec §2.2 loading state: skeleton rows; `Skeleton` itself already falls
 * back to a static muted block under `prefers-reduced-motion` (§1.9). */
export function StatementSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex items-end justify-between gap-6 border-b border-border pb-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="space-y-3">
        <div className="flex gap-4">
          {[40, 15, 15, 15, 15].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {[40, 15, 15, 15, 15].map((w, j) => (
              <Skeleton key={j} className="h-5" style={{ width: `${w}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
