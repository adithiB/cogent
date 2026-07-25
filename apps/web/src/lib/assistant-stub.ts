/**
 * spec §3: "Build the compact ask bar here as visual-only (stubbed
 * responses) so the surface is complete; wire the real backend in step 4."
 * This file is that explicit, spec-sanctioned exception — NOT a general
 * license for placeholder code elsewhere in this session.
 *
 * What's stubbed is narrow and named: the natural-language → (function,
 * args) mapping is keyword matching, not the real Ollama assistant
 * (`apps/api/src/assistant/**`, already built, deliberately not called
 * here). Everything downstream of that mapping is real: the dispatched
 * `getSpendMetric` calls hit the real, already-built `/v1/usage/spend`
 * endpoint (Task #1) and return real data from the signed-in org's actual
 * usage events. The token estimate is a real computation over the actual
 * question text, mirrored from `apps/api/src/assistant/budget-gate.ts`
 * (duplicated, not imported — no shared package between apps/api and
 * apps/web in this workspace).
 */

/** Mirrors `MAX_QUESTION_TOKENS` / `MESSAGE_OVERHEAD_TOKENS` in
 * `apps/api/src/assistant/budget-gate.ts` exactly, so the client estimate
 * and the (currently unused-by-this-stub) server gate agree on what "over
 * budget" means. Re-sync both if either constant changes. */
export const MAX_QUESTION_TOKENS = 500;
const MESSAGE_OVERHEAD_TOKENS = 40;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5)) + MESSAGE_OVERHEAD_TOKENS;
}

/** The ScopeHint's one example link (spec §2.2) populates the AskBar with
 * exactly this text — chosen so the keyword stub below classifies it as a
 * `slice` and the verification ingest (Task #10) seeds a `checkout-service`
 * team so the re-scope shows real, non-empty rows, not an honest-but-empty
 * demo. */
export const EXAMPLE_QUESTION =
  "What did checkout-service spend on GPT-4o last week, broken down by model?";

export type QuestionClass = "out_of_scope" | "slice" | "point";

const IN_SCOPE_PATTERN = /(spend|cost|latency|request|error|usage)/i;
const SLICE_PATTERN = /(checkout-service|by model|by project|by team|breakdown|broken down)/i;

/** The stubbed "mapping" step — a keyword classifier standing in for the
 * real Ollama tool-call. Every branch below still resolves to a real
 * `getSpendMetric` call; only this classification is fake. */
export function classifyQuestion(question: string): QuestionClass {
  if (!IN_SCOPE_PATTERN.test(question)) return "out_of_scope";
  if (SLICE_PATTERN.test(question)) return "slice";
  return "point";
}

export const OUT_OF_SCOPE_REASON =
  "That's not something I can answer from your usage statement.";

export const REPHRASE_CHIPS = [
  "What did we spend this month?",
  "Show error rate by model",
  "Which team has the highest spend?",
] as const;

/** AnswerLog's entry shape — the client-local analogue of
 * `AssistantAnswerEnvelope` (`apps/api/src/assistant/types.ts`), minus the
 * `usage` field's real `promptTokens`/`completionTokens`/`durationMs` (no
 * real model call happens here, so nothing legitimate to report there —
 * see AnswerBlock's `estimatedTokens` note). */
export type AnswerLogEntry =
  | {
      id: string;
      type: "answer";
      question: string;
      mapped: string;
      answerText: string;
      estimatedTokens: number;
    }
  | {
      id: string;
      type: "out_of_scope";
      question: string;
      reason: string;
      rephraseChips: readonly string[];
    }
  | {
      id: string;
      type: "budget_exceeded";
      question: string;
      estimatedTokens: number;
      maxTokens: number;
    };

export const MAX_ANSWER_LOG_ENTRIES = 4;
