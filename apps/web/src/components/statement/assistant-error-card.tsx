import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * spec §2.3 "backend error" state — distinct from OutOfScopeCard: a real
 * 503 (Ollama down/timeout) or network failure, not the model's own
 * out-of-scope judgment. `role="alert"`, not `role="status"`, because this
 * is genuinely unexpected, unlike an out-of-scope answer.
 */
export function AssistantErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-lg bg-danger-tint p-3">
      <span className="flex items-center gap-2 text-body text-danger-ink">
        <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
        Couldn&apos;t reach the query service. Retry.
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
