import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { DRIZZLE, type Database } from '../drizzle.token';
import { apiKeys } from '../schema';

/**
 * ADR-0002 §2c: 32 bytes of CSPRNG, `sk_`-prefixed so a leaked key is
 * recognizable in logs/secret scanners. Mirrors `RefreshTokensRepository`'s
 * opaque-token pattern — this is not a JWT, it carries no claims to forge.
 */
export function generateApiKey(): string {
  return `sk_${randomBytes(32).toString('base64url')}`;
}

/**
 * SHA-256, not argon2id — same reasoning as ADR-0001 §1c's refresh-token
 * hash: 256 bits of CSPRNG output has no dictionary to defend against, so a
 * slow KDF adds latency to every ingest request and defends against nothing.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

@Injectable()
export class ApiKeysRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Unscoped by necessity: this *is* the credential-verification step
   * (`ApiKeyGuard`), called before any `TenantScope` exists — mirrors
   * `RefreshTokensRepository`'s pre-scope hash lookup for the refresh cookie.
   */
  findActiveByToken(presentedKey: string) {
    const tokenHash = hashApiKey(presentedKey);
    return this.db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.tokenHash, tokenHash), isNull(apiKeys.revokedAt)),
    });
  }
}
