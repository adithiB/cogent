import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/db/drizzle.token';
import { orgs, users, memberships, usageEvents } from '../src/db/schema';
import {
  Role,
  scopeFromVerifiedClaims,
  type TenantScope,
} from '../src/db/scope';
import { MembershipsRepository } from '../src/db/repositories/memberships.repository';
import { OrgsRepository } from '../src/db/repositories/orgs.repository';
import { UsageEventsRepository } from '../src/db/repositories/usage-events.repository';
import { BudgetAlertsRepository } from '../src/db/repositories/budget-alerts.repository';
import { ACCESS_COOKIE } from '../src/auth/cookies';
import { OllamaAssistantClient } from '../src/assistant/ollama-client';

/**
 * ADR-0004, re-targeted by the 2026-07-23/24 amendment: the assistant tests
 * below mock the local Ollama client itself — this is a portfolio project
 * and CI has no Ollama daemon available — but exercise everything
 * downstream of the model's tool call for real: real signup, real httpOnly
 * session cookie, real `AuthGuard`, real dispatch, real database.
 * `overrideProvider(OllamaAssistantClient)` replaces the pre-amendment
 * `jest.mock('@anthropic-ai/sdk')`, scoped to this describe block's own
 * TestingModule rather than file-wide, since Nest DI override is the
 * correct seam for a class-based provider (§6's "one-class seam").
 */

function extractAccessCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(raw)
    ? raw
    : [raw].filter((c): c is string => Boolean(c));
  const accessCookie = cookies.find((c) => c.startsWith(`${ACCESS_COOKIE}=`));
  if (!accessCookie)
    throw new Error(`No ${ACCESS_COOKIE} cookie in signup response.`);
  return accessCookie.split(';')[0];
}

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
  let usageEventsRepo: UsageEventsRepository;

  let orgA: { id: string; name: string };
  let orgB: { id: string; name: string };
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };

  const usageWindow = {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-01-02T00:00:00Z'),
  };
  let projectA: string;
  let projectB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts's bootstrap so the ingestion HTTP tests below hit the
    // same route shape (`/api/v1/events`) the deployed app actually serves.
    app.setGlobalPrefix('api');
    await app.init();

    db = app.get(DRIZZLE);
    membershipsRepo = app.get(MembershipsRepository);
    orgsRepo = app.get(OrgsRepository);
    usageEventsRepo = app.get(UsageEventsRepository);

    const suffix = Date.now();
    [orgA] = await db
      .insert(orgs)
      .values({
        name: `Isolation Test Org A ${suffix}`,
        slug: `iso-test-a-${suffix}`,
      })
      .returning({ id: orgs.id, name: orgs.name });
    [orgB] = await db
      .insert(orgs)
      .values({
        name: `Isolation Test Org B ${suffix}`,
        slug: `iso-test-b-${suffix}`,
      })
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

    // ADR-0002 §Decision-3: seeded so getSpend/getLatency/etc. are checked
    // for a *correct* value under the other org's scope, not merely a
    // non-crashing one — org A's p95/sum are hand-derivable from these two
    // rows, which is what catches a missing WHERE clause that would still
    // "work" but silently include org B's rows in the aggregate.
    projectA = `iso-usage-a-${suffix}`;
    projectB = `iso-usage-b-${suffix}`;
    await db.insert(usageEvents).values([
      {
        orgId: orgA.id,
        externalId: `iso-evt-a1-${suffix}`,
        occurredAt: new Date('2026-01-01T10:00:00Z'),
        project: projectA,
        team: 'team-a',
        model: 'gpt-4o',
        latencyMs: 100,
        isError: false,
        costMicros: 1_000_000,
      },
      {
        orgId: orgA.id,
        externalId: `iso-evt-a2-${suffix}`,
        occurredAt: new Date('2026-01-01T11:00:00Z'),
        project: projectA,
        team: 'team-a',
        model: 'gpt-4o',
        latencyMs: 300,
        isError: true,
        costMicros: 2_000_000,
      },
      {
        orgId: orgB.id,
        externalId: `iso-evt-b1-${suffix}`,
        occurredAt: new Date('2026-01-01T10:30:00Z'),
        project: projectB,
        team: 'team-b',
        model: 'claude',
        latencyMs: 200,
        isError: false,
        costMicros: 5_000_000,
      },
    ]);
  });

  afterAll(async () => {
    // `usage_events`/`api_keys` cascade-delete via their `orgs` FK
    // (ON DELETE cascade) — deleting the seeded orgs is sufficient.
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await db.delete(orgs).where(eq(orgs.id, orgA.id));
    await db.delete(orgs).where(eq(orgs.id, orgB.id));
    await app.close();
  });

  it('MembershipsRepository.listOrgMembers: org B scope returns zero org A rows', async () => {
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const rows = await membershipsRepo.listOrgMembers(scopeB);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.email !== userA.email)).toBe(true);
    expect(rows.every((row) => row.email === userB.email)).toBe(true);
  });

  it('MembershipsRepository.listOrgMembers: org A scope returns zero org B rows', async () => {
    const scopeA = scopeFromVerifiedClaims({
      sub: userA.id,
      org: orgA.id,
      role: Role.Owner,
    });

    const rows = await membershipsRepo.listOrgMembers(scopeA);

    expect(rows.every((row) => row.email !== userB.email)).toBe(true);
  });

  it('OrgsRepository.getScoped: a valid token for org B cannot fetch org A by naming its id', async () => {
    // There is no parameter to name org A with — `getScoped` reads only
    // `scope.orgId`. This test documents that the request is unrepresentable,
    // not merely rejected: passing org B's scope can only ever resolve org B.
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const resolved = await orgsRepo.getScoped(scopeB);

    expect(resolved?.id).toBe(orgB.id);
    expect(resolved?.id).not.toBe(orgA.id);
  });

  // ADR-0002 §Decision-3 / §Consequences: one case per named aggregation
  // function. Each assertion checks a *correct* value derivable by hand from
  // the seeded rows, not just an empty/non-empty shape — a missing WHERE
  // clause would still return a plausible-looking number if these only
  // checked "org B sees no org A email"-style absence.

  it('UsageEventsRepository.getSpend: org A scope sums only org A rows ($3.00, not $8.00)', async () => {
    const scopeA = scopeFromVerifiedClaims({
      sub: userA.id,
      org: orgA.id,
      role: Role.Owner,
    });

    const result = await usageEventsRepo.getSpend(scopeA, {
      window: usageWindow,
    });

    expect(result).toEqual({
      intent: 'point',
      metric: 'spend',
      value: 3,
      unit: 'usd',
    });
  });

  it('UsageEventsRepository.getSpend: org B scope sums only org B rows ($5.00, not $8.00)', async () => {
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const result = await usageEventsRepo.getSpend(scopeB, {
      window: usageWindow,
    });

    expect(result).toEqual({
      intent: 'point',
      metric: 'spend',
      value: 5,
      unit: 'usd',
    });
  });

  it("UsageEventsRepository.getSpend (grouped): org A scope never surfaces org B's project as a row key", async () => {
    const scopeA = scopeFromVerifiedClaims({
      sub: userA.id,
      org: orgA.id,
      role: Role.Owner,
    });

    const result = await usageEventsRepo.getSpend(scopeA, {
      window: usageWindow,
      groupBy: 'project',
    });

    expect(result.intent).toBe('slice');
    if (result.intent !== 'slice') return;
    expect(result.rows).toEqual([{ key: projectA, value: 3 }]);
    expect(result.rows.some((r) => r.key === projectB)).toBe(false);
  });

  it("UsageEventsRepository.getRequestVolume: org A = 2 requests, org B = 1, never the other's count", async () => {
    const scopeA = scopeFromVerifiedClaims({
      sub: userA.id,
      org: orgA.id,
      role: Role.Owner,
    });
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const resultA = await usageEventsRepo.getRequestVolume(scopeA, {
      window: usageWindow,
    });
    const resultB = await usageEventsRepo.getRequestVolume(scopeB, {
      window: usageWindow,
    });

    expect(resultA).toEqual({
      intent: 'point',
      metric: 'requests',
      value: 2,
      unit: 'count',
    });
    expect(resultB).toEqual({
      intent: 'point',
      metric: 'requests',
      value: 1,
      unit: 'count',
    });
  });

  it("UsageEventsRepository.getLatency: p95 is the true DB-computed percentile of each org's own rows", async () => {
    const scopeA = scopeFromVerifiedClaims({
      sub: userA.id,
      org: orgA.id,
      role: Role.Owner,
    });
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const resultA = await usageEventsRepo.getLatency(scopeA, {
      window: usageWindow,
    });
    const resultB = await usageEventsRepo.getLatency(scopeB, {
      window: usageWindow,
    });

    // percentile_cont(0.95) over sorted [100, 300], h = 0.95*(2-1) = 0.95:
    // 100 + 0.95*(300-100) = 290. Verified by the DB, not approximated here.
    expect(resultA.intent).toBe('point');
    if (resultA.intent === 'point') expect(resultA.value).toBeCloseTo(290, 5);
    // org B has one row (200ms) — including org A's [100,300] would pull
    // this away from 200 in either direction.
    expect(resultB.intent).toBe('point');
    if (resultB.intent === 'point') expect(resultB.value).toBeCloseTo(200, 5);
  });

  it('UsageEventsRepository.getErrorRate: org A = 50% (1 of 2), org B = 0% (0 of 1)', async () => {
    const scopeA = scopeFromVerifiedClaims({
      sub: userA.id,
      org: orgA.id,
      role: Role.Owner,
    });
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const resultA = await usageEventsRepo.getErrorRate(scopeA, {
      window: usageWindow,
    });
    const resultB = await usageEventsRepo.getErrorRate(scopeB, {
      window: usageWindow,
    });

    expect(resultA.intent).toBe('point');
    if (resultA.intent === 'point') expect(resultA.value).toBeCloseTo(50, 5);
    expect(resultB.intent).toBe('point');
    if (resultB.intent === 'point') expect(resultB.value).toBeCloseTo(0, 5);
  });

  it("UsageEventsRepository.getStatement: org B scope produces one row, for org B's project only", async () => {
    const scopeB = scopeFromVerifiedClaims({
      sub: userB.id,
      org: orgB.id,
      role: Role.Owner,
    });

    const { rows, totals } = await usageEventsRepo.getStatement(scopeB, {
      window: usageWindow,
      groupBy: 'project',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].lineItem).toBe(projectB);
    expect(rows[0].requests).toBe(1);
    expect(rows[0].spendMicros).toBe(5_000_000);
    expect(rows.some((r) => r.lineItem === projectA)).toBe(false);
    expect(totals.spendMicros).toBe(5_000_000);
  });
});

/**
 * cogent-ui-implementation-spec.md §2.4 / this session's build prompt:
 * `budget_alerts` gets the same contract-test coverage every other scoped
 * table has — one case per exported function, seeded with real cross-tenant
 * data, asserting the other org's scope never reaches it.
 */
describe('Tenant isolation — budget alerts (spec §2.4)', () => {
  let app: INestApplication;
  let db: Database;
  let budgetAlertsRepo: BudgetAlertsRepository;

  let orgG: { id: string; name: string };
  let orgH: { id: string; name: string };
  let scopeG: TenantScope;
  let scopeH: TenantScope;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    db = app.get(DRIZZLE);
    budgetAlertsRepo = app.get(BudgetAlertsRepository);

    const suffix = Date.now();
    [orgG] = await db
      .insert(orgs)
      .values({
        name: `Isolation Budgets Org G ${suffix}`,
        slug: `iso-budgets-g-${suffix}`,
      })
      .returning({ id: orgs.id, name: orgs.name });
    [orgH] = await db
      .insert(orgs)
      .values({
        name: `Isolation Budgets Org H ${suffix}`,
        slug: `iso-budgets-h-${suffix}`,
      })
      .returning({ id: orgs.id, name: orgs.name });

    scopeG = scopeFromVerifiedClaims({
      sub: 'seed',
      org: orgG.id,
      role: Role.Owner,
    });
    scopeH = scopeFromVerifiedClaims({
      sub: 'seed',
      org: orgH.id,
      role: Role.Owner,
    });

    await budgetAlertsRepo.create(scopeG, {
      scopeDimension: 'project',
      scopeValue: 'proj-g',
      thresholdType: 'amount',
      thresholdAmountMicros: 2_000_000_000,
      thresholdPercent: null,
      budgetAmountMicros: null,
      notifyEmail: 'owner-g@example.test',
    });
    await budgetAlertsRepo.create(scopeH, {
      scopeDimension: 'project',
      scopeValue: 'proj-h',
      thresholdType: 'percent',
      thresholdAmountMicros: null,
      thresholdPercent: 80,
      budgetAmountMicros: 5_000_000_000,
      notifyEmail: 'owner-h@example.test',
    });
  });

  afterAll(async () => {
    await db.delete(orgs).where(eq(orgs.id, orgG.id));
    await db.delete(orgs).where(eq(orgs.id, orgH.id));
    await app.close();
  });

  it('list: org G scope returns only proj-g, never proj-h', async () => {
    const rows = await budgetAlertsRepo.list(scopeG);
    expect(rows).toHaveLength(1);
    expect(rows[0].scopeValue).toBe('proj-g');
  });

  it('list: org H scope returns only proj-h, never proj-g', async () => {
    const rows = await budgetAlertsRepo.list(scopeH);
    expect(rows).toHaveLength(1);
    expect(rows[0].scopeValue).toBe('proj-h');
  });

  it("findByScope: org H's scope cannot resolve org G's alert by naming its dimension/value", async () => {
    const found = await budgetAlertsRepo.findByScope(
      scopeH,
      'project',
      'proj-g',
    );
    expect(found).toBeUndefined();
  });

  it("remove: org H's scope cannot delete org G's alert by id — zero rows affected, row still exists", async () => {
    const [gAlert] = await budgetAlertsRepo.list(scopeG);
    const removed = await budgetAlertsRepo.remove(scopeH, gAlert.id);
    expect(removed).toBe(false);

    const stillThere = await budgetAlertsRepo.findByScope(
      scopeG,
      'project',
      'proj-g',
    );
    expect(stillThere?.id).toBe(gAlert.id);
  });

  it("remove: org G's own scope can delete its own alert", async () => {
    const [gAlert] = await budgetAlertsRepo.list(scopeG);
    const removed = await budgetAlertsRepo.remove(scopeG, gAlert.id);
    expect(removed).toBe(true);
    expect(await budgetAlertsRepo.list(scopeG)).toHaveLength(0);
  });
});

/**
 * ADR-0002 §2c/§2b (build-session non-negotiable, added on approval): the
 * API key is a *second, distinct credential type* on the same trust boundary
 * as the JWT. It does not inherit AuthGuard's proof — org-scoping on this
 * path is verified independently, end to end over real HTTP through
 * `ApiKeyGuard`, exactly as adversarially as the JWT path above.
 */
describe('Tenant isolation — API-key ingestion credential (ADR-0002 §2c)', () => {
  let app: INestApplication<App>;
  let db: Database;

  let orgC: { id: string; name: string };
  let orgD: { id: string; name: string };
  let apiKeyC: string;
  let apiKeyD: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    db = app.get(DRIZZLE);

    const suffix = Date.now();

    // Real signups over HTTP — the API key under test is the one the
    // product actually mints (ADR-0002 §2c extends ADR-0001's signup
    // transaction), not one poked directly into the database.
    const signupC = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: `iso-ingest-c-${suffix}@example.test`,
        password: 'correct horse battery staple',
        orgName: `Isolation Ingest Org C ${suffix}`,
      })
      .expect(201);
    const signupD = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: `iso-ingest-d-${suffix}@example.test`,
        password: 'correct horse battery staple',
        orgName: `Isolation Ingest Org D ${suffix}`,
      })
      .expect(201);

    apiKeyC = (signupC.body as { apiKey: string }).apiKey;
    apiKeyD = (signupD.body as { apiKey: string }).apiKey;
    expect(typeof apiKeyC).toBe('string');
    expect(typeof apiKeyD).toBe('string');

    const orgRowC = await db.query.orgs.findFirst({
      where: eq(orgs.name, `Isolation Ingest Org C ${suffix}`),
    });
    const orgRowD = await db.query.orgs.findFirst({
      where: eq(orgs.name, `Isolation Ingest Org D ${suffix}`),
    });
    if (!orgRowC || !orgRowD)
      throw new Error('Signup did not create the expected org rows.');
    orgC = orgRowC;
    orgD = orgRowD;
  });

  afterAll(async () => {
    await db.delete(orgs).where(eq(orgs.id, orgC.id));
    await db.delete(orgs).where(eq(orgs.id, orgD.id));
    await app.close();
  });

  it('a valid API key writes an event under its own org', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${apiKeyC}`)
      .send({
        externalId: `iso-ingest-evt-c1-${Date.now()}`,
        occurredAt: '2026-01-01T12:00:00Z',
        project: 'ingest-proj',
        team: 'ingest-team',
        model: 'gpt-4o',
        latencyMs: 150,
        isError: false,
        costMicros: 1_000_000,
      });

    expect(res.status).toBe(201);
    const row = await db.query.usageEvents.findFirst({
      where: eq(usageEvents.orgId, orgC.id),
    });
    expect(row?.orgId).toBe(orgC.id);
  });

  it('UNIQUE(org_id, external_id) rejects a duplicate externalId (409), and does not double-insert', async () => {
    // ADR-0002 §1d/§2d: this constraint is what makes the future queue's
    // at-least-once delivery safe (`ON CONFLICT (org_id, external_id) DO
    // NOTHING`). An unenforced constraint here would be a silent hole in
    // that escalation story — verified now, not assumed.
    const externalId = `iso-ingest-evt-dup-${Date.now()}`;
    const body = {
      externalId,
      occurredAt: '2026-01-01T12:02:00Z',
      project: 'ingest-proj',
      team: 'ingest-team',
      model: 'gpt-4o',
      latencyMs: 175,
      isError: false,
      costMicros: 2_000_000,
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${apiKeyC}`)
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${apiKeyC}`)
      .send(body);
    expect(second.status).toBe(409);

    const rows = await db.query.usageEvents.findMany({
      where: eq(usageEvents.externalId, externalId),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].costMicros).toBe(2_000_000);
  });

  it('a payload-supplied orgId naming another org is rejected at the boundary (400), and writes nothing', async () => {
    const externalId = `iso-ingest-evt-spoof-${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${apiKeyC}`)
      .send({
        externalId,
        occurredAt: '2026-01-01T12:05:00Z',
        project: 'ingest-proj',
        team: 'ingest-team',
        model: 'gpt-4o',
        latencyMs: 150,
        isError: false,
        costMicros: 1_000_000,
        orgId: orgD.id, // ADR-0002 §2b: no DTO field for this — Zod `.strict()` must reject it.
      });

    expect(res.status).toBe(400);

    const rowUnderD = await db.query.usageEvents.findFirst({
      where: eq(usageEvents.orgId, orgD.id),
    });
    expect(rowUnderD).toBeUndefined();
    const rowByExternalId = await db.query.usageEvents.findFirst({
      where: eq(usageEvents.externalId, externalId),
    });
    expect(rowByExternalId).toBeUndefined();
  });

  it("org D's key cannot be used to write or read as org C — the credential resolves only its own org", async () => {
    const externalId = `iso-ingest-evt-d1-${Date.now()}`;
    const usageEventsRepo = app.get(UsageEventsRepository);
    const scopeC = scopeFromVerifiedClaims({
      sub: 'service:ingestion',
      org: orgC.id,
      role: Role.Member,
    });
    const window = {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-02T00:00:00Z'),
    };

    // Captured *before* D's write, not hardcoded — other tests in this
    // block also write under org C, so the correct claim is "D's write
    // changes nothing about what C's own scoped read sees," not "C's
    // total is some fixed number that happens to depend on test order."
    const spendCBefore = await usageEventsRepo.getSpend(scopeC, { window });

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${apiKeyD}`)
      .send({
        externalId,
        occurredAt: '2026-01-01T12:10:00Z',
        project: 'ingest-proj',
        team: 'ingest-team',
        model: 'claude',
        latencyMs: 400,
        isError: true,
        costMicros: 9_000_000,
      })
      .expect(201);

    // Written under D, not C.
    const rowD = await db.query.usageEvents.findFirst({
      where: eq(usageEvents.externalId, externalId),
    });
    expect(rowD?.orgId).toBe(orgD.id);
    expect(rowD?.orgId).not.toBe(orgC.id);

    // And a read scoped by C's own key-derived scope is unchanged by it —
    // closes the loop from write (API-key guard) through read (query layer)
    // over the same real HTTP-authenticated credential.
    const spendCAfter = await usageEventsRepo.getSpend(scopeC, { window });
    expect(spendCAfter).toEqual(spendCBefore);
    // `intent`/`metric` are structural, not order-dependent — worth pinning
    // even though the absolute `value` isn't (other tests in this block
    // also write under org C, so a hardcoded total would be exactly the
    // test-order coupling this rewrite exists to remove).
    expect(spendCAfter.intent).toBe('point');
    expect(spendCAfter.metric).toBe('spend');
  });

  it('missing/invalid API key is rejected (401) before any scope is constructed', async () => {
    const noAuth = await request(app.getHttpServer())
      .post('/api/v1/events')
      .send({
        externalId: `iso-ingest-evt-noauth-${Date.now()}`,
        occurredAt: '2026-01-01T12:15:00Z',
        project: 'ingest-proj',
        team: 'ingest-team',
        model: 'gpt-4o',
        latencyMs: 100,
        isError: false,
        costMicros: 100,
      });
    expect(noAuth.status).toBe(401);

    const badKey = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', 'Bearer sk_not_a_real_key')
      .send({
        externalId: `iso-ingest-evt-badkey-${Date.now()}`,
        occurredAt: '2026-01-01T12:15:00Z',
        project: 'ingest-proj',
        team: 'ingest-team',
        model: 'gpt-4o',
        latencyMs: 100,
        isError: false,
        costMicros: 100,
      });
    expect(badKey.status).toBe(401);
  });
});

/**
 * ADR-0004: the NL-query assistant's cross-tenant guarantee, over real HTTP
 * with a real signed-in session and a real database. `scope` reaches the
 * assistant identically to every other authenticated route (`AuthGuard` →
 * `TenantScope` from the cookie) — this suite proves the model's tool call
 * cannot redirect it, and that `getStatement`'s new `filter` param (Findings
 * §1) actually narrows the re-scope.
 */
describe('Tenant isolation — NL-query assistant (ADR-0004)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let chatMock: jest.Mock;

  let orgE: { id: string; name: string };
  let orgF: { id: string; name: string };
  let cookieE: string;
  let cookieF: string;

  const window = {
    from: new Date('2026-02-01T00:00:00Z'),
    to: new Date('2026-02-02T00:00:00Z'),
  };

  function chatResult(name: string, args: unknown) {
    return {
      toolCalls: [{ function: { name, arguments: args } }],
      content: null,
      promptEvalCount: 1200,
      evalCount: 40,
      totalDurationNs: 4_500_000_000,
    };
  }

  beforeAll(async () => {
    chatMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OllamaAssistantClient)
      .useValue({ chat: chatMock, onModuleInit: jest.fn() })
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);

    const suffix = Date.now();
    const signupE = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: `iso-assist-e-${suffix}@example.test`,
        password: 'correct horse battery staple',
        orgName: `Isolation Assistant Org E ${suffix}`,
      })
      .expect(201);
    const signupF = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: `iso-assist-f-${suffix}@example.test`,
        password: 'correct horse battery staple',
        orgName: `Isolation Assistant Org F ${suffix}`,
      })
      .expect(201);

    cookieE = extractAccessCookie(signupE);
    cookieF = extractAccessCookie(signupF);

    const orgRowE = await db.query.orgs.findFirst({
      where: eq(orgs.name, `Isolation Assistant Org E ${suffix}`),
    });
    const orgRowF = await db.query.orgs.findFirst({
      where: eq(orgs.name, `Isolation Assistant Org F ${suffix}`),
    });
    if (!orgRowE || !orgRowF)
      throw new Error('Signup did not create the expected org rows.');
    orgE = orgRowE;
    orgF = orgRowF;

    const usageEventsRepo = app.get(UsageEventsRepository);
    const scopeE = scopeFromVerifiedClaims({
      sub: 'seed',
      org: orgE.id,
      role: Role.Owner,
    });
    const scopeF = scopeFromVerifiedClaims({
      sub: 'seed',
      org: orgF.id,
      role: Role.Owner,
    });

    // Two projects, two teams within org E — lets the filter test actually
    // narrow the result, not merely return the same single row unfiltered.
    await usageEventsRepo.insertEvent(scopeE, {
      externalId: `assist-e1-${suffix}`,
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      project: 'proj-e1',
      team: 'team-e1',
      model: 'gpt-4o',
      latencyMs: 100,
      isError: false,
      costMicros: 7_000_000,
    });
    await usageEventsRepo.insertEvent(scopeE, {
      externalId: `assist-e2-${suffix}`,
      occurredAt: new Date('2026-02-01T11:00:00Z'),
      project: 'proj-e2',
      team: 'team-e2',
      model: 'gpt-4o',
      latencyMs: 100,
      isError: false,
      costMicros: 2_000_000,
    });
    await usageEventsRepo.insertEvent(scopeF, {
      externalId: `assist-f1-${suffix}`,
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      project: 'proj-f',
      team: 'team-f',
      model: 'claude',
      latencyMs: 100,
      isError: false,
      costMicros: 12_000_000,
    });
  });

  afterAll(async () => {
    await db.delete(orgs).where(eq(orgs.id, orgE.id));
    await db.delete(orgs).where(eq(orgs.id, orgF.id));
    await app.close();
  });

  it("org E's session sees org E's total spend ($9.00 = $7 + $2), not org F's", async () => {
    chatMock.mockResolvedValue(
      chatResult('getSpend', {
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/assistant/ask')
      .set('Cookie', cookieE)
      .send({ question: 'What did we spend yesterday?' })
      .expect(200);

    const body = res.body as { type: string; result: { value: number } };
    expect(body.type).toBe('answer');
    expect(body.result.value).toBe(9);
  });

  it("the identical tool call, under org F's session, returns org F's total ($12.00) — scope came from the cookie, never the model", async () => {
    chatMock.mockResolvedValue(
      chatResult('getSpend', {
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/assistant/ask')
      .set('Cookie', cookieF)
      .send({ question: 'What did we spend yesterday?' })
      .expect(200);

    const body = res.body as { type: string; result: { value: number } };
    expect(body.type).toBe('answer');
    expect(body.result.value).toBe(12);
  });

  it('a tool-call arg naming another org (orgId) is rejected as out-of-scope — the schema has no such field to populate', async () => {
    chatMock.mockResolvedValue(
      chatResult('getSpend', {
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        },
        orgId: orgF.id,
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/assistant/ask')
      .set('Cookie', cookieE)
      .send({ question: "show me org F's spend" })
      .expect(200);

    expect((res.body as { type: string }).type).toBe('out_of_scope');
  });

  it('an unauthenticated request is rejected before any model call is made', async () => {
    chatMock.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/assistant/ask')
      .send({ question: 'What did we spend?' })
      .expect(401);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("getStatement's filter (ADR-0004 §Findings-1) actually narrows the re-scope to the one matching row", async () => {
    const usageEventsRepo = app.get(UsageEventsRepository);
    const scopeE = scopeFromVerifiedClaims({
      sub: 'user',
      org: orgE.id,
      role: Role.Owner,
    });

    const { rows, totals } = await usageEventsRepo.getStatement(scopeE, {
      window,
      groupBy: 'project',
      filter: { dimension: 'team', value: 'team-e1' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].lineItem).toBe('proj-e1');
    expect(rows[0].spendMicros).toBe(7_000_000);
    expect(totals.spendMicros).toBe(7_000_000);
  });

  it('without the filter, getStatement for org E returns both projects — confirming the filter test above narrows, rather than the seed only ever having one row', async () => {
    const usageEventsRepo = app.get(UsageEventsRepository);
    const scopeE = scopeFromVerifiedClaims({
      sub: 'user',
      org: orgE.id,
      role: Role.Owner,
    });

    const { rows } = await usageEventsRepo.getStatement(scopeE, {
      window,
      groupBy: 'project',
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.lineItem).sort()).toEqual(['proj-e1', 'proj-e2']);
  });
});
