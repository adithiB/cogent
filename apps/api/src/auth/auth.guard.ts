import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyAccessToken, AccessTokenInvalidError } from './jwt';
import { scopeFromVerifiedClaims, type TenantScope } from '../db/scope';
import { ACCESS_COOKIE } from './cookies';

export interface RequestWithScope extends Request {
  scope: TenantScope;
}

/**
 * ADR-0001 §Decision-3: the only place a `TenantScope` is constructed for an
 * authenticated request. It reads the access-token cookie, verifies its HS256
 * signature, and — only on success — calls `scopeFromVerifiedClaims`.
 * Every scoped route depends on `req.scope`; nothing downstream re-derives
 * org/role from anything else.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[ACCESS_COOKIE];

    if (!token) {
      throw new UnauthorizedException('Not authenticated.');
    }

    try {
      const claims = await verifyAccessToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
      (req as RequestWithScope).scope = scopeFromVerifiedClaims(claims);
      return true;
    } catch (err) {
      if (err instanceof AccessTokenInvalidError) {
        throw new UnauthorizedException('Session expired or invalid.');
      }
      throw err;
    }
  }
}
