import { capRows, renderAnswerText } from './answer-template';
import type { MetricArgs, MetricResult } from '../usage/types';

const window: MetricArgs['window'] = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-08T00:00:00Z'),
};

describe('renderAnswerText — deterministic templating, ADR-0004 §Decision-3a', () => {
  it('renders a point result with the exact figure, verbatim, no synthesis', () => {
    const args: MetricArgs = { window };
    const result: MetricResult = {
      intent: 'point',
      metric: 'spend',
      value: 1284.5,
      unit: 'usd',
    };

    const text = renderAnswerText(args, result);

    expect(text).toContain('$1284.50');
    expect(text).toContain('Spend');
  });

  it('renders a slice result as a row list under the correct grouping', () => {
    const args: MetricArgs = { window, groupBy: 'model' };
    const result: MetricResult = {
      intent: 'slice',
      metric: 'spend',
      groupBy: 'model',
      rows: [
        { key: 'gpt-4o', value: 800 },
        { key: 'claude', value: 484.5 },
      ],
    };

    const text = renderAnswerText(args, result);

    expect(text).toContain('by model');
    expect(text).toContain('gpt-4o $800.00');
    expect(text).toContain('claude $484.50');
  });

  it('includes the filter scope in the rendered text when the query was narrowed', () => {
    const args: MetricArgs = {
      window,
      filter: { dimension: 'team', value: 'checkout' },
    };
    const result: MetricResult = {
      intent: 'point',
      metric: 'requests',
      value: 42,
      unit: 'count',
    };

    const text = renderAnswerText(args, result);

    expect(text).toContain('checkout');
  });

  it('formats percent and ms units distinctly from currency', () => {
    const latency = renderAnswerText(
      { window },
      { intent: 'point', metric: 'latency', value: 289.6, unit: 'ms' },
    );
    const errorRate = renderAnswerText(
      { window },
      { intent: 'point', metric: 'errors', value: 12.345, unit: 'percent' },
    );

    expect(latency).toContain('290 ms');
    expect(errorRate).toContain('12.3%');
  });
});

describe('capRows — ADR-0004 §Findings(2): bound rows fed into the answer independent of window span', () => {
  it('leaves a point result untouched', () => {
    const result: MetricResult = {
      intent: 'point',
      metric: 'spend',
      value: 10,
      unit: 'usd',
    };
    expect(capRows(result)).toEqual(result);
  });

  it('leaves a slice result untouched when at or under the row cap', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      key: `p${i}`,
      value: i,
    }));
    const result: MetricResult = {
      intent: 'slice',
      metric: 'spend',
      groupBy: 'project',
      rows,
    };
    const capped = capRows(result);
    expect(capped.intent).toBe('slice');
    if (capped.intent === 'slice') expect(capped.rows).toHaveLength(20);
  });

  it('truncates a slice result with more rows than the cap, without losing the envelope shape', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      key: `p${i}`,
      value: i,
    }));
    const result: MetricResult = {
      intent: 'slice',
      metric: 'spend',
      groupBy: 'project',
      rows,
    };

    const capped = capRows(result);

    expect(capped.intent).toBe('slice');
    if (capped.intent === 'slice') {
      expect(capped.rows.length).toBeLessThan(500);
      expect(capped.rows[0]).toEqual(rows[0]);
    }
  });
});
