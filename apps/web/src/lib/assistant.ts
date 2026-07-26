import type { AssistantAnswerEnvelope, MappedTo } from "@/lib/api-client";

/**
 * Real client-side pieces the Statement session's stub also needed
 * (spec §2.3: "live ≈ estimate on the input, client-side, UX only") — kept
 * verbatim from `assistant-stub.ts`, since these were never fake. What's
 * gone is the keyword classifier and its canned copy: the real backend
 * (`apps/api/src/assistant/**`, ADR-0004) now does the mapping and supplies
 * real `reason`/`rephraseChips`/`answerText`.
 *
 * Mirrors `MAX_QUESTION_TOKENS`/`MESSAGE_OVERHEAD_TOKENS` in
 * `apps/api/src/assistant/budget-gate.ts` exactly, so the client estimate
 * and the server's pre-compute admission gate agree on what "over budget"
 * means (ADR-0004 amendment §3e). Re-sync both if either constant changes.
 */
export const MAX_QUESTION_TOKENS = 500;
const MESSAGE_OVERHEAD_TOKENS = 40;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5)) + MESSAGE_OVERHEAD_TOKENS;
}

/** ScopeHint's one example link (spec §2.2) — now a real question that hits
 * the real backend, not a hand-picked stub-classifier trigger. */
export const EXAMPLE_QUESTION =
  "What did checkout-service spend on GPT-4o last week, broken down by model?";

export const MAX_ANSWER_LOG_ENTRIES = 4;

/**
 * AnswerLog's entry shape — the real envelope plus the question that
 * produced it (for `crypto.randomUUID()`-keyed list rendering), plus one
 * client-only variant: `error`. The backend's `AssistantAnswerEnvelope` has
 * no error variant by design — a 503/network failure throws before any
 * envelope is returned — so this is a distinct state per spec §2.3 ("backend
 * error (distinct … role="alert")"), never rendered via OutOfScopeCard
 * (`role="status"`), which is reserved for the backend's own out-of-scope
 * judgment.
 */
export type AnswerLogEntry =
  | ({ id: string; question: string; unscoped?: boolean } & AssistantAnswerEnvelope)
  | { id: string; question: string; type: "error" };

const DIMENSION_LABEL: Record<string, string> = {
  project: "project",
  team: "team",
  model: "model",
  time: "time",
};

function formatWindow(window: { from: string; to: string }): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(window.from)}–${fmt(window.to)}`;
}

/** spec §2.3: every answer carries `mapped: <function · dims · window>` —
 * built from the real, structured `MappedTo` the backend returned, not a
 * pre-formatted string (the backend sends structure; only this tag's text
 * is a display concern, same split as `answer-template.ts` on the server). */
export function formatMappedTag(mapped: MappedTo): string {
  const dims: string[] = [];
  if (mapped.args.groupBy) dims.push(`groupBy=${DIMENSION_LABEL[mapped.args.groupBy]}`);
  if (mapped.args.filter) {
    dims.push(`filter=${mapped.args.filter.dimension}:${mapped.args.filter.value}`);
  }
  const window = formatWindow(mapped.args.window);
  return dims.length > 0
    ? `${mapped.function} · ${dims.join(", ")} · ${window}`
    : `${mapped.function} · ${window}`;
}

/** ADR-0004 amendment §5: real measured tokens + wall-time, never a dollar
 * figure — Ollama is local and has no per-token cost. */
export function formatUsage(usage: { promptTokens: number; completionTokens: number; durationMs: number }): string {
  const totalTokens = usage.promptTokens + usage.completionTokens;
  const seconds = (usage.durationMs / 1000).toFixed(1);
  return `${totalTokens.toLocaleString()} tok · ${seconds}s`;
}
