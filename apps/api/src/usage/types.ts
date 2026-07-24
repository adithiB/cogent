/**
 * ADR-0002 §Decision-3b: the shared vocabulary behind the Statement screen's
 * Measure/Grouping controls (cogent-ui-implementation-spec.md §2.2) and the
 * NL-query assistant's LLM tool-call allow-list (guardrail ADR, becomes
 * 0003 on approval). No type here has an `orgId` field — org scope is never
 * a value these shapes can carry; it travels only as `TenantScope`.
 */

export type Metric = 'spend' | 'latency' | 'requests' | 'errors';
export type Dimension = 'project' | 'team' | 'model' | 'time';

export interface TimeWindow {
  from: Date;
  to: Date;
}

export interface MetricFilter {
  dimension: Exclude<Dimension, 'time'>;
  value: string;
}

export interface MetricArgs {
  window: TimeWindow;
  groupBy?: Dimension;
  filter?: MetricFilter;
}

/**
 * guardrail ADR §6's discriminated result envelope — `point` is a single
 * scalar answer, `slice` is a filtered/grouped set. The UI (and, later, the
 * assistant's response handling) switches on `intent`; it never infers it.
 */
export type MetricResult =
  | { intent: 'point'; metric: Metric; value: number; unit: string }
  | {
      intent: 'slice';
      metric: Metric;
      groupBy: Dimension;
      rows: { key: string; value: number }[];
    };

/**
 * ADR-0004 §Findings(1): `filter` was missing here, so a `slice` answer whose
 * question carried one (e.g. "spend by model for team checkout") would
 * silently drop it on re-scope — the statement would show every team's
 * models, not just checkout's, contradicting spec §1.8's "re-scope the
 * statement *to that filter*". Reuses `MetricFilter` exactly — the same
 * shape and predicate the metric functions already apply.
 */
export interface StatementArgs {
  window: TimeWindow;
  groupBy: Dimension;
  filter?: MetricFilter;
}

/** cogent-ui-implementation-spec.md §2.2's table columns:
 * `Line item | Requests | p95 ms | Err % | Spend`. */
export interface StatementRow {
  lineItem: string;
  requests: number;
  p95Ms: number;
  errorRatePct: number;
  spendMicros: number;
}
