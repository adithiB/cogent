import { z } from 'zod';
import { dimensionSchema } from './metric-args.dto';

const filterDimensionSchema = z.enum(['project', 'team', 'model']);

/**
 * Same flattening as `statement-query.dto.ts`, for the four single-metric
 * functions (ADR-0002 §3b). The Statement screen's only caller today is the
 * `HeaderSparkline`, always `getSpend` with `groupBy: 'time'` (spec §0 item
 * 8: "single-series period spend" — the sparkline plots spend regardless of
 * which Measure is selected).
 */
export const metricQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    groupBy: dimensionSchema.optional(),
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
