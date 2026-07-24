import { buildSystemPrompt, ASSISTANT_TOOLS } from './tools';

/**
 * ADR-0004 amendment (2026-07-23/24): Decision 3's per-token dollar cost was
 * built on a premise this project does not hold — no paid APIs, anywhere.
 * A local Ollama call has no per-token dollar cost, so this file replaces
 * `cost-gate.ts`'s dollar math with the re-derived bound: a pre-compute
 * token admission gate (provider-independent, survives from the dollar
 * design almost verbatim) plus a wall-clock timeout backstop (the local
 * analogue of "the one irreducible spend you can't know before the call").
 */

export const ASSISTANT_MODEL = process.env['COGENT_OLLAMA_MODEL'] ?? 'llama3.2';
export const OLLAMA_BASE_URL =
  process.env['COGENT_OLLAMA_BASE_URL'] ?? 'http://localhost:11434';

/**
 * Amendment §3(b): measured, not anchored — 32 real single-query, warm-state
 * calls to `llama3.2:3B` (concurrency 1) on this machine, across the
 * reliability pass and the anchor-date diagnostic, observed range 3.5s to
 * 20.2s. 45s is ~2.2x headroom over the observed worst case.
 *
 * Empirically tuned, exactly like Atlas's 90s `REQUEST_TIMEOUT_MS`
 * (`atlas/packages/api/src/app/ai-assistant/ollama-summary-client.ts`) — NOT
 * a universal constant. Re-verify if the model (§2's `qwen2.5:7b` fallback
 * would raise this), concurrency (overlapping queries reintroduce the
 * head-of-line blocking Atlas measured under 3 concurrent requests), or the
 * hardware/GPU-offload configuration changes.
 */
export const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Amendment §3(b)/§6: a separate, real fact from the warm-state timeout —
 * the first call in the reliability pass, before the model had ever been
 * loaded, took 74.1s (over 3.5x the warm-state worst case). Ollama's default
 * `keep_alive` unloads an idle model after 5 minutes, so any query after 5+
 * minutes of assistant inactivity pays this same tax again. Kept resident
 * with an explicit `keep_alive` on every request, verified working in the
 * diagnostic pass itself, plus one warm-up call at process boot
 * (`OllamaAssistantClient.onModuleInit`) — so a real interactive session
 * should not observe this figure, and REQUEST_TIMEOUT_MS is not sized to
 * cover it.
 */
export const KEEP_ALIVE = '30m';

/** Judgment call carried over from the pre-amendment design: ~500 tokens is
 * generous for a usage question and keeps the admitted input small; tighten
 * or loosen by changing only this constant. Overridable via
 * `ASSISTANT_MAX_QUESTION_TOKENS` — the verification lever for manufacturing
 * the budget-exceeded state on demand, same purpose the dollar cap override
 * served pre-amendment. */
export const MAX_QUESTION_TOKENS = 500;

/** The mapping call only has to emit one small tool_use block — Ollama's
 * `options.num_predict`, the local equivalent of `max_tokens`. */
export const MAX_OUTPUT_TOKENS = 256;

/**
 * Amendment §6/`verify-token-estimate.ts`: measured against Ollama's real
 * `prompt_eval_count` on 2026-07-24, a bare single-role chat message costs
 * ~25-30 real tokens BEFORE any content — llama3.2's chat template wraps
 * every message in role markers and special tokens a chars-based heuristic
 * has no way to see. The pre-fix estimator (chars ÷ 3.5 alone) under-counted
 * EVERY sample tested, including the empty string (local=1, real=27) — a
 * genuine finding from running the verification script, not a hypothetical.
 * 40 is comfortable headroom over the largest observed base overhead (~27).
 */
export const MESSAGE_OVERHEAD_TOKENS = 40;

/**
 * Conservative local token estimate — chars ÷ 3.5 (content) plus a fixed
 * per-message overhead (chat-template wrapping, see above), rounded up.
 * English BPE tokenizers average ~4 chars/token on ordinary prose; dividing
 * by the smaller 3.5 over-counts the content on purpose, because the one
 * failure mode that would make "admitted before compute" a false claim is
 * UNDER-estimating. Provider-independent in spirit — a token budget is the
 * same number whether or not anyone charges for it — but the overhead
 * constant is specific to Ollama's chat-template wrapping and would need
 * re-measurement against a different provider or template format.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5)) + MESSAGE_OVERHEAD_TOKENS;
}

/** Computed once, from the actual system prompt + tool definitions this
 * request will send — not guessed. The system prompt embeds today's date
 * (`buildSystemPrompt`), but a date string is a fixed ~10 chars regardless
 * of which day it is, so computing this once at module load with "now" as
 * of process start is a harmless, negligible approximation for a token-count
 * estimate (not the actual prompt text sent, which is always rebuilt
 * per-request in `assistant.service.ts`). */
export const FIXED_PREFIX_TOKENS = estimateTokens(
  buildSystemPrompt() + JSON.stringify(ASSISTANT_TOOLS),
);

export interface AdmissionResult {
  withinBudget: boolean;
  estimatedQuestionTokens: number;
  maxQuestionTokens: number;
}

/**
 * The pre-compute admission gate — the direct analogue of the old pre-send
 * dollar gate, enforced BEFORE the Ollama daemon is touched. Input size is
 * fully known a priori (fixed prefix, counted once, plus the length-capped
 * question), so a question over the token budget is refused with zero
 * compute spent — "genuinely paused," not "answered then apologized for,"
 * the same property the dollar design had, now measured in tokens instead
 * of dollars.
 */
export function checkAdmission(
  questionText: string,
  maxQuestionTokens: number = MAX_QUESTION_TOKENS,
): AdmissionResult {
  const estimatedQuestionTokens = estimateTokens(questionText);
  return {
    withinBudget: estimatedQuestionTokens <= maxQuestionTokens,
    estimatedQuestionTokens,
    maxQuestionTokens,
  };
}

export interface UsageReport {
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

/** Real usage from Ollama's response fields — reported alongside the answer,
 * replacing the old `cost / cap` dollar tag (spec §2.3, amendment §5). Not
 * part of the enforcement gate, which already ran before the call. Richer
 * than the hosted `usage` block: real tokens AND real wall-time, both
 * measured, versus a single dollar figure. */
export function computeActualUsage(response: {
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}): UsageReport {
  return {
    promptTokens: response.prompt_eval_count ?? 0,
    completionTokens: response.eval_count ?? 0,
    durationMs: response.total_duration
      ? response.total_duration / 1_000_000
      : 0,
  };
}
