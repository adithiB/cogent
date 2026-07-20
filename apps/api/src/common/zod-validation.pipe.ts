import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Every request DTO in this codebase is `.strict()` (ADR-0001 §Decision-3(i)):
 * an unknown key — most pointedly a client-supplied `orgId` — fails validation
 * here, loudly, rather than being silently stripped.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }
}
