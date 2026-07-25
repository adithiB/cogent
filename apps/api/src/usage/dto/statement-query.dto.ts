import { z } from 'zod';
import { dimensionSchema } from './metric-args.dto';

const filterDimensionSchema = z.enum(['project', 'team', 'model']);

/**
 * The Statement screen's read query, flattened for a GET query string
 * (spec §2.2's Controls — Grouping pill, Period pill, plus an optional
 * filter carried by a `slice` re-scope, §1.8) and reassembled into the
 * exact nested shape `UsageEventsRepository.getStatement` (ADR-0002 §3b)
 * already expects. No `orgId` field exists to strip — scope never travels
 * through the query string, only through the verified `AuthGuard` cookie.
 */
export const statementQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    groupBy: dimensionSchema,
    filterDimension: filterDimensionSchema.optional(),
    filterValue: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((q) => q.from < q.to, {
    message: 'from must be before to',
    path: ['from'],
  })
  .transform((q) => ({
    window: { from: q.from, to: q.to },
    groupBy: q.groupBy,
    filter:
      q.filterDimension && q.filterValue
        ? { dimension: q.filterDimension, value: q.filterValue }
        : undefined,
  }));
