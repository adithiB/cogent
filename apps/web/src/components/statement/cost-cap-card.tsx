import { AlertTriangle } from "lucide-react";

/**
 * spec §2.3, copy corrected per ADR-0004's 2026-07-23/24 amendment §5: the
 * pre-amendment spec text says "over the per-query cost cap" with a dollar
 * figure — stale now that the assistant runs on local Ollama with no
 * per-token dollar cost. The amendment's exact replacement copy: "Query
 * paused — over the per-query compute budget." `role="status"`: this is a
 * genuinely-paused, zero-spend outcome (amendment §3d/§5), not an error.
 */
export function CostCapCard({
  estimatedTokens,
  maxTokens,
}: {
  estimatedTokens: number;
  maxTokens: number;
}) {
  return (
    <div role="status" className="rounded-lg bg-danger-tint p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger-ink" aria-hidden="true" />
        <div>
          <p className="text-body text-danger-ink">Query paused — over the per-query compute budget.</p>
          <p className="mt-1 text-secondary text-danger-ink">
            ~{estimatedTokens} tok estimated, {maxTokens} tok budget. Try a shorter, more specific
            question.
          </p>
        </div>
      </div>
    </div>
  );
}
