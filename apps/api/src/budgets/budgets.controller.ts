import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, type RequestWithScope } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../db/scope';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createBudgetAlertSchema } from './dto/budget-alert.dto';
import { BudgetsService } from './budgets.service';

/**
 * cogent-ui-implementation-spec.md §2.4's CRUD surface. Every route sits
 * behind `AuthGuard`; `scope` comes from the verified cookie exactly as on
 * every other controller in this codebase — there is no route here, or
 * anywhere in this module, that accepts an org identifier from the caller.
 *
 * ADR-0001 §Decision-4 named budget-alert CRUD as the MVP's one privileged
 * action set, set against a read surface. Until an ADR-0001 amendment
 * (2026-08-05, prompted by a documentation audit that found the two roles
 * expressed nothing), no route ever checked `scope.role` — a `member` could
 * mutate budget alerts identically to an `owner`. `create`/`remove` are now
 * owner-only; `list`/`scope-options` stay open to any org member, matching
 * the ADR's own read-surface/privileged-action split.
 */
@Controller('v1/budget-alerts')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @UseGuards(AuthGuard)
  @Get()
  list(@Req() req: Request) {
    const { scope } = req as RequestWithScope;
    return this.budgets.list(scope);
  }

  /** Populates the AlertForm's scope Select with real, currently-ingested
   * project/team/model values (spec §2.4) — never a free-text field. */
  @UseGuards(AuthGuard)
  @Get('scope-options')
  scopeOptions(@Req() req: Request) {
    const { scope } = req as RequestWithScope;
    return this.budgets.scopeOptions(scope);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Owner)
  @Post()
  create(
    @Body(new ZodValidationPipe(createBudgetAlertSchema))
    dto: ReturnType<typeof createBudgetAlertSchema.parse>,
    @Req() req: Request,
  ) {
    const { scope } = req as RequestWithScope;
    return this.budgets.create(scope, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Owner)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: Request) {
    const { scope } = req as RequestWithScope;
    await this.budgets.remove(scope, id);
  }
}
