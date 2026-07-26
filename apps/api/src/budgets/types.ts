export type BudgetScopeDimension = 'total' | 'project' | 'team' | 'model';
export type BudgetThresholdType = 'amount' | 'percent';

/** Structurally what a `budgetAlerts` row looks like, kept local rather than
 * importing the Drizzle table type — same reasoning as
 * `usage-events.repository.ts`'s `NewUsageEvent`. */
export interface BudgetAlertRecord {
  id: string;
  scopeDimension: BudgetScopeDimension;
  scopeValue: string;
  thresholdType: BudgetThresholdType;
  thresholdAmountMicros: number | null;
  thresholdPercent: number | null;
  budgetAmountMicros: number | null;
  notifyEmail: string;
  createdAt: Date;
}

export interface BudgetAlertView {
  id: string;
  scope: { dimension: BudgetScopeDimension; value: string | null };
  thresholdType: BudgetThresholdType;
  thresholdAmountMicros: number | null;
  thresholdPercent: number | null;
  budgetAmountMicros: number | null;
  capMicros: number;
  notifyEmail: string;
  createdAt: string;
}

/**
 * Pure function, no DB round-trip: a cap in either mode is fully determined
 * by the alert's own stored fields. `getSpend` (ADR-0002 §3b) — not this
 * function — is the only thing that ever supplies the *current spend* half
 * of a threshold comparison; this keeps the two halves from being computed
 * in two different places under two different rules.
 */
export function capMicrosFor(
  record: Pick<
    BudgetAlertRecord,
    | 'thresholdType'
    | 'thresholdAmountMicros'
    | 'thresholdPercent'
    | 'budgetAmountMicros'
  >,
): number {
  if (record.thresholdType === 'amount') {
    return record.thresholdAmountMicros ?? 0;
  }
  const pct = record.thresholdPercent ?? 0;
  const budget = record.budgetAmountMicros ?? 0;
  return Math.round((pct / 100) * budget);
}

export function toBudgetAlertView(record: BudgetAlertRecord): BudgetAlertView {
  return {
    id: record.id,
    scope: {
      dimension: record.scopeDimension,
      value: record.scopeDimension === 'total' ? null : record.scopeValue,
    },
    thresholdType: record.thresholdType,
    thresholdAmountMicros: record.thresholdAmountMicros,
    thresholdPercent: record.thresholdPercent,
    budgetAmountMicros: record.budgetAmountMicros,
    capMicros: capMicrosFor(record),
    notifyEmail: record.notifyEmail,
    createdAt: record.createdAt.toISOString(),
  };
}
