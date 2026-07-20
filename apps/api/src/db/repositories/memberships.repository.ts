import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../drizzle.token';
import { memberships, orgs, users } from '../schema';
import { orgScope } from '../scoped-query';
import type { TenantScope } from '../scope';

@Injectable()
export class MembershipsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Unscoped by necessity: this establishes the very first membership a
   * session will use, at login/refresh time, before a `TenantScope` exists.
   * MVP ships one membership per user (multi-org switching is deferred —
   * ADR-0001 §Decision-4), so this returns that single row.
   */
  findFirstForUser(userId: string) {
    return this.db.query.memberships.findFirst({ where: eq(memberships.userId, userId) });
  }

  /**
   * Re-reads a specific (user, org) membership by its own two ids — used
   * only by refresh (ADR-0001 §1c) to re-derive `role`/`org` from the
   * database rather than copy them forward from the old token, so a
   * demotion or removal is picked up within one refresh cycle.
   */
  findByUserAndOrg(userId: string, orgId: string) {
    return this.db.query.memberships.findFirst({
      where: and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)),
    });
  }

  /**
   * Scoped data-access function: the query-layer enforcement pattern applied
   * to real cross-tenant data. `scope.orgId` is the only source of the org
   * filter — there is no parameter here a caller could substitute another
   * org's id into. Covered by the tenant-isolation contract test.
   */
  listOrgMembers(scope: TenantScope) {
    return this.db
      .select({
        userId: memberships.userId,
        email: users.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .innerJoin(orgs, eq(memberships.orgId, orgs.id))
      .where(orgScope(memberships.orgId, scope));
  }
}
