import type { MetricArgs, MetricResult } from '../usage/types';

/** ADR-0004 §Findings(2): the metric functions apply no `LIMIT` (correct for
 * the Statement screen, which wants every group). On the assistant path a
 * wide `groupBy: 'time'` window could return many rows; this bounds what
 * gets rendered into the AnswerBlock, independent of window span, without
 * touching the repository functions themselves. */
const MAX_RENDERED_ROWS = 20;

export function capRows(result: MetricResult): MetricResult {
  if (result.intent !== 'slice' || result.rows.length <= MAX_RENDERED_ROWS) {
    return result;
  }
  return { ...result, rows: result.rows.slice(0, MAX_RENDERED_ROWS) };
}

const METRIC_LABEL: Record<MetricResult['metric'], string> = {
  spend: 'Spend',
  requests: 'Requests',
  latency: 'p95 latency',
  errors: 'Error rate',
};

function formatValue(
  metric: MetricResult['metric'],
  unit: string,
  value: number,
): string {
  switch (unit) {
    case 'usd':
      return `$${value.toFixed(2)}`;
    case 'ms':
      return `${Math.round(value)} ms`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    default:
      return String(Math.round(value));
  }
}

function describeWindow(args: MetricArgs): string {
  const from = args.window.from.toISOString().slice(0, 10);
  const to = args.window.to.toISOString().slice(0, 10);
  return `${from} to ${to}`;
}

function describeScope(args: MetricArgs): string {
  if (!args.filter) return '';
  return ` for ${args.filter.dimension} "${args.filter.value}"`;
}

/**
 * ADR-0004 §Decision-3a: renders the exact figure the query returned,
 * verbatim — no LLM synthesis call. Exactness over conversational polish is
 * the deliberate trade for a product whose whole claim is an accurate bill.
 */
export function renderAnswerText(
  args: MetricArgs,
  result: MetricResult,
): string {
  const label = METRIC_LABEL[result.metric];
  const scope = describeScope(args);
  const window = describeWindow(args);

  if (result.intent === 'point') {
    return `${label}${scope}, ${window}: ${formatValue(result.metric, result.unit, result.value)}.`;
  }

  const rows = result.rows
    .map(
      (row) =>
        `${row.key} ${formatValue(result.metric, unitForMetric(result.metric), row.value)}`,
    )
    .join(', ');
  return `${label} by ${result.groupBy}${scope}, ${window}: ${rows}.`;
}

function unitForMetric(metric: MetricResult['metric']): string {
  switch (metric) {
    case 'spend':
      return 'usd';
    case 'latency':
      return 'ms';
    case 'errors':
      return 'percent';
    default:
      return 'count';
  }
}
