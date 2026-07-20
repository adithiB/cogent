import { z } from 'zod';

/**
 * `.strict()` — no `orgId` field exists here or anywhere else in this
 * module's DTOs (ADR-0001 §Decision-3(i)). The org is *created* by this
 * request, never named by it.
 */
export const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(12).max(200),
    orgName: z.string().trim().min(2).max(64),
  })
  .strict();

export type SignupDto = z.infer<typeof signupSchema>;
