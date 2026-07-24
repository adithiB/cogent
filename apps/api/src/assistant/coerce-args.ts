/**
 * ADR-0004 amendment §2/§6: measured against real `llama3.2:3B` output —
 * given an anchor date, the model computed CORRECT nested objects for
 * `window` / `filter` (and, separately, `suggestedRephrasings`) in every
 * sample, but handed them back serialized as a string 8/9 times: sometimes
 * valid JSON text, sometimes invalid single-quoted Python-dict-style text
 * (`"{'from': '2026-07-11T00:00:00Z', ...}"`) that a plain `JSON.parse`
 * throws on. This repairs exactly that shape before Zod validation.
 *
 * A second, distinct defect surfaced in the larger 24-call post-repair-layer
 * verification run: the model sometimes omits the `window` wrapper entirely
 * and emits `from`/`to` as top-level sibling fields of `groupBy`/`filter`
 * instead of nesting them — e.g. `{ groupBy: 'team', from: '...', to: '...' }`
 * with no `window` key at all. `metricArgsSchema` requires a nested `window`
 * object and is `.strict()`, so this shape fails twice over: a missing
 * required field AND two rejected extra keys. `liftFlattenedWindow` repairs
 * this before either schema sees the object.
 *
 * A third defect, from the same run: the model emits explicit `null` for an
 * omitted optional field (`"groupBy": null`) rather than leaving the key
 * out. `metricArgsSchema`'s `.optional()` means the key may be ABSENT
 * (`undefined`) — Zod does not treat an explicit `null` as equivalent, so
 * `groupBy: null` fails the enum check and `filter: null` fails the object
 * check, even though the model's intent ("no groupBy/filter") was correct.
 * `stripNullOptionalFields` deletes any `groupBy`/`filter` key whose value
 * is `null`, which is always a safe, unambiguous normalization — neither
 * field's real value can legitimately be `null`.
 *
 * Anything this can't repair is left untouched, so the existing Zod parse
 * (and out-of-scope fallthrough in `assistant.service.ts`) still handles it
 * — this adds repair attempts in front of the existing failure path, it
 * does not add a new one.
 */

const REPAIRABLE_FIELDS = ['window', 'filter', 'suggestedRephrasings'] as const;

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** The single-quoted Python-dict/list-style variant observed in testing — a
 * narrow, targeted transform (naive quote-swap), not a general un-quoter. */
function tryParsePythonStyle(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  return tryParseJson(trimmed.replace(/'/g, '"'));
}

/** Repairs a flattened `from`/`to` pair (missing `window` wrapper) by
 * lifting them into a nested `window` object, dropping the stray top-level
 * keys `metricArgsSchema`'s `.strict()` would otherwise reject. Leaves the
 * object untouched if `window` is already present, or if `from`/`to` are
 * not both present as strings (nothing to lift). */
function liftFlattenedWindow(
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (args.window !== undefined) return args;
  if (typeof args.from !== 'string' || typeof args.to !== 'string') return args;

  const { from, to, ...rest } = args;
  return { ...rest, window: { from, to } };
}

const NULLABLE_OPTIONAL_FIELDS = ['groupBy', 'filter'] as const;

/** Deletes any of `groupBy`/`filter` whose value is `null` — the model's
 * signal for "omitted," which Zod's `.optional()` does not accept as
 * equivalent to an absent key. Never touches `window` (required) or a
 * genuinely present value. */
function stripNullOptionalFields(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const repaired = { ...args };
  for (const field of NULLABLE_OPTIONAL_FIELDS) {
    if (repaired[field] === null) delete repaired[field];
  }
  return repaired;
}

export function coerceStringifiedArgs(rawArgs: unknown): unknown {
  if (typeof rawArgs !== 'object' || rawArgs === null) return rawArgs;

  let repaired: Record<string, unknown> = {
    ...(rawArgs as Record<string, unknown>),
  };
  repaired = liftFlattenedWindow(repaired);
  repaired = stripNullOptionalFields(repaired);

  for (const field of REPAIRABLE_FIELDS) {
    const value = repaired[field];
    if (typeof value !== 'string') continue;
    const parsed = tryParseJson(value) ?? tryParsePythonStyle(value);
    if (parsed !== undefined) repaired[field] = parsed;
  }

  return repaired;
}
