import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { DRIZZLE, type Database } from '../db/drizzle.token';
import { orgs, users, memberships } from '../db/schema';
import { OrgsRepository } from '../db/repositories/orgs.repository';
import { UsersRepository } from '../db/repositories/users.repository';
import { MembershipsRepository } from '../db/repositories/memberships.repository';
import { Role } from '../db/scope';
import { hashPassword, verifyPassword } from './password';
import { TokensService } from './tokens.service';
import { LoginRateLimiterService } from './login-rate-limiter.service';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';

export interface SessionView {
  authenticated: true;
  org: { name: string };
  role: Role;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505' &&
    (err as { constraint?: string }).constraint === constraint
  );
}

@Injectable()
export class AuthService {
  /** Precomputed once, verified against on every login for a user that
   * doesn't exist — closes the timing side-channel that would otherwise
   * let an attacker infer whether an email is registered from response
   * latency (argon2 only runs when a real hash exists to compare against). */
  private readonly dummyHash = hashPassword('not-a-real-password-used-for-timing-safety-only');

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly orgs: OrgsRepository,
    private readonly users: UsersRepository,
    private readonly memberships: MembershipsRepository,
    private readonly tokens: TokensService,
    private readonly rateLimiter: LoginRateLimiterService,
  ) {}

  /**
   * ADR-0001 §Decision-4: one transaction, org → user → membership(owner),
   * no check-then-insert. Uniqueness is enforced by the `orgs_slug_unique`
   * and `users_email_unique` DB constraints, caught here — a pre-check
   * would be a TOCTOU race under concurrent signups with the same name.
   */
  async signup(dto: SignupDto, res: Response): Promise<SessionView> {
    const passwordHash = await hashPassword(dto.password);
    const slug = slugify(dto.orgName);

    let created: { orgId: string; orgName: string; userId: string };
    try {
      created = await this.db.transaction(async (tx) => {
        const [org] = await tx.insert(orgs).values({ name: dto.orgName, slug }).returning();
        const [user] = await tx
          .insert(users)
          .values({ email: dto.email, passwordHash })
          .returning();
        await tx.insert(memberships).values({
          userId: user.id,
          orgId: org.id,
          role: Role.Owner,
        });
        return { orgId: org.id, orgName: org.name, userId: user.id };
      });
    } catch (err) {
      if (isUniqueViolation(err, 'orgs_slug_unique')) {
        throw new ConflictException('That organization name is taken.');
      }
      if (isUniqueViolation(err, 'users_email_unique')) {
        throw new ConflictException('That email is already registered.');
      }
      throw err;
    }

    await this.tokens.issueSession(res, created.userId, created.orgId, Role.Owner);
    return { authenticated: true, org: { name: created.orgName }, role: Role.Owner };
  }

  async login(dto: LoginDto, clientIp: string, res: Response): Promise<SessionView> {
    const rateLimitKeys = [`ip:${clientIp}`, `email:${dto.email}`];
    this.rateLimiter.assertAllowed(...rateLimitKeys);

    const user = await this.users.findByEmail(dto.email);
    const membership = user ? await this.memberships.findFirstForUser(user.id) : undefined;

    const hashToVerify = user?.passwordHash ?? (await this.dummyHash);
    const passwordValid = await verifyPassword(hashToVerify, dto.password);

    if (!user || !membership || !passwordValid) {
      this.rateLimiter.recordFailure(...rateLimitKeys);
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    this.rateLimiter.recordSuccess(...rateLimitKeys);

    const org = await this.orgs.findById(membership.orgId);
    await this.tokens.issueSession(res, user.id, membership.orgId, membership.role);
    return { authenticated: true, org: { name: org!.name }, role: membership.role };
  }
}
