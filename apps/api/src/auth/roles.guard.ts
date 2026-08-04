import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import type { Role } from '../db/scope';
import type { RequestWithScope } from './auth.guard';

/**
 * Must run after `AuthGuard` (or `ApiKeyGuard`) in a route's guard list —
 * it reads `req.scope.role`, which only those guards populate. A request
 * that reaches here is already authenticated and correctly scoped to its
 * own org (ADR-0001 §Decision-3); it is denied with 403, not 404, because
 * the requester's identity and org are not in question, only whether their
 * role permits this specific action — a different fact from the
 * enumeration-safe 404 §Decision-3 uses for cross-tenant resource lookups.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[] | undefined>(
      ROLES_KEY,
      context.getHandler(),
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { scope } = context
      .switchToHttp()
      .getRequest<Request>() as RequestWithScope;
    if (!requiredRoles.includes(scope.role)) {
      throw new ForbiddenException(
        `This action requires one of: ${requiredRoles.join(', ')}.`,
      );
    }
    return true;
  }
}
