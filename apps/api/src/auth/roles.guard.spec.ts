import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../db/scope';
import type { RequestWithScope } from './auth.guard';

function contextWithScope(role: Role): ExecutionContext {
  const req = {
    scope: { orgId: 'org-1', userId: 'user-1', role },
  } as unknown as RequestWithScope;
  const handler = (): void => undefined;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function makeGuard(requiredRoles: Role[] | undefined): {
    guard: RolesGuard;
    reflector: Reflector;
  } {
    const reflector = {
      get: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return { guard: new RolesGuard(reflector), reflector };
  }

  it('allows the request through when no @Roles metadata is present', () => {
    const { guard } = makeGuard(undefined);
    expect(guard.canActivate(contextWithScope(Role.Member))).toBe(true);
  });

  it('allows the request through when @Roles is an empty array', () => {
    const { guard } = makeGuard([]);
    expect(guard.canActivate(contextWithScope(Role.Member))).toBe(true);
  });

  it('allows an owner through a route decorated @Roles(Role.Owner)', () => {
    const { guard } = makeGuard([Role.Owner]);
    expect(guard.canActivate(contextWithScope(Role.Owner))).toBe(true);
  });

  it('denies a member on a route decorated @Roles(Role.Owner) with a 403, not a silent pass', () => {
    const { guard } = makeGuard([Role.Owner]);
    expect(() => guard.canActivate(contextWithScope(Role.Member))).toThrow(
      ForbiddenException,
    );
  });

  it('reads required roles from the handler, not the class', () => {
    const { guard, reflector } = makeGuard([Role.Owner]);
    const context = contextWithScope(Role.Owner);
    const getSpy = jest.spyOn(reflector, 'get');
    guard.canActivate(context);
    expect(getSpy).toHaveBeenCalledWith('roles', context.getHandler());
  });
});
