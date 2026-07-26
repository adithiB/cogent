import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../drizzle.token';
import { budgetAlerts } from '../schema';
import { orgScope } from '../scoped-query';
import type { TenantScope } from '../scope';
import type {
  BudgetAlertRecord,
  BudgetScopeDimension,
  BudgetThresholdType,
} from '../../budgets/types';

export interface NewBudgetAlert {
  scopeDimension: BudgetScopeDimension;
  scopeValue: string;
  thresholdType: BudgetThresholdType;
  thresholdAmountMicros: number | null;
  thresholdPercent: number | null;
  budgetAmountMicros: number | null;
  notifyEmail: string;
}

/**
 * cogent-ui-implementation-spec.md §2.4's CRUD, on the same query-layer
 * enforcement seam as every other repository (ADR-0001 §Decision-3):
 * `scope: TenantScope` is the mandatory first parameter everywhere, and
 * `orgScope()` is the only place the `org_id` predicate is written.
 */
@Injectable()
export class BudgetAlertsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(scope: TenantScope): Promise<BudgetAlertRecord[]> {
    return this.db
      .select()
      .from(budgetAlerts)
      .where(orgScope(budgetAlerts.orgId, scope));
  }

  async findByScope(
    scope: TenantScope,
    dimension: BudgetScopeDimension,
    value: string,
  ): Promise<BudgetAlertRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(budgetAlerts)
      .where(
        and(
          orgScope(budgetAlerts.orgId, scope),
          eq(budgetAlerts.scopeDimension, dimension),
          eq(budgetAlerts.scopeValue, value),
        ),
      )
      .limit(1);
    return row;
  }

  async create(
    scope: TenantScope,
    input: NewBudgetAlert,
  ): Promise<BudgetAlertRecord> {
    const [row] = await this.db
      .insert(budgetAlerts)
      .values({ orgId: scope.orgId, ...input })
      .returning();
    return row;
  }

  /**
   * Scoped delete: the `WHERE` clause requires both the row id *and*
   * `orgScope()` — an id belonging to another org matches zero rows rather
   * than ever being reachable, the same "unrepresentable, not merely
   * rejected" property ADR-0001 §Decision-3 gives every other delete.
   */
  async remove(scope: TenantScope, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(budgetAlerts)
      .where(and(orgScope(budgetAlerts.orgId, scope), eq(budgetAlerts.id, id)))
      .returning({ id: budgetAlerts.id });
    return deleted.length > 0;
  }
}
