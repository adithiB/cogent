import { X } from "lucide-react";

import type { MetricFilter } from "@/lib/api-client";

/**
 * spec §1.8/§2.2: only rendered when the statement has been re-scoped by a
 * `slice` answer. This session's AskBar is visual-only (§3), so the
 * *trigger* is the stub dispatch's canned slice example — but the re-scope
 * itself calls the real `getStatement` with this filter (Task #8), so the
 * chip reflects a real, currently-active query parameter, not a decorative
 * label.
 */
export function ViewingFilterChip({
  filter,
  onDismiss,
}: {
  filter: MetricFilter;
  onDismiss: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-1 text-secondary text-accent-ink">
      <span>
        Viewing: {filter.dimension} = {filter.value}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Clear ${filter.dimension} filter`}
        className="rounded-full text-accent-ink hover:opacity-70 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X size={13} />
      </button>
    </div>
  );
}
