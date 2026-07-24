import { coerceStringifiedArgs } from './coerce-args';

/**
 * ADR-0004 amendment §2: these are not synthetic edge cases — each shape
 * below is a real value `llama3.2:3B` produced in the 2026-07-24
 * measurement pass (raw output preserved alongside the amendment).
 */
describe('coerceStringifiedArgs — the measured wire-format repair', () => {
  it('leaves an already-native object untouched', () => {
    const args = {
      window: { from: '2026-01-01T00:00:00Z', to: '2026-01-08T00:00:00Z' },
    };
    expect(coerceStringifiedArgs(args)).toEqual(args);
  });

  it('repairs a window handed back as valid JSON text', () => {
    const args = {
      window: '{"from":"2026-07-17T00:00:00Z","to":"2026-07-24T00:00:00Z"}',
      groupBy: 'team',
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.window).toEqual({
      from: '2026-07-17T00:00:00Z',
      to: '2026-07-24T00:00:00Z',
    });
    expect(repaired.groupBy).toBe('team');
  });

  it('repairs the single-quoted Python-dict-style variant that a plain JSON.parse rejects', () => {
    const args = {
      window: "{'from': '2026-07-24T00:00:00Z', 'to': '2026-07-24T23:59:59Z'}",
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.window).toEqual({
      from: '2026-07-24T00:00:00Z',
      to: '2026-07-24T23:59:59Z',
    });
  });

  it('repairs a stringified filter object alongside window', () => {
    const args = {
      window: { from: '2026-07-11T00:00:00Z', to: '2026-07-24T00:00:00Z' },
      filter: '{"dimension": "team", "value": "checkout-service"}',
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.filter).toEqual({
      dimension: 'team',
      value: 'checkout-service',
    });
  });

  it('repairs a stringified suggestedRephrasings array on the out-of-scope path', () => {
    const args = {
      reason: 'out of scope',
      suggestedRephrasings:
        '["What did we spend last week?", "How many requests today?"]',
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.suggestedRephrasings).toEqual([
      'What did we spend last week?',
      'How many requests today?',
    ]);
  });

  it('lifts a flattened top-level from/to pair into a nested window object — the second defect found in the 24-call post-repair-layer gate', () => {
    const args = {
      groupBy: 'team',
      filter: { dimension: 'model', value: 'GPT-4o' },
      from: '2026-07-17T00:00:00Z',
      to: '2026-07-24T00:00:00Z',
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.window).toEqual({
      from: '2026-07-17T00:00:00Z',
      to: '2026-07-24T00:00:00Z',
    });
    expect(repaired.from).toBeUndefined();
    expect(repaired.to).toBeUndefined();
    expect(repaired.groupBy).toBe('team');
  });

  it('does not lift from/to when window is already present', () => {
    const args = {
      window: { from: '2026-01-01T00:00:00Z', to: '2026-01-08T00:00:00Z' },
      from: 'should-be-ignored',
      to: 'should-be-ignored',
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.window).toEqual({
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-08T00:00:00Z',
    });
  });

  it('strips an explicit null groupBy/filter — the third defect found in the 24-call post-repair-layer gate', () => {
    const args = {
      window: { from: '2026-07-24T00:00:00Z', to: '2026-07-25T00:00:00Z' },
      groupBy: null,
      filter: null,
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect('groupBy' in repaired).toBe(false);
    expect('filter' in repaired).toBe(false);
    expect(repaired.window).toEqual(args.window);
  });

  it('leaves a genuinely present groupBy/filter value untouched', () => {
    const args = {
      window: { from: '2026-01-01T00:00:00Z', to: '2026-01-08T00:00:00Z' },
      groupBy: 'team',
      filter: { dimension: 'project', value: 'checkout' },
    };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.groupBy).toBe('team');
    expect(repaired.filter).toEqual({
      dimension: 'project',
      value: 'checkout',
    });
  });

  it('leaves a genuinely unparseable string untouched, so the existing Zod fallthrough still handles it', () => {
    const args = { window: 'last week' };
    const repaired = coerceStringifiedArgs(args) as Record<string, unknown>;
    expect(repaired.window).toBe('last week');
  });

  it('passes through non-object input unchanged (no tool call, or a primitive)', () => {
    expect(coerceStringifiedArgs(null)).toBe(null);
    expect(coerceStringifiedArgs(undefined)).toBe(undefined);
    expect(coerceStringifiedArgs('plain string')).toBe('plain string');
  });
});
