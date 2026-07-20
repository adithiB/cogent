/**
 * ADR-0001 §Decision-3: the branded types that make "construct a tenant scope
 * from request data" a compile error rather than a discipline. `OrgId`/`UserId`
 * are nominal — a plain `string` is not assignable to either — and the only
 * function in the codebase permitted to produce one is `scopeFromVerifiedClaims`,
 * which requires claims that already passed JWT signature verification.
 *
 * No repository, controller, or DTO in this codebase should import `Brand`,
 * `OrgId`, or `UserId` from anywhere other than this file's exports and use
 * them to construct a scope. Every scoped data-access function takes a
 * `TenantScope` as its first, non-optional parameter (ADR-0001 §Decision-3(iii)).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, 'OrgId'>;
export type UserId = Brand<string, 'UserId'>;

export const Role = {
  Owner: 'owner',
  Member: 'member',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export interface TenantScope {
  readonly orgId: OrgId;
  readonly userId: UserId;
  readonly role: Role;
}

export interface VerifiedClaims {
  sub: string;
  org: string;
  role: Role;
}

/**
 * The single construction point for a `TenantScope`. Called only by the auth
 * guard (`src/auth/auth.guard.ts`), after `jose` has verified the token's
 * HS256 signature. Nothing upstream of signature verification reaches here.
 */
export function scopeFromVerifiedClaims(claims: VerifiedClaims): TenantScope {
  return {
    userId: claims.sub as UserId,
    orgId: claims.org as OrgId,
    role: claims.role,
  };
}
