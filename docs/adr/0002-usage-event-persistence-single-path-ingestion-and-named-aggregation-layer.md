# ADR-0002: Usage events live in Postgres, arrive on one synchronous path, and are read through named allow-listed aggregation functions

**Status:** Accepted — 2026-07-22. Build handed to a Sonnet session (schedule-v2 §4 Jul 24, §8 model policy). All three judgment calls resolved: DynamoDB rejected; API key minted at signup; `cost_micros` precomputed.
**Date:** 2026-07-22 (schedule-v2 §4 "Jul 24" slot, pulled forward — consistent with ADR-0001 running ~2 days ahead)
**Scope:** MVP, interview-critical. Full rigor.
**Resolves:** `portfolio-plan.md` §Project 2 Core-MVP items 2 ("Ingestion endpoint as a single Lambda, direct write… no SQS/EventBridge for MVP") and 6 ("Postgres + one DynamoDB table (raw usage events)"); `schedule-v2.md` §4 Jul 24 ("Ingestion endpoint + the read-only usage-aggregation layer… ADR for the Lambda/queue design you're not building") and the §1 / §10 DynamoDB test.
**Related:**
- **ADR-0001** (`0001-hand-rolled-jwt-and-org-scoped-rbac.md`) — §Decision 3 established the query-layer enforcement seam (branded `OrgId`, `TenantScope`, the single `orgScope()` predicate helper, the contract test at commit `12eac4e`) **against the four auth tables**. This ADR extends that exact seam to the data the product is actually about — cross-tenant usage events — for both reads and writes. It reuses the primitives in `apps/api/src/db/scope.ts` and `scoped-query.ts`; it does not reinvent them.
- **NL-query guardrails ADR** (`adr-nl-query-guardrails.md`, becomes `0003` on approval) — §Decision names an allow-listed function set (`getSpend`, `getLatency`, …), a Zod-schema-as-allow-list, a server-injected `orgId`, and an `intent: 'point' | 'slice'` result envelope. **That ADR asserts the shape; this ADR builds the functions it binds to.** Decision 3 below is the concrete signature list the Jul 25 assistant will attach LLM tool definitions to.
- **`cogent-ui-implementation-spec.md`** §2.2 — the Statement table (`Line item | Requests | p95 ms | Err % | Spend`) is the read shape Decision 3 must produce; §1.8's `intent` routing contract is the envelope Decision 3 returns.
- **Atlas's kind-vs-Compose ADR** (the "why I didn't run a cluster for a portfolio demo" decision, schedule-v2 §1) — the designed-not-built discipline Decision 2's queue section deliberately mirrors: name the trade and the built version's exact shape, don't build it.

---

## Context

Cogent-AI stores other tenants' **LLM usage and spend** and answers questions over it — on screen (the Statement) and through an LLM (the NL-query assistant). ADR-0001 built the enforcement seam but exercised it only against auth tables (`orgs`, `users`, `memberships`, `refresh_tokens`), where "cross-tenant leak" is close to abstract. This session introduces the table where a leak would actually be the product failing: `usage_events`.

Three decisions land together because they are one data path — write in, storage, read out — and each must carry ADR-0001's scope discipline end to end:

1. **Where usage events live.** `portfolio-plan.md` named DynamoDB. `schedule-v2.md` §1 suspended that pick behind a test and told me to take it today rather than inherit it. Decision 1.
2. **How they get in.** One authenticated ingestion endpoint, synchronous write, no queue — argued, with the queue described but not built. Decision 2.
3. **How they are read.** A read-only layer of named, individually-callable, typed functions — the surface both the Statement and the LLM allow-list call. Decision 3.

**What exists today (verified in-repo).** `apps/api` has ADR-0001 shipped: `db/scope.ts` (branded `OrgId`/`UserId`, `TenantScope`, `scopeFromVerifiedClaims` as the sole scope constructor), `db/scoped-query.ts` (`orgScope()` — the one place the `org_id = $scope.orgId` predicate is written), the four auth tables in `db/schema.ts`, the repository signature convention (`(scope: TenantScope, …)` first-param, see `memberships.repository.ts:listOrgMembers`), and the tenant-isolation contract test (`12eac4e`). Everything below drops into that seam; nothing below invents a parallel one.

---

## Decision 1 — Postgres with a scoped `usage_events` table, **not** DynamoDB. The test, taken.

The instruction was not "recall the partition key" — it was "can you defend the choice the recall implies." I can state the key; stating it is what makes the case *against* DynamoDB, not for it.

### 1a. The test, answered without notes

**Partition key:** `PK = orgId`, `SK = occurredAt#eventId`. Every read is "one org's events over a time window," so the org is the only defensible partition key — anything else scatters a single tenant's data across partitions and forces a scan to reassemble it.

**What happens when one tenant is 90% of writes.** A DynamoDB physical partition has a hard ceiling — **1,000 WCU / 3,000 RCU per partition**, independent of table-level provisioned or on-demand throughput. With `orgId` as the partition key, one dominant tenant's writes all hash to **one** partition. Adaptive capacity will lean throughput toward that hot partition, but it **cannot exceed the per-partition hard cap** — it reallocates, it does not raise the ceiling. So the dominant tenant saturates a single partition and throttles (`ProvisionedThroughputExceededException` / throttled on-demand) while the table as a whole sits far under its provisioned budget. This is the textbook hot-partition failure, and a per-team LLM cost tool has exactly the write distribution that triggers it: one big customer, a long tail of small ones.

**The mitigation, and its cost.** Write sharding: make the key `orgId#<shard>` for `shard ∈ [0, K)`, spreading the hot tenant's writes across `K` partitions. It works — and it moves the cost onto the **read** side: every query must now scatter-gather across all `K` shards and merge in application code, because a single `Query` can only address one partition-key value. You pay for write relief in read complexity, on every read, forever.

So I **pass the recall bar** — key stated, failure mode stated, mitigation stated. That is precisely why I will not hide behind it: the honest answer surfaces a real cost, and the next question is whether anything here pays for it.

### 1b. The product's read surface is aggregation — DynamoDB's weakness, Postgres's native strength

Look at what every read actually is. The Statement (`spec §2.2`): `SUM(spend)`, `COUNT(requests)`, `p95(latency)`, error-rate, **grouped by** project/team/model/time, **over** a window. The assistant's allow-list (guardrail ADR): the same aggregates. This is OLAP-shaped work, and it decides the store:

- **`p95 ms`** is `percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)` — a native Postgres ordered-set aggregate. DynamoDB has no percentile and no `GROUP BY` at all; you would read every event row for the window into the application and compute p95 in memory.
- **`Spend` / `Requests` / `Err %`** are `SUM` / `COUNT` / `COUNT(*) FILTER (…)` grouped by a dimension — one indexed Postgres query. In DynamoDB you either maintain **pre-aggregated rollup items** updated on every write (which is the very stream-processing/queue machinery this project is explicitly deferring — Decision 2), or you **read-all-and-aggregate** (unbounded RCU, the pattern that quietly becomes the biggest line on the bill in a *cost-monitoring product*).

The two facts compose into the verdict. DynamoDB's one genuine advantage here is write throughput — and to keep it under a dominant tenant you must shard, which **degrades exactly the aggregating reads that are the entire product.** You would adopt an operational burden to protect a write scale you do not have at demo volume, and pay for it precisely where the product lives.

### 1c. Verdict, and the symmetry worth saying out loud in an interview

**Ship a single Postgres `usage_events` table**, scoped and indexed. The clean closing line:

> The failure mode that sinks DynamoDB here — one tenant, 90% of writes, one hot partition against a hard per-partition cap — **does not exist in Postgres.** Postgres has no per-partition write-throughput ceiling; a dominant tenant is just more rows on the same table, served by the same `(org_id, occurred_at)` composite index as everyone else. The database whose headline feature I'd be buying is the one whose headline failure I'd then have to engineer around, to serve reads it can't do natively anyway.

This is also what `const.md` already tells me — *don't reach for cloud services unless they meaningfully improve the project or the story* — arrived at by the test rather than asserted from it.

### 1d. The `usage_events` schema

One row per LLM API call. Columns chosen to serve the four metrics grouped by the four dimensions, and nothing speculative:

| Column | Type | Why |
|---|---|---|
| `id` | `uuid` PK | surrogate |
| `org_id` | `uuid NOT NULL` → `orgs.id` | **the scope column** — the only source of the tenant filter, per ADR-0001 §Decision-3 |
| `external_id` | `text NOT NULL` | client-supplied idempotency key. `UNIQUE(org_id, external_id)`. Unused by the synchronous path except to reject dup POSTs — **built now so the queue escalation (2d) needs no migration**, mirroring ADR-0001's "structure the model for the slot" |
| `occurred_at` | `timestamptz NOT NULL` | time window + `groupBy: 'time'` |
| `project` | `text NOT NULL` | dimension |
| `team` | `text NOT NULL` | dimension |
| `model` | `text NOT NULL` | dimension |
| `latency_ms` | `integer NOT NULL` | source for `percentile_cont` p95 |
| `is_error` | `boolean NOT NULL` | error-rate numerator |
| `cost_micros` | `bigint NOT NULL` | spend as **integer micro-dollars**, not float — LLM costs are sub-cent and `SUM` must be exact; the presentation layer divides by 1e6. Avoids the rounding footgun in a product whose whole claim is an accurate bill |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | ingest audit (distinct from `occurred_at`, which the client asserts) |

**Index:** `(org_id, occurred_at)` composite. Every query is `WHERE org_id = $scope AND occurred_at ∈ window`, then a `GROUP BY` over the scanned slice — this index serves the scan; the grouping sorts/hashes the (small, org-and-window-bounded) result. Per-dimension indexes are add-when-measured, not now.

**Token counts / multi-provider price normalization are deliberately absent.** `portfolio-plan.md` defers price normalization; ingestion receives `cost_micros` already computed by the caller. Adding a `token_in/token_out` pair and a price table is the escalation, not the MVP. (Surfaced as a judgment call at the end.)

### 1e. Postgres declarative partitioning — argued, not defaulted to "partitioning is good practice"

**Not at MVP. Single table.** Declarative partitioning earns its keep when (a) the table is large enough that vacuum/index-maintenance/planning on a monolith hurts, (b) you need cheap retention drops (`DETACH`/`DROP` a partition is instant; a `DELETE` over millions of rows is not), or (c) partition pruning meaningfully cuts scan cost. At demo scale — synthetic events in the thousands-to-low-millions — the composite index already gives index scans, pruning saves nothing measurable, and partitioning *adds* cost: a partition-management story (pre-creating future partitions, a default partition) and the constraint that the partition key must be part of every unique index (so `UNIQUE(org_id, external_id)` interacts with the partition scheme). That is real complexity for zero demo-scale benefit — premature, by `const.md`'s ordering.

**Designed, not built — the escalation, named with its trigger:** `PARTITION BY RANGE (occurred_at)`, monthly. Triggered by table size or a data-retention requirement (drop months older than N cheaply). **Time-range, not `HASH (org_id)`** — and the reason is the same as Decision 1's: hash-by-org partitioning exists to relieve a hot-tenant *write* concentration, which is the DynamoDB problem Postgres doesn't have. Time-range instead aligns with the always-windowed read pattern (every query is time-bounded → pruning helps) and gives the cheap retention drop. Choosing the partition axis by the actual access pattern, not by tenancy reflex.

---

## Decision 2 — one synchronous ingestion path, no queue. Argued, with the queue designed and not built.

### 2a. The path

`POST /v1/events`. Authenticate the caller, validate the body (Zod `.strict()`), write one row synchronously to `usage_events`, return `201` (or `409` on a duplicate `external_id`). No SQS, no EventBridge, no worker. At demo data volume one path suffices — this is stated plainly because it is the whole justification, not glossed.

### 2b. Org-scoping on write is the non-negotiable — stated as ADR-0001 stated its own

**An ingested event is scoped to the org whose verified credential authenticated the write. Never a client-supplied `orgId` in the payload.** This is the write-side of ADR-0001 §Decision-3, stated with the same finality ADR-0001 gave signup/login:

- The ingestion DTO is Zod `.strict()` and **contains no `orgId` / `org` / `tenant` field.** A body that includes one is a `400` at the boundary — loudly, not silently stripped (ADR-0001 §Decision-3(i)).
- The write's `org_id` comes from the same `TenantScope` machinery as every read: the auth layer verifies the credential, produces an `OrgId` through the sole constructor, and the insert uses `scope.orgId`. There is no code path where the payload reaches `org_id`.
- The insert goes through a scoped repository function with `scope: TenantScope` as its mandatory first parameter — same convention as `memberships.repository.ts`, same contract-test coverage (extended in Consequences).

The contract test therefore grows a **write** case, not only read cases: authenticate as org A, POST an event carrying a body `orgId` for org B, and assert the row lands under **A** (or is rejected) and is invisible to B's reads. A leak here is the product failing, so it is tested as adversarially as ADR-0001's cross-org read.

**Build-session non-negotiable (added on approval):** the API key is a *second, distinct credential type* carrying the *same* trust boundary as the JWT. It does **not** inherit the JWT path's proof by association — the org-scoping must be shown to hold on the API-key path independently. A request bearing org A's key that attempts, by any means (body field, header, guessed id), to write or be attributed to org B must be rejected exactly as the cross-org *query* tests reject a JWT-authenticated cross-org read. Two credential types, one boundary, two separate proofs.

### 2c. The ingestion credential — per-org API key, because this caller is a machine

Ingestion is machine-to-machine: a customer's own backend service POSTing events, not a browser. ADR-0001 §Decision-2 already committed to this — *"the ingestion endpoint is machine-to-machine… which fits a bearer-credential model far better than a browser session cookie."* This ADR makes that concrete:

- **`api_keys` table:** `(id, org_id, token_hash, name, created_at, revoked_at)`. The key is 32 bytes of CSPRNG, shown once at creation, presented as `Authorization: Bearer <key>`.
- **Stored as a `SHA-256` hash, not argon2id** — the same reasoning as ADR-0001 §1c's refresh token: a 256-bit random secret has no dictionary to defend against, so a slow KDF adds latency to every ingest and defends against nothing. Fast hash for high-entropy secrets.
- The auth path for `/v1/events` verifies the bearer key by hash lookup, resolves `org_id`, and constructs the scope through the **same** `scopeFromVerifiedClaims`-style single constructor — the ingestion scope is an `OrgId` produced only by a verified credential, identical discipline to the JWT path (`userId` is a service sentinel; `role` is irrelevant to a write).
- **Minted at org creation** (extends ADR-0001's signup transaction by one `api_keys` insert), so a freshly signed-up org can immediately send events. **Key management UI is deferred** to the Settings stub the spec already marks chrome-only (`spec §2.2` line 210); rotation/revocation endpoints are designed-not-built. (Surfaced as a judgment call at the end — minted-at-signup vs. seed-only for the demo.)

Why not reuse the browser JWT for ingestion: it would force a customer's server to run the cookie/refresh dance built for a browser session, and it conflates a human session credential with a service credential — different lifecycles, different revocation stories. ADR-0001 already drew this line; this honors it.

### 2d. The queue — designed, not built, with the built version specified

Same discipline as Atlas's kind-vs-Compose ADR: say why the trade is made, and describe the built version precisely enough that "why didn't you build it" has a concrete answer — then don't build it.

**Why one path suffices now.** At demo volume, a synchronous insert is single-digit milliseconds and the write rate is trivial. A queue would be infrastructure with no load to justify it, and its cost (below) is real.

**What the built version is, specifically** — the answer to `portfolio-plan.md`'s rehearsed interview question *"what happens if 10,000 requests hit your ingestion endpoint in one second?"*:

- **Shape:** `POST /v1/events` validates + authenticates + **enqueues to SQS**, returning **`202 Accepted`** instead of `201 Created`. A separate consumer (Lambda, or a worker) **batch-writes** to Postgres.
- **SQS, not EventBridge.** SQS is a point-to-point buffer with backpressure and a dead-letter queue — exactly the ingestion-smoothing job. EventBridge is for fan-out routing to multiple independent consumers, which MVP does not have. Reaching for EventBridge here would be the same buzzword-over-need error Decision 1 rejects.
- **What it buys:** (1) **backpressure** — the endpoint absorbs a 10k/sec spike into the queue instead of opening 10k concurrent DB connections; the consumer drains at the DB's pace. (2) **retry + DLQ** — a transient DB failure retries; a poison event lands in the DLQ for inspection instead of being lost or blocking the line. (3) **batching** — the consumer writes N events per statement, far higher write efficiency than one-row-per-request. (4) **decoupled availability** — ingestion stays up during a DB blip.
- **The semantic change to name, not hide:** `201` (event durably *written*) becomes `202` (event durably *queued*). That is a real contract change for callers, not a free optimization.
- **The consequence the queue forces, already paid for:** at-least-once delivery means the consumer can see an event twice, so writes must be **idempotent** — `ON CONFLICT (org_id, external_id) DO NOTHING`. This is exactly why `external_id` and its unique constraint are in the 1d schema *now*, under the synchronous path: the escalation to a queue is then a deployment change, not a migration.

**Rejected: build it now for completeness.** Completeness is not a design goal; fit is. Building SQS + a consumer + a DLQ to serve a load that doesn't exist would add three pieces of infrastructure, a `201→202` contract shift, and an idempotent-consumer story — to demonstrate nothing the synchronous path doesn't, at demo volume. The stronger interview artifact is the sentence *"here's the exact queue I'd add, here's the `202` it forces, here's why I didn't add it yet"* — which requires having thought it through, not having built it.

---

## Decision 3 — the read layer is named, individually-callable, typed functions, not a query-builder

### 3a. Named functions vs. a flexible query-builder — the allow-list-is-the-signature-list argument

A single `query(scope, spec)` builder — where `spec` describes metric, grouping, filter, aggregation — is the wrong shape here, for a reason that is specifically about the LLM caller:

The assistant's safety rests on the model being able to call only an approved, finite surface (guardrail ADR: allow-list, not block-list). With **named functions, the allow-list *is* the function list** — the set of LLM tool definitions is literally the set of exported functions, each with a hand-written parameterized SQL body and a declared result shape. Adding a capability is a deliberate act: a new function + its Zod schema + a contract-test case, reviewed in a PR. Nothing the model can say reaches an unlisted capability, because there is no capability that isn't a listed function.

A query-builder inverts that. Its allow-list becomes "any `spec` that validates," and validating a `spec` — which groupings compose, which filters are bounded, which aggregations are safe over which columns — is **enumerate-the-bad one level up**, the exact block-list posture the guardrail ADR spent its length rejecting for SQL. A builder also *generates* SQL from the spec, reintroducing the generated-query surface the guardrail ADR removed. So the builder trades the property the whole feature depends on for flexibility the product doesn't need. Named functions it is — and getting the shape right now is what lets Jul 25 bind tool definitions directly to these signatures instead of retrofitting a validation layer.

### 3b. The functions and their exact signatures

Every signature takes `scope: TenantScope` as the **mandatory, non-optional first parameter**, sourced only from the verified credential context (JWT for a browser caller, API key for a service caller) — identical to ADR-0001's repository convention. **No `args` object contains an `orgId`** (Zod `.strict()`), so there is nothing for a caller — human or model — to populate. When the assistant dispatches the model's chosen `(function, args)`, the server supplies `scope`; the model supplies only `args`. This is the guardrail ADR §Decision-3 property made real: *the model has no `orgId` parameter to get wrong.*

```ts
// Shared vocabulary — the visible allow-list (spec §2.2 Measure + Grouping controls,
// guardrail ADR §Decision-2). All Zod .strict(); none contains orgId.
type Metric    = 'spend' | 'latency' | 'requests' | 'errors';
type Dimension = 'project' | 'team' | 'model' | 'time';
type TimeWindow = { from: Date; to: Date };            // bounded; validated on the way in
type MetricArgs = {
  window: TimeWindow;
  groupBy?: Dimension;                                  // absent → point ; present → slice
  filter?: { dimension: Exclude<Dimension,'time'>; value: string };  // enumerated values only
};

// guardrail ADR §6 envelope — discriminated on `intent`
type MetricResult =
  | { intent: 'point'; metric: Metric; value: number; unit: string }
  | { intent: 'slice'; metric: Metric; groupBy: Dimension; rows: { key: string; value: number }[] };

// --- The assistant allow-list: one function per metric. This list IS the LLM tool set. ---
getSpend        (scope: TenantScope, args: MetricArgs): Promise<MetricResult>;  // SUM(cost_micros)
getRequestVolume(scope: TenantScope, args: MetricArgs): Promise<MetricResult>;  // COUNT(*)
getLatency      (scope: TenantScope, args: MetricArgs): Promise<MetricResult>;  // percentile_cont(0.95)
getErrorRate    (scope: TenantScope, args: MetricArgs): Promise<MetricResult>;  // COUNT(*) FILTER (is_error) / COUNT(*)

// --- The Statement screen surface: all four metrics in one grouped pass. ---
// The §2.2 table renders every metric per line item at once, so this is one query,
// not four merged — and it is a distinct access pattern, not duplication.
type StatementRow = {
  lineItem: string; requests: number; p95Ms: number; errorRatePct: number; spendMicros: number;
};
getStatement(scope: TenantScope, args: { window: TimeWindow; groupBy: Dimension }):
  Promise<{ rows: StatementRow[]; totals: StatementRow }>;
```

**How the two surfaces relate (so this isn't accidental duplication):** the four single-metric functions answer the assistant's `point`/single-metric-`slice` questions and drive the AnswerBlock. `getStatement` produces the full table the screen renders. When a `slice` answer arrives, the UI re-scopes the statement (spec §1.8) by calling `getStatement` with the slice's `groupBy` — the assistant *answers*, the screen *renders*, both over the same scoped SQL primitives (`orgScope()` + the window predicate). Computing all four metrics in one grouped query is strictly cheaper than four grouped queries merged in app code, so `getStatement` is its own function by correctness, not convenience.

### 3c. Confirmation of the mandatory-scope property, function by function

Every function above: `scope: TenantScope` first, non-optional; `scope.orgId` is the sole origin of the `org_id` predicate (via `orgScope()`); no `args` field can carry an org identifier; `scope` is never a value a caller (human or LLM) supplies — it is constructed only from a verified credential. This is the precondition the guardrail ADR's "the model structurally cannot request another org's data" depends on, and Decision 3 is where it becomes true for real data.

---

## Alternatives rejected

- **Keep DynamoDB for the "polyglot persistence" résumé line despite the test.** Rejected, and this is the one to be most explicit about. A buzzword on a résumé does not outrank an unanswerable operational question in an interview — and this question *is* answerable, which is worse: the honest answer (hot partition → shard → degrade the aggregating reads that are the product) argues *against* the choice. `schedule-v2.md` §1 anticipated exactly this and reframed the stronger story: *"Choosing not to add a database is a stronger judgment signal than adding one."* The résumé bullet and LinkedIn post change accordingly (Consequences), from "polyglot persistence" to "why I didn't reach for a second database at this scale." Two databases I can't fully defend is a worse artifact than one I can.
- **Build the queue now, for completeness.** Rejected per Decision 2d — infrastructure with no load to justify it, plus a `201→202` contract shift and an idempotent-consumer story, to demonstrate nothing at demo volume. The designed-not-built writeup is the stronger artifact.
- **A generic query-builder instead of named functions.** Rejected per Decision 3a — it turns the LLM allow-list back into enumerate-the-bad `spec` validation and reintroduces generated SQL, trading away the exact property the guardrail ADR exists to guarantee.
- **`HASH (org_id)` partitioning in Postgres.** Rejected per Decision 1e — it solves a hot-tenant *write* concentration that is a DynamoDB failure mode, not a Postgres one. If partitioning is ever warranted, the axis is time (the access pattern), not tenancy (reflex).

---

## Consequences (on approval)

- **`apps/api` gains:** a migration for `usage_events` and `api_keys`; an `ingest` module (`POST /v1/events`) with an API-key bearer guard producing a `TenantScope`; a `usage` repository/service exposing the Decision-3 functions with the `(scope, args)` convention; the Zod schemas for `MetricArgs` / ingest DTO (the same schemas the Jul 25 assistant reuses as tool definitions).
- **Extends ADR-0001's signup transaction by one insert** — an `api_keys` row minted with the `orgs`/`users`/`memberships` rows, so a new org can ingest immediately. Recorded here so the deviation from ADR-0001's stated four-insert transaction is visible, not discovered.
- **The tenant-isolation contract test (`12eac4e`) grows:** one case per Decision-3 read function (org B's scope returns zero of org A's rows) **and** an ingestion write case (a body `orgId` for another org does not change where the row lands, and the row is invisible to the other org). It remains one file that grows by one case per new function.
- **`portfolio-plan.md` needs correction in two places, and this is a real cost, not a footnote.** Résumé bullet 1 currently reads *"polyglot persistence (Postgres + DynamoDB)"*; it becomes a single-Postgres bullet foregrounding the judgment — e.g. *"…with a single-store usage model chosen over DynamoDB after a partition-key/hot-tenant analysis showed no scale benefit at cost."* The Track-C LinkedIn post *"the Postgres vs. DynamoDB trade-off"* becomes *"why I did not reach for DynamoDB"* — which `schedule-v2.md` §9 already lists as the better post anyway. Flagged, not silently applied.
- **ADR numbering:** this is `0002`. The NL-query guardrails ADR becomes `0003` on approval (per ADR-0001 §Consequences); its rename stays deferred to its own session so this one doesn't churn a file it isn't otherwise editing.
- **The guardrail ADR now has a concrete binding target.** Its §Decision-2/§6 (Zod-schema allow-list, `intent` envelope) map 1:1 onto Decision 3's `MetricArgs` / `MetricResult`; Jul 25 attaches tool definitions to these four signatures rather than inventing them under time pressure.

## One judgment call surfaced rather than decided

**API-key issuance for the demo.** Decision 2c mints a key at signup (one extra insert) so ingestion works end-to-end with no management UI. The alternative is seed-only — no signup change, a key inserted by a seed script for the demo org. I recommend **mint-at-signup**: it's one insert, it makes the M2M flow real (a fresh org can send events without a backdoor), and it doesn't touch the deferred Settings UI. Say if you'd rather keep signup at ADR-0001's exact four-insert transaction and seed a key instead — the ADR ships either way, and if seed-only wins it becomes an explicit line here rather than a silent change to ADR-0001's transaction.

(Second, smaller: ingestion receives `cost_micros` precomputed, deferring token→price normalization per `portfolio-plan.md`. Called out in 1d; no decision needed unless you want normalization in MVP scope.)

## Verification plan — reproduce, don't assert (mirrors ADR-0001 §Verification)

1. **Ingest lands under the credential's org.** POST an event with org A's API key; query Postgres directly and confirm one `usage_events` row with `org_id = A` and the asserted `occurred_at`/`cost_micros`.
2. **The write-side adversarial case — Cogent's ingestion equivalent of ADR-0001's cross-org read.** POST with org A's key and a body carrying `orgId` (and `org`, `tenant`) for org B. Assert `400` from Zod `.strict()`; assert no row exists for B; re-POST without the field and assert the row lands under A. The payload can never place the row in another org.
3. **Read functions never cross tenants.** Seed A and B with distinct events. Call every Decision-3 function with B's scope; assert zero rows/values derived from A's data — the same standard the contract test enforces, verified once by hand end-to-end.
4. **`p95` is correct, not merely present.** Seed a known latency distribution; assert `getLatency` returns the true 95th percentile (percentile computed in the DB, not approximated in app code).
5. **Spend is exact.** Seed events whose `cost_micros` sum to a known value crossing sub-cent boundaries; assert `getSpend` returns it exactly (integer micros, no float drift).
6. **Idempotency scaffold works under the synchronous path.** POST the same `external_id` twice for one org; assert one row and a `409` on the second — confirming the constraint the future queue relies on is real now.
7. **The queue residual is explicitly *not* tested, because it is not built.** Stated so its absence is a recorded boundary (Decision 2d), not a gap — the `strictVersion` lesson: an unbuilt thing is documented as unbuilt, never implied to work.

**Any of 1–6 failing is a finding reported as a finding, not worked around.**
