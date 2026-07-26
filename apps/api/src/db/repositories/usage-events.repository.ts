import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../drizzle.token';
import { usageEvents } from '../schema';
import { orgScope } from '../scoped-query';
import type { TenantScope } from '../scope';
import type {
  Dimension,
  MetricArgs,
  MetricResult,
  StatementArgs,
  StatementRow,
} from '../../usage/types';

/** Structurally what `ingestEventSchema` (ingest/dto) parses to — kept local
 * rather than importing the ingest module's DTO, so the data layer doesn't
 * depend on a feature module's request shape. */
export interface NewUsageEvent {
  externalId: string;
  occurredAt: Date;
  project: string;
  team: string;
  model: string;
  latencyMs: number;
  isError: boolean;
  costMicros: number;
}

function dimensionColumn(dimension: Dimension): SQL<string> {
  switch (dimension) {
    case 'project':
      return sql<string>`${usageEvents.project}`;
    case 'team':
      return sql<string>`${usageEvents.team}`;
    case 'model':
      return sql<string>`${usageEvents.model}`;
    case 'time':
      return sql<string>`to_char(${usageEvents.occurredAt}, 'YYYY-MM-DD')`;
  }
}

const p95Latency = sql<number>`coalesce(percentile_cont(0.95) within group (order by ${usageEvents.latencyMs}), 0)`;
const errorRatePct = sql<number>`coalesce((count(*) filter (where ${usageEvents.isError}))::float / nullif(count(*), 0) * 100, 0)`;

/**
 * ADR-0002 §Decision-3: the named, individually-callable, typed aggregation
 * functions that are simultaneously the Statement screen's data source and
 * the NL-query assistant's LLM tool-call allow-list (guardrail ADR, becomes
 * 0003). Every function takes `scope: TenantScope` as its mandatory first
 * parameter, sourced only from a verified credential (JWT via `AuthGuard` or
 * API key via `ApiKeyGuard`) — never from `args`, which has no field that
 * can carry an org identifier. `orgScope()` is the sole source of the
 * `org_id` predicate, per ADR-0001 §Decision-3(iii); this repository does
 * not write a second one.
 */
@Injectable()
export class UsageEventsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * ADR-0002 §2a/§2b: the single synchronous write path. `scope.orgId` —
   * never anything on `event` — is the sole source of `org_id`. There is no
   * field on `NewUsageEvent` an ingestion DTO could populate to land a row
   * under a different org.
   */
  async insertEvent(scope: TenantScope, event: NewUsageEvent): Promise<void> {
    await this.db.insert(usageEvents).values({
      orgId: scope.orgId,
      externalId: event.externalId,
      occurredAt: event.occurredAt,
      project: event.project,
      team: event.team,
      model: event.model,
      latencyMs: event.latencyMs,
      isError: event.isError,
      costMicros: event.costMicros,
    });
  }

  private whereClause(scope: TenantScope, args: MetricArgs) {
    const clauses = [
      orgScope(usageEvents.orgId, scope),
      gte(usageEvents.occurredAt, args.window.from),
      lt(usageEvents.occurredAt, args.window.to),
    ];
    if (args.filter) {
      clauses.push(
        eq(dimensionColumn(args.filter.dimension), args.filter.value),
      );
    }
    return and(...clauses);
  }

  async getSpend(scope: TenantScope, args: MetricArgs): Promise<MetricResult> {
    const where = this.whereClause(scope, args);
    const spend = sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)::float / 1e6`;

    if (!args.groupBy) {
      const [row] = await this.db
        .select({ value: spend })
        .from(usageEvents)
        .where(where);
      return {
        intent: 'point',
        metric: 'spend',
        value: row?.value ?? 0,
        unit: 'usd',
      };
    }
    const groupCol = dimensionColumn(args.groupBy);
    const rows = await this.db
      .select({ key: groupCol, value: spend })
      .from(usageEvents)
      .where(where)
      .groupBy(groupCol);
    return { intent: 'slice', metric: 'spend', groupBy: args.groupBy, rows };
  }

  async getRequestVolume(
    scope: TenantScope,
    args: MetricArgs,
  ): Promise<MetricResult> {
    const where = this.whereClause(scope, args);
    const requests = sql<number>`count(*)::int`;

    if (!args.groupBy) {
      const [row] = await this.db
        .select({ value: requests })
        .from(usageEvents)
        .where(where);
      return {
        intent: 'point',
        metric: 'requests',
        value: row?.value ?? 0,
        unit: 'count',
      };
    }
    const groupCol = dimensionColumn(args.groupBy);
    const rows = await this.db
      .select({ key: groupCol, value: requests })
      .from(usageEvents)
      .where(where)
      .groupBy(groupCol);
    return { intent: 'slice', metric: 'requests', groupBy: args.groupBy, rows };
  }

  async getLatency(
    scope: TenantScope,
    args: MetricArgs,
  ): Promise<MetricResult> {
    const where = this.whereClause(scope, args);

    if (!args.groupBy) {
      const [row] = await this.db
        .select({ value: p95Latency })
        .from(usageEvents)
        .where(where);
      return {
        intent: 'point',
        metric: 'latency',
        value: row?.value ?? 0,
        unit: 'ms',
      };
    }
    const groupCol = dimensionColumn(args.groupBy);
    const rows = await this.db
      .select({ key: groupCol, value: p95Latency })
      .from(usageEvents)
      .where(where)
      .groupBy(groupCol);
    return { intent: 'slice', metric: 'latency', groupBy: args.groupBy, rows };
  }

  async getErrorRate(
    scope: TenantScope,
    args: MetricArgs,
  ): Promise<MetricResult> {
    const where = this.whereClause(scope, args);

    if (!args.groupBy) {
      const [row] = await this.db
        .select({ value: errorRatePct })
        .from(usageEvents)
        .where(where);
      return {
        intent: 'point',
        metric: 'errors',
        value: row?.value ?? 0,
        unit: 'percent',
      };
    }
    const groupCol = dimensionColumn(args.groupBy);
    const rows = await this.db
      .select({ key: groupCol, value: errorRatePct })
      .from(usageEvents)
      .where(where)
      .groupBy(groupCol);
    return { intent: 'slice', metric: 'errors', groupBy: args.groupBy, rows };
  }

  /**
   * cogent-ui-implementation-spec.md §2.2's Statement table: all four
   * metrics per line item in one grouped pass — strictly cheaper than four
   * grouped queries merged in application code, and its own function by
   * correctness, not convenience (ADR-0002 §3b).
   *
   * `p95`/error-rate are not summable across groups, so the totals row
   * re-queries them over the full (ungrouped) window rather than folding
   * the per-group values — folding would silently produce a wrong number.
   */
  async getStatement(
    scope: TenantScope,
    args: StatementArgs,
  ): Promise<{ rows: StatementRow[]; totals: StatementRow }> {
    const clauses = [
      orgScope(usageEvents.orgId, scope),
      gte(usageEvents.occurredAt, args.window.from),
      lt(usageEvents.occurredAt, args.window.to),
    ];
    // ADR-0004 §Findings(1): without this, a slice answer's filter (e.g.
    // "for team checkout") was silently dropped on re-scope — the same
    // filter clause the metric functions apply, added here so §1.8's
    // "re-scope the statement to that filter" is actually true.
    if (args.filter) {
      clauses.push(
        eq(dimensionColumn(args.filter.dimension), args.filter.value),
      );
    }
    const where = and(...clauses);
    const groupCol = dimensionColumn(args.groupBy);

    const rows = await this.db
      .select({
        lineItem: groupCol,
        requests: sql<number>`count(*)::int`,
        p95Ms: p95Latency,
        errorRatePct,
        spendMicros: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)::float`,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(groupCol);

    const [aggregate] = await this.db
      .select({
        requests: sql<number>`count(*)::int`,
        p95Ms: p95Latency,
        errorRatePct,
        spendMicros: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)::float`,
      })
      .from(usageEvents)
      .where(where);

    const totals: StatementRow = {
      lineItem: 'Total',
      requests: aggregate?.requests ?? 0,
      p95Ms: aggregate?.p95Ms ?? 0,
      errorRatePct: aggregate?.errorRatePct ?? 0,
      spendMicros: aggregate?.spendMicros ?? 0,
    };

    return { rows, totals };
  }

  /**
   * Backs the Budgets screen's scope Select (spec §2.4): real project/team/
   * model values that actually appear in this org's events, not a free-text
   * field a client could point at a nonexistent scope. One query per
   * dimension rather than a `UNION` — three small scoped scans over an
   * already-indexed `(org_id, occurred_at)` column, simpler to read than a
   * hand-built `UNION ALL`, and cheap at demo data volume.
   */
  async listDistinctDimensionValues(
    scope: TenantScope,
  ): Promise<{ dimension: Exclude<Dimension, 'time'>; value: string }[]> {
    const dimensions: Exclude<Dimension, 'time'>[] = [
      'project',
      'team',
      'model',
    ];
    const results = await Promise.all(
      dimensions.map(async (dimension) => {
        const column =
          dimension === 'project'
            ? usageEvents.project
            : dimension === 'team'
              ? usageEvents.team
              : usageEvents.model;
        const rows = await this.db
          .selectDistinct({ value: column })
          .from(usageEvents)
          .where(orgScope(usageEvents.orgId, scope))
          .limit(50);
        return rows.map((r) => ({ dimension, value: r.value }));
      }),
    );
    return results.flat();
  }
}
