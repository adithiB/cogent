import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';

/**
 * `BudgetAlertsRepository`/`UsersRepository`/`UsageEventsRepository` are
 * provided by the (global) `DbModule` — this module only adds the HTTP
 * surface and the small amount of composition logic (notify-email
 * resolution, uniqueness→409 mapping) over them, same shape as `UsageModule`.
 */
@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
