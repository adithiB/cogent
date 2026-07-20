import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../drizzle.token';
import { orgs } from '../schema';
import { orgScope } from '../scoped-query';
import type { TenantScope } from '../scope';

@Injectable()
export class OrgsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Unscoped by necessity: called during signup (slug-uniqueness intent is
   * handled by the DB constraint, not this lookup) and during login, before
   * a `TenantScope` exists to enforce. Never called from an authenticated,
   * scoped code path — those go through `getScoped`.
   */
  findBySlug(slug: string) {
    return this.db.query.orgs.findFirst({ where: eq(orgs.slug, slug) });
  }

  /** Unscoped by necessity: called during login, before a `TenantScope`
   * exists — the org id itself comes from the user's own membership row,
   * never from client input. */
  findById(id: string) {
    return this.db.query.orgs.findFirst({ where: eq(orgs.id, id) });
  }

  /** Scoped: returns only the org named by the caller's own verified scope. */
  getScoped(scope: TenantScope) {
    return this.db.query.orgs.findFirst({ where: orgScope(orgs.id, scope) });
  }
}
