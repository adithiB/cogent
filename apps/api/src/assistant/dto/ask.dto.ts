import { z } from 'zod';

/** Plain input sanity bound only — the real per-query cost gate is the
 * token-based check in `cost-gate.ts`, not this character count. */
export const askQuestionSchema = z
  .object({ question: z.string().trim().min(1).max(4000) })
  .strict();
export type AskQuestionDto = z.infer<typeof askQuestionSchema>;
