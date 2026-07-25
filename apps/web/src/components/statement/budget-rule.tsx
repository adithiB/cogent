import { Info } from "lucide-react";

/**
 * spec §2.2/§1.7 locks BudgetRule as part of StatementHeader (Spend-only)
 * and locks the ok/warn/danger fill language for when a threshold exists.
 * It does not exist to render against yet: there is no `budget_alerts`
 * table in this session's scope (Budgets CRUD is spec §2.4, a later
 * session, per the build order in §3). Every org today genuinely has zero
 * budget alerts, so this is a real, honest empty state — not a stub
 * standing in for data that should exist — and it's the exact slot the
 * Budgets session wires a real percentage into.
 */
export function BudgetRule() {
  return (
    <div className="flex items-center gap-1.5 text-secondary text-text-muted">
      <Info size={14} className="shrink-0" aria-hidden="true" />
      <span>No budget alert set for this scope.</span>
    </div>
  );
}
