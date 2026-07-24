/**
 * ADR-0004 §Decision-1, re-scoped by the 2026-07-23 amendment §2/§6: the
 * LLM's tool set IS the allow-list — these are the only five call shapes the
 * model can produce, and `parameters` here is a hand-written JSON-Schema
 * projection of the *existing* Zod schemas in `usage/dto/metric-args.dto.ts`
 * (kept in sync by hand — there are only four shapes and they change rarely;
 * a mismatch here would be caught immediately by the Zod re-validation every
 * dispatched call still goes through in `assistant.service.ts`, which is the
 * actual security gate, not this schema).
 *
 * No `tool_choice` forcing: Ollama's native /api/chat does not guarantee the
 * model emits a tool call rather than prose (amendment §2 — "tool choice:
 * force a model to use a tool" is on Ollama's own future-improvements list).
 * The real allow-list property does not depend on it — every argument object
 * is re-parsed through the existing `metricArgsSchema` / the out-of-scope
 * schema (via `coerceStringifiedArgs` first, amendment §2's measured
 * wire-format fix) before anything touches the database, and a missing or
 * unparseable tool call falls through to the same out-of-scope path as a
 * genuinely out-of-scope question.
 */

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const metricParams = {
  type: 'object' as const,
  properties: {
    window: {
      type: 'object',
      description:
        'The time window to query, as a native JSON object with real computed ISO 8601 date-time strings — never the relative phrase itself (e.g. never "last week"), and never this object serialized as a string.',
      properties: {
        from: {
          type: 'string',
          format: 'date-time',
          description:
            'Inclusive start of the window, a computed ISO 8601 date-time.',
        },
        to: {
          type: 'string',
          format: 'date-time',
          description:
            'Exclusive end of the window, a computed ISO 8601 date-time.',
        },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    groupBy: {
      type: 'string',
      enum: ['project', 'team', 'model', 'time'],
      description:
        'Include only when the question asks for a breakdown by this dimension (produces a "slice" answer — a table of rows). Omit for a single overall figure (a "point" answer).',
    },
    filter: {
      type: 'object',
      description:
        'Include only when the question names one specific project, team, or model to narrow the query to.',
      properties: {
        dimension: { type: 'string', enum: ['project', 'team', 'model'] },
        value: {
          type: 'string',
          description:
            'The exact project, team, or model name named in the question.',
        },
      },
      required: ['dimension', 'value'],
      additionalProperties: false,
    },
  },
  required: ['window'],
  additionalProperties: false,
};

export const METRIC_TOOL_NAMES = [
  'getSpend',
  'getRequestVolume',
  'getLatency',
  'getErrorRate',
] as const;
export type MetricToolName = (typeof METRIC_TOOL_NAMES)[number];

export const OUT_OF_SCOPE_TOOL_NAME = 'report_out_of_scope' as const;

const metricTools: OllamaToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'getSpend',
      description:
        'Total or grouped spend (USD) on LLM API calls for this account. Use for questions about cost, spend, dollars, or billing.',
      parameters: metricParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRequestVolume',
      description:
        'Total or grouped count of LLM API requests for this account. Use for questions about how many requests, calls, or queries were made.',
      parameters: metricParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLatency',
      description:
        'p95 latency (milliseconds) of LLM API calls for this account, total or grouped. Use for questions about speed, latency, or response time.',
      parameters: metricParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getErrorRate',
      description:
        'Error rate (%) of LLM API calls for this account, total or grouped. Use for questions about failures, errors, or reliability.',
      parameters: metricParams,
    },
  },
];

const outOfScopeTool: OllamaToolDefinition = {
  type: 'function',
  function: {
    name: OUT_OF_SCOPE_TOOL_NAME,
    description:
      "Call this when the question cannot be answered by any of the four metric tools above — it asks about something other than this account's own spend, request volume, latency, or error rate, or it needs data these functions do not expose. Do not force a mapping onto the nearest metric; call this instead.",
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'One plain sentence stating why the question is out of scope.',
        },
        suggestedRephrasings: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description:
            'Up to 3 short example questions, as a native JSON array of strings — never a stringified array.',
        },
      },
      required: ['reason', 'suggestedRephrasings'],
      additionalProperties: false,
    },
  },
};

/** The complete, fixed tool set — this array's identity is the allow-list. */
export const ASSISTANT_TOOLS: OllamaToolDefinition[] = [
  ...metricTools,
  outOfScopeTool,
];

/**
 * Amendment §2: the pre-amendment system prompt gave the model no anchor
 * date, which made "compute an ISO window from a relative phrase" an
 * underspecified task for any model, hosted or local. Measured fix: state
 * today's date plainly and give concrete worked examples — computed at call
 * time (never baked into a module-load-time constant), since "today"
 * changes daily on a long-running process.
 *
 * Worked examples, added incrementally as each was measured as a real
 * failure, not assumed fixed by wording alone:
 * - The span-of-days example anchors "last week" = the 7 days ending today,
 *   because the anchor-date fix alone still produced a 13-day span instead
 *   of 7 without it (first amendment measurement pass).
 * - The single-day example anchors "today"/"right now" to a window whose
 *   `to` is explicitly TOMORROW's date, because a 24-call verification run
 *   found the model producing a zero-width window (`from === to`) for
 *   exactly this phrasing — a real date-arithmetic defect no
 *   argument-coercion layer can repair, since the resulting JSON is
 *   syntactically valid and only semantically wrong.
 * - The groupBy-vs-filter example distinguishes "breakdown across every X"
 *   (groupBy) from "narrow to one named X" (filter), because the same
 *   24-call run found the model reaching for `filter: { dimension: 'project' }`
 *   with no value on "Show requests by project this month" — a question
 *   that names no specific project and wants a breakdown, not a narrowing.
 *
 * Re-verify with `scripts/verify-ollama-tool-calling.ts` after any change
 * here — every fix above was itself found by running the gate, not by
 * reasoning about the prompt in the abstract.
 */
export function buildSystemPrompt(now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return `You are the query-mapping component of Cogent-AI, a multi-tenant LLM cost and observability platform. Your only job is to map one natural-language question about this account's own usage data onto exactly one tool call, with correctly-shaped arguments. You never see the underlying data and you never answer in prose — a separate step renders the answer deterministically from your tool call's result.

Today's date is ${today}. Every window.from and window.to MUST be a real computed ISO 8601 date-time — never a relative phrase like "last week" copied verbatim into the field. window.from must always be strictly earlier than window.to — NEVER emit a zero-width window where from equals to.

Worked example (span-of-days phrasing): today is ${today}. The question "What did we spend last week?" maps to window = { "from": "${sevenDaysAgo}T00:00:00Z", "to": "${today}T00:00:00Z" } — "last week" always means the 7 days ending today, not any other span. Apply the same today-relative arithmetic for "this month", etc.

Worked example (single-day phrasing): today is ${today}. The question "What's our error rate today?" maps to window = { "from": "${today}T00:00:00Z", "to": "${tomorrow}T00:00:00Z" } — "today" and "right now" both mean the 24 hours starting at midnight today, so "to" is TOMORROW's date, never the same date as "from".

Every tool call's arguments MUST be a single native JSON object, matching the shape exactly — "window" is always a nested object with "from" and "to" inside it, never top-level "from"/"to" fields, and never window/filter serialized as a JSON string. Omit a field entirely when it does not apply — never set "groupBy" or "filter" to null; leave the key out.

Worked example (groupBy vs. filter — do not confuse them): the question "Show requests by project this month" names NO specific project, so it wants a BREAKDOWN across all projects: groupBy = "project", and filter is OMITTED entirely (do not invent an empty filter value). Use "filter" only when the question names one specific project/team/model to narrow to, e.g. "requests for project checkout-service" maps to filter = { "dimension": "project", "value": "checkout-service" }, with no groupBy.

Metrics available: spend (USD), request volume (count), p95 latency (ms), error rate (%).
Dimensions available: project, team, model (group or filter), and time (group only).

Omit "groupBy" for a single overall figure. Include "groupBy" for a breakdown by that dimension. Include "filter" only when the question names one specific project, team, or model.

If the question cannot be answered by one of the four metrics above, call report_out_of_scope instead of guessing.`;
}
