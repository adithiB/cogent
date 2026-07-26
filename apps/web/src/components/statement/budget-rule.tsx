import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { formatConsumedPct, STATUS_INK_CLASS } from "@/lib/threshold";
import { cn } from "@/lib/utils";
import type { BudgetAlertWithStatus } from "@/lib/hooks/use-budget-alerts";

/**
 * spec §2.2/§1.7: BudgetRule is part of StatementHeader (Spend-only) and
 * renders the §1.7 ok/warn/danger fill language once a `budget_alerts` row
 * exists for the scope currently being viewed (org total by default, or the
 * active `ViewingFilterChip`'s dimension/value after a slice re-scope). When
 * no alert matches that scope, the placeholder below is the same honest
 * empty state the Statement screen has always shown — now genuinely
 * conditional on real data rather than the only state that could exist.
 */
export function BudgetRule({ alert }: { alert: BudgetAlertWithStatus | undefined }) {
  if (!alert) {
    return (
      <div className="flex items-center gap-1.5 text-secondary text-text-muted">
        <Info size={14} className="shrink-0" aria-hidden="true" />
        <span>No budget alert set for this scope.</span>
      </div>
    );
  }

  const { reading } = alert;
  const Icon = reading.status === "ok" ? CheckCircle2 : AlertTriangle;
  const pctLabel = formatConsumedPct(reading.consumedPct);
  const fillClass =
    reading.status === "ok" ? "bg-ok" : reading.status === "warn" ? "bg-warn" : "bg-danger";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className={cn("flex items-center gap-1.5 text-secondary font-medium", STATUS_INK_CLASS[reading.status])}>
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        <span>
          {pctLabel} of budget — {reading.word}
        </span>
      </div>
      <div className="h-1 w-28 overflow-hidden rounded-full bg-inset" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", fillClass)}
          style={{ width: `${Math.min(reading.consumedPct, 100)}%` }}
        />
      </div>
    </div>
  );
}
