/**
 * drizzle-orm's node-postgres driver wraps the raw `pg` `DatabaseError` in
 * its own error, whose own properties are `query`/`params`/`cause` — the
 * real `code`/`constraint` fields live one level down, on `.cause`, not on
 * the thrown error itself. Checking only the top level silently never
 * matches, which is a 500 masquerading as a 409 on every duplicate insert.
 * Shared by `auth.service.ts` (org slug / email) and `budgets.service.ts`
 * (scope uniqueness) — same unwrap, different constraint names.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pg = (err as { cause?: unknown })?.cause ?? err;
  return (
    typeof pg === 'object' &&
    pg !== null &&
    (pg as { code?: string }).code === '23505' &&
    (pg as { constraint?: string }).constraint === constraint
  );
}
