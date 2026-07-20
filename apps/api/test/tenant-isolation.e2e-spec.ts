import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/db/drizzle.token';
import { orgs, users, memberships } from '../src/db/schema';
import { Role, scopeFromVerifiedClaims } from '../src/db/scope';
import { MembershipsRepository } from '../src/db/repositories/memberships.repository';
import { OrgsRepository } from '../src/db/repositories/orgs.repository';

/**
 * ADR-0001 §Decision-3's residual mitigation: this file grows by one case
 * per new scoped data-access function. It seeds two real tenants, calls each
 * exported scoped function with the *other* org's scope, and asserts zero
 * rows cross the boundary — a mocked scope would prove nothing about the
 * seam this test exists to guard.
 */
describe('Tenant isolation (query-layer enforcement)', () => {
  let app: INestApplication;
  let db: Database;
  let membershipsRepo: MembershipsRepository;
  let orgsRepo: OrgsRepository;

  let orgA: { id: string; name: string };
  let orgB: { id: string; name: string };
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    db = app.get(DRIZZLE);
    membershipsRepo = app.get(MembershipsRepository);
    orgsRepo = app.get(OrgsRepository);

    const suffix = Date.now();
    [orgA] = await db
      .insert(orgs)
      .values({ name: `Isolation Test Org A ${suffix}`, slug: `iso-test-a-${suffix}` })
      .returning({ id: orgs.id, name: orgs.name });
    [orgB] = await db
      .insert(orgs)
      .values({ name: `Isolation Test Org B ${suffix}`, slug: `iso-test-b-${suffix}` })
      .returning({ id: orgs.id, name: orgs.name });

    [userA] = await db
      .insert(users)
      .values({ email: `iso-a-${suffix}@example.test`, passwordHash: 'x' })
      .returning({ id: users.id, email: users.email });
    [userB] = await db
      .insert(users)
      .values({ email: `iso-b-${suffix}@example.test`, passwordHash: 'x' })
      .returning({ id: users.id, email: users.email });

    await db.insert(memberships).values([
      { userId: userA.id, orgId: orgA.id, role: Role.Owner },
      { userId: userB.id, orgId: orgB.id, role: Role.Owner },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await db.delete(orgs).where(eq(orgs.id, orgA.id));
    await db.delete(orgs).where(eq(orgs.id, orgB.id));
    await app.close();
  });

  it('MembershipsRepository.listOrgMembers: org B scope returns zero org A rows', async () => {
    const scopeB = scopeFromVerifiedClaims({ sub: userB.id, org: orgB.id, role: Role.Owner });

    const rows = await membershipsRepo.listOrgMembers(scopeB);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.email !== userA.email)).toBe(true);
    expect(rows.every((row) => row.email === userB.email)).toBe(true);
  });

  it('MembershipsRepository.listOrgMembers: org A scope returns zero org B rows', async () => {
    const scopeA = scopeFromVerifiedClaims({ sub: userA.id, org: orgA.id, role: Role.Owner });

    const rows = await membershipsRepo.listOrgMembers(scopeA);

    expect(rows.every((row) => row.email !== userB.email)).toBe(true);
  });

  it('OrgsRepository.getScoped: a valid token for org B cannot fetch org A by naming its id', async () => {
    // There is no parameter to name org A with — `getScoped` reads only
    // `scope.orgId`. This test documents that the request is unrepresentable,
    // not merely rejected: passing org B's scope can only ever resolve org B.
    const scopeB = scopeFromVerifiedClaims({ sub: userB.id, org: orgB.id, role: Role.Owner });

    const resolved = await orgsRepo.getScoped(scopeB);

    expect(resolved?.id).toBe(orgB.id);
    expect(resolved?.id).not.toBe(orgA.id);
  });
});
