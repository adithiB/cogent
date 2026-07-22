import { z } from 'zod';

/**
 * ADR-0002 §2b: `.strict()` — no `orgId` / `org` / `tenant` field exists
 * here or anywhere else in this module. The org is resolved from the API
 * key that authenticated the write (`ApiKeyGuard`), never from the payload.
 */
export const ingestEventSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    occurredAt: z.coerce.date(),
    project: z.string().trim().min(1).max(100),
    team: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    latencyMs: z.number().int().nonnegative(),
    isError: z.boolean(),
    /** Integer micro-dollars (ADR-0002 §1d) — exact `SUM`, no float
     * rounding, on a number whose entire claim is an accurate bill.
     * Precomputed by the caller; token→price normalization is deferred
     * (portfolio-plan.md §Project 2 Deferred). */
    costMicros: z.number().int().nonnegative(),
  })
  .strict();

export type IngestEventDto = z.infer<typeof ingestEventSchema>;
