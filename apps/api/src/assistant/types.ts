import type { MetricArgs, MetricResult } from '../usage/types';
import type { MetricToolName } from './tools';

/** spec §2.3: every answer carries `mapped: <function · dims · window>' so a
 * mis-mapped-but-in-scope query is visible and correctable — the accepted
 * residual ADR-0003 names for a prompt-injected or ambiguous question. */
export interface MappedTo {
  function: MetricToolName;
  args: MetricArgs;
}

/**
 * ADR-0004 §6 / ADR-0003 §6: the envelope the API returns. `answer` carries
 * the exact `MetricResult` (so the UI's existing `intent` switch — spec
 * §1.8 — needs no new discriminator) plus the guardrail-legibility fields;
 * `out_of_scope` and `budget_exceeded` are separate variants, not `intent`
 * values, and carry no data payload (ADR-0003 §6).
 *
 * `usage` / `budget_exceeded`'s fields replace the pre-amendment
 * `costUsd`/`capUsd`/`estimatedCostUsd` dollar fields (2026-07-23/24
 * amendment §5): a local Ollama call has no per-token dollar cost, so a
 * dollar sign here would imply real spend that isn't happening. `usage`
 * reports what's actually measured locally — real tokens and real wall-time
 * from Ollama's response — and `budget_exceeded` reports the token budget
 * that blocked the query, never a dollar figure standing in for tokens.
 */
export type AssistantAnswerEnvelope =
  | {
      type: 'answer';
      result: MetricResult;
      mapped: MappedTo;
      answerText: string;
      usage: {
        promptTokens: number;
        completionTokens: number;
        durationMs: number;
      };
    }
  | {
      type: 'out_of_scope';
      reason: string;
      rephraseChips: string[];
    }
  | {
      type: 'budget_exceeded';
      estimatedQuestionTokens: number;
      maxQuestionTokens: number;
    };
