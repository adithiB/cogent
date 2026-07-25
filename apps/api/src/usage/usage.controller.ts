import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, type RequestWithScope } from '../auth/auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsageEventsRepository } from '../db/repositories/usage-events.repository';
import { statementQuerySchema } from './dto/statement-query.dto';
import { metricQuerySchema } from './dto/metric-query.dto';

/**
 * The Statement screen's read surface (spec §2.2). Both routes call the
 * exact ADR-0002 §3b functions the NL-query assistant also calls — this
 * controller adds no new data-access path, only an HTTP entry point for the
 * UI's own deterministic reads (Measure/Grouping/Period controls), as
 * distinct from the assistant's LLM-mediated calls to the same functions.
 * `scope` comes from `AuthGuard`, identical to every other authenticated
 * route; the query string carries no `orgId` because there is nowhere in
 * either query schema for one to go.
 */
@Controller('v1/usage')
export class UsageController {
  constructor(private readonly usageEvents: UsageEventsRepository) {}

  @UseGuards(AuthGuard)
  @Get('statement')
  async statement(
    @Query(new ZodValidationPipe(statementQuerySchema))
    args: ReturnType<typeof statementQuerySchema.parse>,
    @Req() req: Request,
  ) {
    const { scope } = req as RequestWithScope;
    return this.usageEvents.getStatement(scope, args);
  }

  /**
   * Backs the `HeaderSparkline` — always called with `groupBy: 'time'`
   * from the client, never a fifth ad-hoc query shape.
   */
  @UseGuards(AuthGuard)
  @Get('spend')
  async spend(
    @Query(new ZodValidationPipe(metricQuerySchema))
    args: ReturnType<typeof metricQuerySchema.parse>,
    @Req() req: Request,
  ) {
    const { scope } = req as RequestWithScope;
    return this.usageEvents.getSpend(scope, args);
  }
}
