import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { RefreshTokensRepository } from '../db/repositories/refresh-tokens.repository';
import { MembershipsRepository } from '../db/repositories/memberships.repository';
import type { Role } from '../db/scope';
import { signAccessToken } from './jwt';
import { setAccessCookie, setRefreshCookie, clearAuthCookies } from './cookies';

@Injectable()
export class TokensService {
  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly memberships: MembershipsRepository,
    private readonly config: ConfigService,
  ) {}

  private get jwtSecret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  /** Login/signup: mint a brand-new access token + a brand-new refresh family. */
  async issueSession(res: Response, userId: string, orgId: string, role: Role): Promise<void> {
    const accessToken = await signAccessToken({ sub: userId, org: orgId, role }, this.jwtSecret);
    const refresh = await this.refreshTokens.issueNewFamily(userId, orgId);

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refresh.token, refresh.expiresAt);
  }

  /**
   * ADR-0001 §1c: rotate-with-reuse-detection, and re-derive `org`/`role`
   * from the `memberships` row rather than copy the old token's claims
   * forward — this is what makes refresh double as the re-authorization
   * checkpoint (§1d), not just a liveness check.
   */
  async refreshSession(res: Response, presentedRefreshToken: string): Promise<void> {
    const result = await this.refreshTokens.rotate(presentedRefreshToken);

    if (result.outcome === 'invalid') {
      clearAuthCookies(res);
      throw new UnauthorizedException('Refresh token invalid or expired.');
    }

    if (result.outcome === 'reused') {
      await this.refreshTokens.revokeFamily(result.familyId);
      clearAuthCookies(res);
      throw new UnauthorizedException('Session invalidated — please sign in again.');
    }

    const membership = await this.memberships.findByUserAndOrg(result.userId, result.orgId);
    if (!membership) {
      // The user was removed from the org since the token was issued.
      await this.refreshTokens.revokeFamily(result.next.familyId);
      clearAuthCookies(res);
      throw new UnauthorizedException('You no longer have access to this organization.');
    }

    const accessToken = await signAccessToken(
      { sub: result.userId, org: result.orgId, role: membership.role },
      this.jwtSecret,
    );

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, result.next.token, result.next.expiresAt);
  }

  async endSession(res: Response, presentedRefreshToken: string | undefined): Promise<void> {
    if (presentedRefreshToken) {
      await this.refreshTokens.revokeByToken(presentedRefreshToken);
    }
    clearAuthCookies(res);
  }
}
