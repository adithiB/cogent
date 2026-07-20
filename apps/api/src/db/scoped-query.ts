import { eq, type Column, type SQL } from 'drizzle-orm';
import type { TenantScope } from './scope';

/**
 * ADR-0001 §Decision-3(iii): the one place in the codebase the
 * `org_id = $scope.orgId` predicate is written. Every scoped repository
 * function composes its `WHERE` clause by calling this against the scope
 * it was handed — never against a client-supplied id.
 */
export function orgScope(orgIdColumn: Column, scope: TenantScope): SQL {
  return eq(orgIdColumn, scope.orgId);
}
