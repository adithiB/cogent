import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BudgetAlertsRepository } from '../db/repositories/budget-alerts.repository';
import { UsersRepository } from '../db/repositories/users.repository';
import { UsageEventsRepository } from '../db/repositories/usage-events.repository';
import type { TenantScope } from '../db/scope';
import { isUniqueViolation } from '../db/unique-violation';
import {
  toBudgetAlertView,
  type BudgetAlertView,
  type BudgetScopeDimension,
} from './types';
import type { CreateBudgetAlertDto } from './dto/budget-alert.dto';

export interface BudgetScopeOption {
  dimension: BudgetScopeDimension;
  value: string | null;
}

/**
 * cogent-ui-implementation-spec.md §2.4. `notifyEmail` is never accepted
 * from the client — the DTO has no field for it — and is instead resolved
 * server-side from `scope.userId`, the same "the client has nowhere to put
 * it" discipline ADR-0001 §Decision-3(i) applies to `orgId`. The spec's
 * "Notify Select (email, single)" has exactly one valid value in MVP: the
 * requesting user's own account email, so there is nothing for a client
 * to legitimately supply here anyway.
 */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly alerts: BudgetAlertsRepository,
    private readonly users: UsersRepository,
    private readonly usageEvents: UsageEventsRepository,
  ) {}

  async list(scope: TenantScope): Promise<BudgetAlertView[]> {
    const rows = await this.alerts.list(scope);
    return rows.map(toBudgetAlertView);
  }

  async scopeOptions(scope: TenantScope): Promise<BudgetScopeOption[]> {
    const values = await this.usageEvents.listDistinctDimensionValues(scope);
    return [
      { dimension: 'total', value: null },
      ...values.map((v) => ({ dimension: v.dimension, value: v.value })),
    ];
  }

  async create(
    scope: TenantScope,
    dto: CreateBudgetAlertDto,
  ): Promise<BudgetAlertView> {
    const user = await this.users.findById(scope.userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    try {
      const row = await this.alerts.create(scope, {
        scopeDimension: dto.scopeDimension,
        scopeValue: dto.scopeValue,
        thresholdType: dto.thresholdType,
        thresholdAmountMicros: dto.thresholdAmountMicros,
        thresholdPercent: dto.thresholdPercent,
        budgetAmountMicros: dto.budgetAmountMicros,
        notifyEmail: user.email,
      });
      return toBudgetAlertView(row);
    } catch (err) {
      if (isUniqueViolation(err, 'budget_alerts_org_scope_unique')) {
        throw new ConflictException('An alert already exists for this scope.');
      }
      throw err;
    }
  }

  async remove(scope: TenantScope, id: string): Promise<void> {
    const removed = await this.alerts.remove(scope, id);
    if (!removed) {
      throw new NotFoundException(
        'No alert with that id for this organization.',
      );
    }
  }
}
