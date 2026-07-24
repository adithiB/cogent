import {
  FIXED_PREFIX_TOKENS,
  MAX_QUESTION_TOKENS,
  MESSAGE_OVERHEAD_TOKENS,
  checkAdmission,
  computeActualUsage,
  estimateTokens,
} from './budget-gate';

describe('estimateTokens (conservative local estimator)', () => {
  it('never returns zero, even for an empty string', () => {
    expect(estimateTokens('')).toBeGreaterThanOrEqual(1);
  });

  it('grows monotonically with input length', () => {
    const short = estimateTokens('a'.repeat(10));
    const long = estimateTokens('a'.repeat(1000));
    expect(long).toBeGreaterThan(short);
  });

  it('over-counts relative to the ~4 chars/token English-prose average this estimator is deliberately more conservative than', () => {
    // 350 chars of ordinary English prose is ~87-90 tokens by a typical BPE
    // tokenizer (~4 chars/token). Dividing by 3.5 must estimate AT LEAST
    // that many, or the pre-compute admission gate could under-count.
    const prose =
      'What did checkout-service spend on GPT-4o last week compared to the week before, broken down by team and environment, and were there any latency regressions worth flagging to the on-call engineer'.repeat(
        2,
      );
    const estimated = estimateTokens(prose);
    const roughRealTokenCount = Math.ceil(prose.length / 4);
    expect(estimated).toBeGreaterThanOrEqual(roughRealTokenCount);
  });
});

describe('FIXED_PREFIX_TOKENS', () => {
  it('is a positive constant computed from the real system prompt + tool definitions', () => {
    expect(FIXED_PREFIX_TOKENS).toBeGreaterThan(0);
  });
});

describe('checkAdmission — the pre-compute gate (ADR-0004 amendment §3a)', () => {
  it('an ordinary short question is admitted', () => {
    const admission = checkAdmission('What did we spend last week?');
    expect(admission.withinBudget).toBe(true);
  });

  it('a question right at the token budget is still admitted', () => {
    // estimateTokens = ceil(chars / 3.5) + MESSAGE_OVERHEAD_TOKENS, so the
    // content component must land at MAX_QUESTION_TOKENS - overhead.
    const atBudget = 'x'.repeat(
      Math.floor((MAX_QUESTION_TOKENS - MESSAGE_OVERHEAD_TOKENS) * 3.5),
    );
    const admission = checkAdmission(atBudget);
    expect(admission.withinBudget).toBe(true);
  });

  it('a question over the length budget is refused before compute', () => {
    const overBudget = 'x'.repeat(
      Math.ceil((MAX_QUESTION_TOKENS - MESSAGE_OVERHEAD_TOKENS + 50) * 3.5),
    );
    const admission = checkAdmission(overBudget);
    expect(admission.withinBudget).toBe(false);
  });

  it('lowering maxQuestionTokens manufactures a rejection on an otherwise-ordinary question — the verification lever the amendment relies on', () => {
    const ordinary = 'What did we spend last week?';
    const underDefault = checkAdmission(ordinary, MAX_QUESTION_TOKENS);
    const underTinyBudget = checkAdmission(ordinary, 1);

    expect(underDefault.withinBudget).toBe(true);
    expect(underTinyBudget.withinBudget).toBe(false);
    // Same question, same estimated tokens — only the budget moved.
    expect(underTinyBudget.estimatedQuestionTokens).toBe(
      underDefault.estimatedQuestionTokens,
    );
  });

  it('is a pure function of its inputs (no hidden state)', () => {
    const first = checkAdmission('How many requests did we serve today?');
    const second = checkAdmission('How many requests did we serve today?');
    expect(first).toEqual(second);
  });
});

describe('computeActualUsage — real measured tokens + wall-time, replacing the dollar usage block', () => {
  it('reads tokens and converts nanosecond duration to milliseconds', () => {
    const usage = computeActualUsage({
      prompt_eval_count: 1234,
      eval_count: 56,
      total_duration: 7_500_000_000, // 7.5s in ns
    });
    expect(usage.promptTokens).toBe(1234);
    expect(usage.completionTokens).toBe(56);
    expect(usage.durationMs).toBeCloseTo(7500, 0);
  });

  it('defaults missing fields to zero rather than throwing', () => {
    const usage = computeActualUsage({});
    expect(usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      durationMs: 0,
    });
  });
});
