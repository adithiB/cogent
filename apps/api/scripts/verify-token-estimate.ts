/**
 * ADR-0004 amendment (2026-07-23/24) §6: the pre-compute admission gate's
 * "admitted before compute" claim depends on `estimateTokens` never
 * UNDER-counting the real tokenizer's output. That estimator is a heuristic
 * (chars / 3.5, ceil) — verified so far only by the boundary-case unit tests
 * in `budget-gate.spec.ts`, which don't call the real daemon. This script is
 * the one-time empirical check against Ollama's real `prompt_eval_count`,
 * replacing the pre-amendment check against Anthropic's `countTokens` (this
 * project no longer depends on `@anthropic-ai/sdk`).
 *
 * Not run as part of `npm test` or CI: it needs a running local Ollama
 * daemon with the configured model pulled, neither of which belongs in the
 * default test run.
 *
 * Run once, by hand, before trusting the admission gate in production:
 *   npm run verify:token-estimate
 *
 * Exits non-zero if the local estimate ever UNDER-counts the real tokenizer
 * for any sample below — that is the one failure mode that would make
 * "admitted before compute" a false claim, and it must be treated as a
 * finding, not silently patched around.
 */
import { buildSystemPrompt, ASSISTANT_TOOLS } from '../src/assistant/tools';
import {
  ASSISTANT_MODEL,
  OLLAMA_BASE_URL,
  FIXED_PREFIX_TOKENS,
  estimateTokens,
} from '../src/assistant/budget-gate';

const SAMPLE_QUESTIONS = [
  '',
  'spend',
  'What did we spend last week?',
  'What did checkout-service spend on GPT-4o last week compared to the week before, broken down by team and environment?',
  // Unicode / non-Latin script — the chars-based heuristic is most likely
  // to drift here, since one "character" can be one, two, or three BPE
  // tokens depending on script.
  '先週のGPT-4oの支出はどれくらいでしたか、チーム別に教えてください',
  'Combien avons-nous dépensé la semaine dernière sur GPT-4o, ventilé par équipe et par modèle ?',
  '💸💸💸 how much did we spend?? 🔥🔥🔥',
];

interface OllamaChatResponse {
  prompt_eval_count?: number;
}

async function realPromptTokenCount(
  messages: { role: string; content: string }[],
  tools?: unknown[],
): Promise<number> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      messages,
      ...(tools ? { tools } : {}),
      stream: false,
      // We only need `prompt_eval_count` (the real tokenizer's INPUT count),
      // so cap generation to the minimum — this is not the timing gate, it
      // does not need real output.
      options: { num_predict: 1 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as OllamaChatResponse;
  return body.prompt_eval_count ?? 0;
}

async function assertDaemonReachable(): Promise<void> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw new Error(
      `Ollama daemon not reachable at ${OLLAMA_BASE_URL} — this script must run against a live ` +
        `daemon, it is the empirical check the local estimator has not yet had. (${String(err)})`,
    );
  }
}

async function main() {
  await assertDaemonReachable();

  let anyUnderCount = false;

  console.log('--- Fixed prefix (system prompt + tool definitions) ---');
  const realPrefixCount = await realPromptTokenCount(
    [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: '(placeholder — prefix-only count)' },
    ],
    ASSISTANT_TOOLS,
  );
  console.log(
    `local estimate: ${FIXED_PREFIX_TOKENS} tokens | real (incl. placeholder message): ${realPrefixCount} tokens`,
  );
  if (FIXED_PREFIX_TOKENS < realPrefixCount) {
    console.error(
      '  FINDING: local FIXED_PREFIX_TOKENS under-counts the real prefix.',
    );
    anyUnderCount = true;
  }

  console.log(
    '\n--- Per-question estimate vs. real tokenizer (bare question, no system/tools) ---',
  );
  for (const question of SAMPLE_QUESTIONS) {
    const local = estimateTokens(question);
    const real = await realPromptTokenCount([
      { role: 'user', content: question || '(empty)' },
    ]);
    const verdict =
      local >= real ? 'OK (conservative)' : 'UNDER-COUNT — FINDING';
    console.log(
      `${verdict.padEnd(24)} local=${String(local).padStart(4)}  real=${String(real).padStart(4)}  "${question.slice(0, 60)}"`,
    );
    if (local < real) anyUnderCount = true;
  }

  if (anyUnderCount) {
    console.error(
      '\nAt least one sample under-counted. The "admitted before compute" claim in ADR-0004\'s ' +
        'amendment §3(a) does not hold as-is — tighten estimateTokens() (lower the chars-per-token ' +
        'divisor) before relying on the gate.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      '\nAll samples: local estimate >= real tokenizer count. Conservative, as designed.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
