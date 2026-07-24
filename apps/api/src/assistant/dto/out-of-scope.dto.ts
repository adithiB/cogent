import { z } from 'zod';

/** Validates the model's `report_out_of_scope` tool-call arguments before
 * they reach the `OutOfScopeCard` — same discipline as every other tool
 * argument in this module, none of them trusted unparsed. */
export const outOfScopeArgsSchema = z
  .object({
    reason: z.string().trim().min(1),
    suggestedRephrasings: z.array(z.string().trim().min(1)).max(3),
  })
  .strict();
export type OutOfScopeArgsDto = z.infer<typeof outOfScopeArgsSchema>;
