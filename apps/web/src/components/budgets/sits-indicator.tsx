import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { formatUsd } from "@/lib/format";
import { statusForPct, STATUS_INK_CLASS } from "@/lib/threshold";
import { cn } from "@/lib/utils";

/**
 * spec §2.4: "SitsIndicator (current scoped spend vs. threshold)," using
 * §1.7's exact icon + word + ink-color language — color never carries the
 * meaning alone (§1.9). Live against whatever scope/threshold is currently
 * selected in the form, before an alert has been created.
 */
export function SitsIndicator({
  currentSpendMicros,
  capMicros,
  loading,
}: {
  currentSpendMicros: number | undefined;
  capMicros: number | undefined;
  loading: boolean;
}) {
  if (capMicros === undefined) {
    return <p className="text-secondary text-text-muted">Set a threshold to see current standing.</p>;
  }
  if (loading || currentSpendMicros === undefined) {
    return <p className="text-secondary text-text-muted">Checking current spend…</p>;
  }

  const consumedPct = capMicros > 0 ? (currentSpendMicros / capMicros) * 100 : 0;
  const reading = statusForPct(consumedPct);
  const Icon = reading.status === "ok" ? CheckCircle2 : AlertTriangle;

  return (
    <p className={cn("flex items-center gap-1.5 text-secondary", STATUS_INK_CLASS[reading.status])}>
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span>
        {formatUsd(currentSpendMicros)} of {formatUsd(capMicros)} this month — {reading.word} (
        {reading.consumedPct.toFixed(0)}%)
      </span>
    </p>
  );
}
