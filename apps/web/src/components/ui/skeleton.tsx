import { cn } from "@/lib/utils";

/**
 * motion-safe: only — reduced-motion falls back to a static muted block
 * instead of the pulse (spec §1.9 / §2.2 loading state).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("motion-safe:animate-pulse rounded-md bg-inset", className)} {...props} />;
}

export { Skeleton };
