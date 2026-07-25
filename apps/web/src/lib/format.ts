import type { Metric, StatementRow } from "@/lib/api-client";

/** spec §1.2: mono, tabular, right/decimal-aligned for every measured
 * quantity — these formatters are the one place each unit's string shape is
 * decided, reused by StatementHeader's hero and StatementTable's cells. */
export function formatUsd(micros: number): string {
  return `$${(micros / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMs(ms: number): string {
  return `${Math.round(ms).toLocaleString()} ms`;
}

export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

export const METRIC_LABEL: Record<Metric, string> = {
  spend: "Spend",
  latency: "p95 ms",
  requests: "Requests",
  errors: "Err %",
};

export function metricCellValue(measure: Metric, row: StatementRow): string {
  switch (measure) {
    case "spend":
      return formatUsd(row.spendMicros);
    case "latency":
      return formatMs(row.p95Ms);
    case "requests":
      return formatCount(row.requests);
    case "errors":
      return formatPercent(row.errorRatePct);
  }
}

export const heroValueFor = metricCellValue;
