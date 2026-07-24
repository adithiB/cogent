/**
 * ADR-0004 amendment §7 item 7: the tool-calling reliability gate, run
 * against the REAL dispatch pipeline — the actual `buildSystemPrompt()`,
 * the actual `ASSISTANT_TOOLS` schemas, the actual `coerceStringifiedArgs`
 * repair layer, and the actual Zod schemas (`metricArgsSchema`,
 * `outOfScopeArgsSchema`) the running service validates against. Ported
 * from the ad-hoc scratchpad script that produced the amendment's original
 * numbers (tool selection 24/24, argument wire-format 1/9 before the repair
 * layer existed) — this version stays current with the module instead of
 * being a frozen, hand-duplicated copy of its schemas.
 *
 * Re-run this whenever `tools.ts`, `coerce-args.ts`, or the configured
 * model changes — per the same "re-verify, don't assume it still holds"
 * discipline the amendment applies to REQUEST_TIMEOUT_MS.
 *
 * Usage: npm run verify:ollama-tool-calling
 */
import {
  ASSISTANT_TOOLS,
  buildSystemPrompt,
  METRIC_TOOL_NAMES,
  OUT_OF_SCOPE_TOOL_NAME,
} from '../src/assistant/tools';
import type { MetricToolName } from '../src/assistant/tools';
import { coerceStringifiedArgs } from '../src/assistant/coerce-args';
import { metricArgsSchema } from '../src/usage/dto/metric-args.dto';
import { outOfScopeArgsSchema } from '../src/assistant/dto/out-of-scope.dto';
import {
  ASSISTANT_MODEL,
  KEEP_ALIVE,
  MAX_OUTPUT_TOKENS,
  OLLAMA_BASE_URL,
} from '../src/assistant/budget-gate';

const RUNS_PER_QUESTION = 3;

interface Question {
  id: string;
  text: string;
  expect: 'tool' | 'ambiguous' | 'oos';
  expectName?: MetricToolName;
  /** Amendment §2's open finding: the anchor-date fix alone still produced a
   * 13-day span for "last week" instead of 7. Checked directly here rather
   * than assumed fixed by the sharper worked example in `buildSystemPrompt`. */
  checkLastWeekSpan?: boolean;
}

const QUESTIONS: Question[] = [
  {
    id: 'point-spend',
    text: 'What did we spend last week?',
    expect: 'tool',
    expectName: 'getSpend',
    checkLastWeekSpan: true,
  },
  {
    id: 'point-errors',
    text: "What's our error rate today?",
    expect: 'tool',
    expectName: 'getErrorRate',
  },
  {
    id: 'slice-requests',
    text: 'Show requests by project this month.',
    expect: 'tool',
    expectName: 'getRequestVolume',
  },
  {
    id: 'slice-filtered',
    text: 'What did checkout-service spend on GPT-4o last week, broken down by team?',
    expect: 'tool',
    expectName: 'getSpend',
    checkLastWeekSpan: true,
  },
  {
    id: 'point-latency',
    text: 'How fast are our API calls right now?',
    expect: 'tool',
    expectName: 'getLatency',
  },
  { id: 'ambiguous', text: 'How are we doing this week?', expect: 'ambiguous' },
  { id: 'oos-weather', text: "What's the weather like today?", expect: 'oos' },
  {
    id: 'oos-unrelated',
    text: 'Can you write me a poem about databases?',
    expect: 'oos',
  },
];

interface OllamaChatResponse {
  message?: {
    content?: string;
    tool_calls?: { function: { name: string; arguments: unknown } }[];
  };
}

async function assertDaemonReachable(): Promise<void> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw new Error(
      `Ollama daemon not reachable at ${OLLAMA_BASE_URL}. (${String(err)})`,
    );
  }
}

async function callOnce(
  question: string,
): Promise<{ elapsedMs: number; body?: OllamaChatResponse; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ASSISTANT_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: question },
        ],
        tools: ASSISTANT_TOOLS,
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { num_predict: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const elapsedMs = performance.now() - start;
    if (!res.ok) return { elapsedMs, error: `HTTP ${res.status}` };
    const body = (await res.json()) as OllamaChatResponse;
    return { elapsedMs, body };
  } catch (err) {
    return { elapsedMs: performance.now() - start, error: String(err) };
  }
}

interface ClassifyResult {
  outcome:
    'no_tool_call' | 'unknown_tool_name' | 'metric_call' | 'out_of_scope_call';
  ok: boolean;
  name: string | null;
  argsValid?: boolean;
  lastWeekSpanDays?: number;
}

function classify(
  q: Question,
  body: OllamaChatResponse | undefined,
): ClassifyResult {
  const call = body?.message?.tool_calls?.[0];
  if (!call) return { outcome: 'no_tool_call', ok: false, name: null };

  const name = call.function.name;
  const repaired = coerceStringifiedArgs(call.function.arguments);

  if (name === OUT_OF_SCOPE_TOOL_NAME) {
    const parsed = outOfScopeArgsSchema.safeParse(repaired);
    const ok =
      parsed.success && (q.expect === 'oos' || q.expect === 'ambiguous');
    return {
      outcome: 'out_of_scope_call',
      ok,
      name,
      argsValid: parsed.success,
    };
  }

  if (!(METRIC_TOOL_NAMES as readonly string[]).includes(name)) {
    return { outcome: 'unknown_tool_name', ok: false, name };
  }

  const parsed = metricArgsSchema.safeParse(repaired);
  if (!parsed.success) {
    return { outcome: 'metric_call', ok: false, name, argsValid: false };
  }

  const rightTool = q.expect !== 'tool' || name === q.expectName;
  let lastWeekOk = true;
  let lastWeekSpanDays: number | undefined;
  if (q.checkLastWeekSpan) {
    const spanMs =
      parsed.data.window.to.getTime() - parsed.data.window.from.getTime();
    lastWeekSpanDays = spanMs / (24 * 60 * 60 * 1000);
    lastWeekOk = Math.abs(lastWeekSpanDays - 7) <= 1; // 1-day tolerance for boundary rounding
  }

  return {
    outcome: 'metric_call',
    ok: rightTool && lastWeekOk,
    name,
    argsValid: true,
    lastWeekSpanDays,
  };
}

async function main() {
  await assertDaemonReachable();

  console.log(
    `Model: ${ASSISTANT_MODEL} | runs per question: ${RUNS_PER_QUESTION} | tools: ${ASSISTANT_TOOLS.length}`,
  );
  console.log(
    'Exercising the REAL dispatch pipeline: buildSystemPrompt() + ASSISTANT_TOOLS + coerceStringifiedArgs + Zod schemas.\n',
  );

  let ok = 0;
  let total = 0;
  const failures: string[] = [];
  const timings: number[] = [];

  for (const q of QUESTIONS) {
    console.log(`\n=== ${q.id} :: "${q.text}" (expect: ${q.expect}) ===`);
    for (let run = 1; run <= RUNS_PER_QUESTION; run++) {
      const { elapsedMs, body, error } = await callOnce(q.text);
      total++;
      timings.push(elapsedMs);
      if (error) {
        failures.push(`${q.id} run ${run}: transport error — ${error}`);
        console.log(
          `  run ${run}: ${(elapsedMs / 1000).toFixed(2)}s  ERROR ${error}`,
        );
        continue;
      }
      const result = classify(q, body);
      if (result.ok) ok++;
      else failures.push(`${q.id} run ${run}: ${JSON.stringify(result)}`);
      console.log(
        `  run ${run}: ${(elapsedMs / 1000).toFixed(2)}s  ${JSON.stringify(result)}`,
      );
    }
  }

  console.log('\n\n================ SUMMARY ================\n');
  console.log(
    `End-to-end reliability (real dispatch pipeline): ${ok}/${total} (${((ok / total) * 100).toFixed(1)}%)`,
  );
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  timings.sort((a, b) => a - b);
  const min = timings[0];
  const max = timings[timings.length - 1];
  const median = timings[Math.floor(timings.length / 2)];
  console.log(
    `\nLatency (ms): min=${min.toFixed(0)} median=${median.toFixed(0)} max=${max.toFixed(0)} (n=${timings.length})`,
  );
  console.log(
    'Compare max against REQUEST_TIMEOUT_MS in budget-gate.ts — if it is close to or over the ' +
      'committed timeout, that constant needs re-measurement, not the timeout silently widened.',
  );

  // A chosen bar for this project, not a number the ADR mandates outright —
  // below it is worth investigating before trusting the gate, not an
  // automatic model swap. Per amendment §2, the actual swap trigger is tool
  // hallucination or a narrowed effective tool set, which this log makes
  // visible in the per-run JSON above, not this aggregate threshold alone.
  if (ok / total < 0.8) {
    console.error(
      '\nEnd-to-end reliability is under 80%. Read the failures above before deciding: is it tool ' +
        'selection (the qwen2.5:7b fallback trigger, amendment §2) or still an argument-shape issue ' +
        '(a coerce-args.ts gap to close)?',
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
