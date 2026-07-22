import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysRepository } from '../db/repositories/api-keys.repository';
import { Role, scopeFromVerifiedClaims } from '../db/scope';
import type { RequestWithScope } from './auth.guard';

/** Sentinel `sub`: ingestion is machine-to-machine (ADR-0001 §Decision-2,
 * ADR-0002 §2c) — there is no human user id on this credential. */
const SERVICE_PRINCIPAL = 'service:ingestion';

/**
 * ADR-0002 §2c: the second, distinct credential type carrying the *same*
 * trust boundary as `AuthGuard`'s JWT. Verifies a bearer API key by hash
 * lookup and constructs a `TenantScope` through the same sole constructor
 * (`scopeFromVerifiedClaims`, ADR-0001 §Decision-3(ii)) — never from
 * anything the request body supplies. The org-scoping guarantee this
 * produces gets its own adversarial proof in the tenant-isolation contract
 * test; it does not inherit `AuthGuard`'s.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const key = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!key) {
      throw new UnauthorizedException('Missing API key.');
    }

    const record = await this.apiKeys.findActiveByToken(key);
    if (!record) {
      throw new UnauthorizedException('Invalid or revoked API key.');
    }

    (req as RequestWithScope).scope = scopeFromVerifiedClaims({
      sub: SERVICE_PRINCIPAL,
      org: record.orgId,
      role: Role.Member,
    });
    return true;
  }
}
