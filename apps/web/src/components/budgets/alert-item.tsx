import { AlertTriangle, CheckCircle2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/format";
import { STATUS_INK_CLASS } from "@/lib/threshold";
import { cn } from "@/lib/utils";
import type { BudgetAlertWithStatus } from "@/lib/hooks/use-budget-alerts";

export function scopeLabel(scope: { dimension: string; value: string | null }): string {
  if (scope.dimension === "total") return "total spend";
  const dimLabel = scope.dimension[0].toUpperCase() + scope.dimension.slice(1);
  return `${dimLabel}: ${scope.value}`;
}

/** spec §2.4: "AlertItem rows (text + Remove button, aria-label naming the
 * alert)" — status reuses §1.7's icon + word + ink language, same as
 * SitsIndicator and the Statement's row marking. */
export function AlertItem({
  alert,
  onRemove,
  removing,
}: {
  alert: BudgetAlertWithStatus;
  onRemove: () => void;
  removing: boolean;
}) {
  const Icon = alert.reading.status === "ok" ? CheckCircle2 : AlertTriangle;
  const label = scopeLabel(alert.scope);
  const thresholdText =
    alert.thresholdType === "amount"
      ? `crosses ${formatUsd(alert.capMicros)}`
      : `crosses ${alert.thresholdPercent}% of ${formatUsd(alert.budgetAmountMicros ?? 0)}`;

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className={cn("flex items-start gap-1.5 text-body", STATUS_INK_CLASS[alert.reading.status])}>
        <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="text-text">{label}</span>{" "}
          <span className="text-text-muted">
            {thresholdText} — {alert.reading.word} ({alert.reading.consumedPct.toFixed(0)}%)
          </span>
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove alert for ${label}`}
        onClick={onRemove}
        disabled={removing}
      >
        <X size={16} aria-hidden="true" />
      </Button>
    </li>
  );
}
