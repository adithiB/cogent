/**
 * Seeds a demo org with a realistic spread of usage events, through the
 * REAL HTTP API — signup, then the same `POST /v1/events` ingestion
 * endpoint a customer's own services would call, authenticated with the
 * API key signup mints (ADR-0002 §2c). Nothing here writes to Postgres
 * directly, so the seeded state is reachable only through paths the
 * product actually exposes: if ingestion or the API-key guard is broken,
 * this script fails rather than papering over it with a direct insert.
 *
 * Used to set up the demo walkthrough (`docs/demo-walkthrough.md`).
 *
 * Requires the API running locally. Usage:
 *   npm run seed:demo
 *   npm run seed:demo -- --api http://localhost:3000/api
 */

const DEFAULT_API = 'http://localhost:3000/api';

const args = process.argv.slice(2);
const apiFlag = args.indexOf('--api');
const API = apiFlag >= 0 ? args[apiFlag + 1] : DEFAULT_API;

const DEMO_ORG = 'Northwind Data';
const DEMO_EMAIL = 'demo@northwind.example';
const DEMO_PASSWORD = 'demo-password-12345';

/** Deterministic PRNG (mulberry32) — a fixed seed means the demo renders
 * the same numbers every time it's reset, so the walkthrough's screenshots
 * and its prose can quote figures that will actually match on a re-run. */
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ServiceProfile {
  project: string;
  team: string;
  model: string;
  /** Micro-dollars per request, before jitter. Integer (ADR-0002 §1d). */
  baseCostMicros: number;
  baseLatencyMs: number;
  errorRate: number;
  requestsPerDay: number;
}

/** Shaped so the Statement tells a story at a glance: one expensive
 * frontier-model service dominating spend, one cheap high-volume service,
 * one slow-and-erroring service worth asking the assistant about. */
const PROFILES: ServiceProfile[] = [
  {
    project: 'checkout-service',
    team: 'payments',
    model: 'gpt-4o',
    baseCostMicros: 42_000,
    baseLatencyMs: 880,
    errorRate: 0.02,
    requestsPerDay: 34,
  },
  {
    project: 'recs-worker',
    team: 'ml',
    model: 'claude-3-5-haiku',
    baseCostMicros: 3_400,
    baseLatencyMs: 240,
    errorRate: 0.01,
    requestsPerDay: 120,
  },
  {
    project: 'billing-api',
    team: 'payments',
    model: 'claude-3-5-haiku',
    baseCostMicros: 5_100,
    baseLatencyMs: 310,
    errorRate: 0.005,
    requestsPerDay: 46,
  },
  {
    project: 'search-indexer',
    team: 'platform',
    model: 'llama-3.1-70b',
    baseCostMicros: 1_200,
    baseLatencyMs: 1_450,
    errorRate: 0.085,
    requestsPerDay: 62,
  },
];

const DAYS_OF_HISTORY = 14;

interface SignupResponse {
  authenticated: boolean;
  org: { name: string };
  apiKey: string;
}

async function main(): Promise<void> {
  console.log(`Seeding demo data against ${API}\n`);

  const signup = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      orgName: DEMO_ORG,
    }),
  });

  if (!signup.ok) {
    const body = await signup.text();
    console.error(
      `Signup failed (${signup.status}). If the demo org already exists, ` +
        `reset the database first:\n` +
        `  docker compose down -v && docker compose up -d postgres && npm run db:migrate\n\n` +
        body,
    );
    process.exit(1);
  }

  const { apiKey } = (await signup.json()) as SignupResponse;
  console.log(`Created org "${DEMO_ORG}"  ·  login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  const random = makeRandom(20260728);
  const now = Date.now();
  const events: Record<string, unknown>[] = [];

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    for (const profile of PROFILES) {
      // Weekends run lighter — makes the time-series look like real traffic
      // rather than a flat synthetic line.
      const date = new Date(now - dayOffset * 86_400_000);
      const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      const volume = Math.round(
        profile.requestsPerDay * (isWeekend ? 0.45 : 1) * (0.85 + random() * 0.3),
      );

      // Spread events across the UTC day, but never past "now" — a usage
      // ledger with future-dated events is wrong on its face, and it also
      // makes the demo's own numbers disagree with each other: a statement
      // window ending at `now` would exclude rows that an assistant window
      // ending at month-end includes, which reads as a bug in the product
      // when it's really a bug in the seed. Caught by reconciling a $17.93
      // assistant answer against a $17.69 table cell.
      const dayStart = date.getTime() - (date.getTime() % 86_400_000);
      const spread = Math.min(86_400_000, now - dayStart);

      for (let i = 0; i < volume; i++) {
        const occurredAt = new Date(dayStart + Math.floor(random() * spread));
        const isError = random() < profile.errorRate;
        events.push({
          externalId: `seed-${profile.project}-${dayOffset}-${i}`,
          occurredAt: occurredAt.toISOString(),
          project: profile.project,
          team: profile.team,
          model: profile.model,
          // Errors are slow — a timeout costs latency without buying tokens.
          latencyMs: Math.round(
            profile.baseLatencyMs * (isError ? 4 + random() * 3 : 0.7 + random() * 0.7),
          ),
          isError,
          costMicros: Math.round(
            profile.baseCostMicros * (isError ? 0.25 : 0.75 + random() * 0.6),
          ),
        });
      }
    }
  }

  console.log(`Ingesting ${events.length} events…`);

  let ok = 0;
  let failed = 0;
  const CONCURRENCY = 12;

  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const batch = events.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((event) =>
        fetch(`${API}/v1/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(event),
        }).then((r) => r.ok),
      ),
    );
    for (const success of results) success ? ok++ : failed++;
    process.stdout.write(`\r  ${ok + failed}/${events.length}`);
  }

  console.log(`\n  ${ok} ingested, ${failed} failed`);

  if (failed > 0) {
    console.error('\nSome events failed to ingest — demo data is incomplete.');
    process.exit(1);
  }

  const totalMicros = events.reduce(
    (sum, e) => sum + (e.costMicros as number),
    0,
  );
  console.log(
    `\nDone. ${events.length} events, $${(totalMicros / 1_000_000).toFixed(2)} total spend ` +
      `across ${PROFILES.length} projects over ${DAYS_OF_HISTORY} days.`,
  );
  console.log(`\nLog in at http://localhost:3001 with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

void main();
