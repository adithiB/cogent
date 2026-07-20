import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { DRIZZLE, type Database } from '../drizzle.token';
import { refreshTokens } from '../schema';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface IssuedRefreshToken {
  /** The opaque bearer value — set in the cookie, never persisted in plaintext. */
  token: string;
  familyId: string;
  expiresAt: Date;
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Starts a brand-new rotation family — called only at login/signup. */
  async issueNewFamily(userId: string, orgId: string): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.db.insert(refreshTokens).values({
      tokenHash: hashToken(token),
      familyId,
      userId,
      orgId,
      expiresAt,
    });

    return { token, familyId, expiresAt };
  }

  /**
   * ADR-0001 §1c rotation with reuse detection. Looks up the presented
   * token by hash:
   *  - not found / expired → caller treats as invalid, 401.
   *  - found and already revoked → REUSE: caller must revoke the whole
   *    family (`revokeFamily`) and 401. This is the signal a token leaked.
   *  - found and live → this token is consumed (revoked, `replacedBy` set)
   *    and a fresh token in the *same family* is issued and returned.
   */
  async rotate(
    presentedToken: string,
  ): Promise<
    | { outcome: 'invalid' }
    | { outcome: 'reused'; familyId: string }
    | { outcome: 'rotated'; userId: string; orgId: string; next: IssuedRefreshToken }
  > {
    const tokenHash = hashToken(presentedToken);
    const row = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });

    if (!row || row.expiresAt < new Date()) {
      return { outcome: 'invalid' };
    }

    if (row.revokedAt) {
      return { outcome: 'reused', familyId: row.familyId };
    }

    const nextToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const [inserted] = await this.db
      .insert(refreshTokens)
      .values({
        tokenHash: hashToken(nextToken),
        familyId: row.familyId,
        userId: row.userId,
        orgId: row.orgId,
        expiresAt,
      })
      .returning({ id: refreshTokens.id });

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: inserted.id })
      .where(eq(refreshTokens.id, row.id));

    return {
      outcome: 'rotated',
      userId: row.userId,
      orgId: row.orgId,
      next: { token: nextToken, familyId: row.familyId, expiresAt },
    };
  }

  /** Revokes every live token in a family — used on reuse detection and on logout. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  /** Logout: revoke the family the presented token belongs to. */
  async revokeByToken(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);
    const row = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });
    if (row) {
      await this.revokeFamily(row.familyId);
    }
  }
}
