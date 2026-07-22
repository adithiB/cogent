import { z } from 'zod';

export const dimensionSchema = z.enum(['project', 'team', 'model', 'time']);
export const metricSchema = z.enum(['spend', 'latency', 'requests', 'errors']);

/** Bounded window — the allow-list guards the *range*, not just the shape
 * (guardrail ADR §Decision-2), so a caller can't turn a query into an
 * unbounded scan by omitting or widening `to`/`from`. */
export const timeWindowSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .strict()
  .refine((w) => w.from < w.to, {
    message: 'window.from must be before window.to',
  });

export const metricFilterSchema = z
  .object({
    dimension: z.enum(['project', 'team', 'model']),
    value: z.string().trim().min(1).max(100),
  })
  .strict();

/**
 * ADR-0002 §Decision-3b/§3c: no `orgId` field, by construction — there is
 * nothing here for a caller (human or LLM) to populate with another org's
 * id. This is simultaneously the query-function argument validator today
 * and, unchanged, the NL-query assistant's LLM tool-argument schema
 * (guardrail ADR §Decision-2) once that session binds to it.
 */
export const metricArgsSchema = z
  .object({
    window: timeWindowSchema,
    groupBy: dimensionSchema.optional(),
    filter: metricFilterSchema.optional(),
  })
  .strict();
export type MetricArgsDto = z.infer<typeof metricArgsSchema>;

export const statementArgsSchema = z
  .object({ window: timeWindowSchema, groupBy: dimensionSchema })
  .strict();
export type StatementArgsDto = z.infer<typeof statementArgsSchema>;
