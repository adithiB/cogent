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
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createBudgetAlertSchema } from './dto/budget-alert.dto';
import { BudgetsService } from './budgets.service';

/**
 * cogent-ui-implementation-spec.md §2.4's CRUD surface. Every route sits
 * behind `AuthGuard`; `scope` comes from the verified cookie exactly as on
 * every other controller in this codebase — there is no route here, or
 * anywhere in this module, that accepts an org identifier from the caller.
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

  @UseGuards(AuthGuard)
  @Post()
  create(
    @Body(new ZodValidationPipe(createBudgetAlertSchema))
    dto: ReturnType<typeof createBudgetAlertSchema.parse>,
    @Req() req: Request,
  ) {
    const { scope } = req as RequestWithScope;
    return this.budgets.create(scope, dto);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: Request) {
    const { scope } = req as RequestWithScope;
    await this.budgets.remove(scope, id);
  }
}
