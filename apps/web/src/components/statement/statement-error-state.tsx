import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/** spec §2.2: "error (inline block, interface voice, Retry)." */
export function StatementErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-md bg-danger-tint px-3 py-2.5">
      <span className="flex items-center gap-2 text-body text-danger-ink">
        <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
        Couldn&apos;t load your statement.
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
