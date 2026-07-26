import { z } from 'zod';

/**
 * cogent-ui-implementation-spec.md §2.4's scope Select + Threshold/
 * TypeSegmented. `.strict()` throughout (ADR-0001 §Decision-3(i)) — no
 * `orgId` field exists anywhere on this DTO for a client to populate.
 */
export const budgetScopeDimensionSchema = z.enum([
  'total',
  'project',
  'team',
  'model',
]);
export const budgetThresholdTypeSchema = z.enum(['amount', 'percent']);

/**
 * Amounts arrive from the UI as dollars (matching the Input's displayed
 * unit); everything downstream of this schema works in micros, so the
 * transform happens once, here, not scattered across the repository/service.
 */
const dollarsToMicros = (dollars: number) => Math.round(dollars * 1e6);

export const createBudgetAlertSchema = z
  .object({
    scopeDimension: budgetScopeDimensionSchema,
    scopeValue: z.string().trim().min(1).max(100).optional(),
    thresholdType: budgetThresholdTypeSchema,
    thresholdAmount: z.number().positive().optional(),
    thresholdPercent: z.number().min(0).max(100).optional(),
    budgetAmount: z.number().positive().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.scopeDimension === 'total') {
      if (v.scopeValue !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'scopeValue must be omitted when scopeDimension is total.',
          path: ['scopeValue'],
        });
      }
    } else if (!v.scopeValue) {
      ctx.addIssue({
        code: 'custom',
        message: 'scopeValue is required unless scopeDimension is total.',
        path: ['scopeValue'],
      });
    }

    if (v.thresholdType === 'amount') {
      if (v.thresholdAmount === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'thresholdAmount is required for amount mode.',
          path: ['thresholdAmount'],
        });
      }
      if (v.thresholdPercent !== undefined || v.budgetAmount !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'thresholdPercent/budgetAmount must be omitted for amount mode.',
          path: ['thresholdType'],
        });
      }
    } else {
      if (v.thresholdPercent === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'thresholdPercent is required for percent mode.',
          path: ['thresholdPercent'],
        });
      }
      if (v.budgetAmount === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'budgetAmount is required for percent mode.',
          path: ['budgetAmount'],
        });
      }
      if (v.thresholdAmount !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'thresholdAmount must be omitted for percent mode.',
          path: ['thresholdType'],
        });
      }
    }
  })
  .transform((v) => ({
    scopeDimension: v.scopeDimension,
    scopeValue: v.scopeDimension === 'total' ? '' : (v.scopeValue as string),
    thresholdType: v.thresholdType,
    thresholdAmountMicros:
      v.thresholdType === 'amount'
        ? dollarsToMicros(v.thresholdAmount as number)
        : null,
    thresholdPercent:
      v.thresholdType === 'percent' ? (v.thresholdPercent as number) : null,
    budgetAmountMicros:
      v.thresholdType === 'percent'
        ? dollarsToMicros(v.budgetAmount as number)
        : null,
  }));

export type CreateBudgetAlertDto = ReturnType<
  typeof createBudgetAlertSchema.parse
>;
