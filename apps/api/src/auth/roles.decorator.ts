import { SetMetadata } from '@nestjs/common';
import type { Role } from '../db/scope';

export const ROLES_KEY = 'roles';

/**
 * ADR-0001 §Decision-4 named budget-alert CRUD as Cogent's one privileged
 * action set against a read surface, but no route ever checked `scope.role`
 * until this ADR-0001 amendment (2026-08-05) — a documentation audit found
 * the two roles expressed nothing. `@Roles(...)` marks a handler as
 * restricted; `RolesGuard` is what actually enforces it, so this decorator
 * alone is inert on a route that doesn't also carry the guard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
