import type { TimeWindow } from "@/lib/api-client";

/**
 * cogent-ui-implementation-spec.md §1.7 — "defined once, reused on Statement
 * §2.2 and Budgets §2.4." This is that one definition: the `<75 / 75–<90 /
 * ≥90` breakpoints and their paired icon/word, consumed by BudgetRule,
 * StatementTable's row marking, and Budgets' SitsIndicator/AlertItem so the
 * language can't drift between screens.
 */
export type ThresholdStatus = "ok" | "warn" | "danger";

export interface ThresholdReading {
  status: ThresholdStatus;
  word: "on track" | "near cap" | "over";
  consumedPct: number;
}

export function statusForPct(consumedPct: number): ThresholdReading {
  if (consumedPct >= 90) return { status: "danger", word: "over", consumedPct };
  if (consumedPct >= 75) return { status: "warn", word: "near cap", consumedPct };
  return { status: "ok", word: "on track", consumedPct };
}

/** A row/rule is only marked once an alert has actually been "reached"
 * (§1.7) — the on-track state renders no icon/pill anywhere. */
export function isReached(status: ThresholdStatus): boolean {
  return status !== "ok";
}

export const STATUS_INK_CLASS: Record<ThresholdStatus, string> = {
  ok: "text-ok",
  warn: "text-warn-ink",
  danger: "text-danger-ink",
};

export const STATUS_TINT_CLASS: Record<ThresholdStatus, string> = {
  ok: "bg-accent-tint",
  warn: "bg-warn-tint",
  danger: "bg-danger-tint",
};

/** Budget alerts always evaluate over the current calendar month (spec
 * §2.4's PreviewSentence: "…crosses $X in a calendar month") — independent
 * of the Statement's own Period pill selection. */
export function currentCalendarMonthWindow(now: Date = new Date()): TimeWindow {
  const from = new Date(now);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setHours(24, 0, 0, 0);

  return { from, to };
}

/** §1.7's pill/rule examples ("82% of $2,000 cap") are whole-percent, unlike
 * the rest of the app's one-decimal `formatPercent` — a deliberate, narrow
 * divergence for this one locked string shape. */
export function formatConsumedPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

export function capMicrosFor(alert: {
  thresholdType: "amount" | "percent";
  thresholdAmountMicros: number | null;
  thresholdPercent: number | null;
  budgetAmountMicros: number | null;
}): number {
  if (alert.thresholdType === "amount") {
    return alert.thresholdAmountMicros ?? 0;
  }
  const pct = alert.thresholdPercent ?? 0;
  const budget = alert.budgetAmountMicros ?? 0;
  return Math.round((pct / 100) * budget);
}
