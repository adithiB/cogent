import { BudgetRule } from "./budget-rule";
import { HeaderSparkline } from "./header-sparkline";
import { heroValueFor } from "@/lib/format";
import type { Metric, MetricResult, StatementRow } from "@/lib/api-client";
import type { BudgetAlertWithStatus } from "@/lib/hooks/use-budget-alerts";

/**
 * spec §2.2 layout: 30px mono total + sparkline; right = BudgetRule (Spend
 * measure only, §2.2 line 135). The org-restating caption lives in
 * `StatementCaption`, rendered unconditionally by StatementScreen — not
 * here — so it survives loading/empty/error states this header doesn't
 * render in (see that file's doc comment). `id="statement-heading"` is the
 * org-switch focus target §1.6 requires — not wired to a live trigger this
 * session, since MVP's single-membership OrgSwitcher offers no second org
 * to switch to (see org-switcher.tsx).
 */
export function StatementHeader({
  measure,
  totals,
  trend,
  budgetAlert,
}: {
  measure: Metric;
  totals: StatementRow;
  trend: MetricResult | undefined;
  budgetAlert: BudgetAlertWithStatus | undefined;
}) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-border pb-6">
      <div>
        <div className="flex items-end gap-4">
          <h2
            id="statement-heading"
            tabIndex={-1}
            className="text-display font-mono text-text outline-none"
          >
            {heroValueFor(measure, totals)}
          </h2>
          <div className="mb-1">
            <HeaderSparkline trend={trend} />
          </div>
        </div>
      </div>

      {measure === "spend" && (
        <div className="shrink-0 pb-1">
          <BudgetRule alert={budgetAlert} />
        </div>
      )}
    </div>
  );
}
