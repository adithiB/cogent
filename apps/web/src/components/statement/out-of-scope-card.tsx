import { AlertTriangle } from "lucide-react";

/**
 * spec §2.3: `role="status"` — an expected outcome, not an error. Warn-tint,
 * distinct from CostCapCard's danger-tint (§0 item 2: tint always paired
 * with icon + text, never color alone).
 */
export function OutOfScopeCard({
  reason,
  rephraseChips,
  onRephrase,
}: {
  reason: string;
  rephraseChips: readonly string[];
  onRephrase: (text: string) => void;
}) {
  return (
    <div role="status" className="rounded-lg bg-warn-tint p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn-ink" aria-hidden="true" />
        <p className="text-body text-warn-ink">{reason}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {rephraseChips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onRephrase(chip)}
            className="rounded-full border border-border bg-surface px-2.5 py-1 text-secondary text-text hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
