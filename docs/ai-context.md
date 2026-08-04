# Cogent-AI — AI Assistant Context Document

**Purpose of this file:** a single entry point so an AI assistant (or a new engineer) can work in this repo productively without having read any prior conversation. It consolidates and cross-references the repo's existing (extensive) documentation rather than replacing it — where this file summarizes, the linked doc is the source of truth. If this file and the code ever disagree, trust the code; if this file and another doc disagree, trust the other doc and flag the drift.

**Read order if you have 10 minutes:** this file → [`README.md`](../README.md) → [`docs/adr/README.md`](./adr/README.md) (ADR index) → [`docs/architecture.md`](./architecture.md). That covers 90% of "why does this look the way it does."

---

## 1. What this project is, and what it's for

**Cogent-AI** is a multi-tenant LLM cost and observability platform: services POST usage events (one row per LLM API call — model, latency, cost, error flag), tenants read them back as an itemized **Statement**, set **budget alerts**, and ask questions about their spend in **plain English** via a natural-language assistant that maps questions onto a closed set of allow-listed query functions.

**This is a portfolio project**, not a company product — built by a single engineer (frontend background, Angular/TypeScript, ~2 years at Samsung Electro-Mechanics) over a hard 40-day window to be *interview-ready*, not merely feature-complete. That context matters for how the codebase reads:

- Every non-trivial decision has a **written ADR** in [`docs/adr/`](./adr/) that names the alternatives rejected and why. This is not decoration — it's the actual design record, and it's cross-referenced constantly from code comments and other docs.
- The project deliberately **documents what it did *not* build** (`docs/roadmap.md`) as a first-class artifact — "designed, not built, here's the mechanism" is treated as a legitimate answer, not a gap to hide.
- Several ADRs contain **dated amendments** that record a later finding overturning an earlier belief (most importantly ADR-0004, where the entire cost-model premise — a paid hosted LLM — was found wrong the same day and rewritten with the mistake left visible, not silently edited out). If you are asked to reason about "the cost cap" or "the dollar ceiling," check whether you're reading the superseded body or the amendment — see §8.
- **The differentiator is the NL-query assistant**, specifically its guardrails (tenant isolation, cost/compute ceiling, deterministic answer rendering) — not the CRUD around it. If you're asked to prioritize work in this repo, the assistant's correctness and safety properties outrank Statement/Budgets polish.
- The standing rule **"no paid APIs, no subscriptions, no billing accounts, anywhere in this project"** is load-bearing and has been tested (and held) multiple times under real pressure (a working demo that would have been easier with a paid API). Do not suggest swapping the assistant to a hosted LLM API "to make X easier" — that exact suggestion has been made and rejected before, and rejecting it again is the correct answer, not a lack of imagination.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) + Turborepo (`turbo.json`) |
| API | NestJS 11, TypeScript, Node ≥20 |
| Web | Next.js 16 (App Router), React 19, Tailwind v4 |
| Database | Postgres 16, via **Drizzle ORM** (not Prisma — see §7) |
| Validation | **Zod v4** everywhere (request DTOs, LLM tool schemas, response shaping) — one schema library, one source of truth per shape |
| Auth | Hand-rolled JWT (HS256, `jose`) + opaque DB-backed refresh tokens — no Auth.js/Lucia/Cognito |
| Password hashing | `@node-rs/argon2` (argon2id) |
| LLM runtime | **Local Ollama**, model `llama3.2:3B` — no hosted/paid LLM API anywhere in this repo |
| State/data-fetching (web) | TanStack Query (React Query) |
| UI primitives | Hand-built + a few Radix primitives (dropdown-menu, radio-group, tabs, slot); `<select>` is a **native** element, not Radix — see `component-documentation.md` |
| Charts | Recharts (used exactly once — the header sparkline) |
| Testing | Jest (unit `*.spec.ts` colocated with source; e2e `*.e2e-spec.ts` in `apps/api/test/`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — lint, typecheck, build, unit tests only (no e2e, no live-Ollama verify scripts — see §9) |
| Deploy | Vercel (web) + Render, Docker build (API) + Neon (managed Postgres) |

No AWS, no DynamoDB, no SQS, no Lambda, no Redis, no message queue, no ORM code-gen client (Drizzle is typed-SQL, not a generated ambient client) exist anywhere in the running system — several of these were explicitly considered and rejected (DynamoDB, SQS) or are designed-but-not-built (Redis denylist). See §10.

---

## 3. Repository layout

```
cogent/
├── apps/
│   ├── api/                 NestJS — the only thing that talks to Postgres
│   │   ├── src/
│   │   │   ├── main.ts               bootstrap: /api prefix, cookie-parser, CORS
│   │   │   ├── app.module.ts          root module
│   │   │   ├── auth/                   signup/login/refresh/roles/cookies/guards
│   │   │   ├── ingest/                  POST /v1/events — the one write path
│   │   │   ├── usage/                    Statement read surface + shared metric types
│   │   │   ├── assistant/                 NL-query assistant: tools, prompt, guardrails, Ollama client
│   │   │   ├── budgets/                    budget-alert CRUD
│   │   │   ├── db/                          Drizzle schema, TenantScope, scoped-query helpers, repositories
│   │   │   └── common/                       cross-cutting (Zod validation pipe)
│   │   ├── scripts/          seed-demo-data.ts, verify-ollama-tool-calling.ts, verify-token-estimate.ts
│   │   └── test/             e2e suite (tenant-isolation.e2e-spec.ts etc.)
│   └── web/                 Next.js App Router — the only thing the browser loads
│       └── src/
│           ├── app/           (auth) and (shell) route groups
│           ├── components/    feature-organized: auth/, statement/, budgets/, ui/
│           └── lib/           api-client.ts, assistant.ts, hooks/, pure helpers
├── packages/
│   ├── sdk/                 STUB (`export {}`) — reserved for a published ingestion client. Nothing imports it.
│   └── ui/                  STUB (`export {}`) — reserved for extracted shared components. Nothing imports it.
├── docs/                    all documentation (this file included)
├── docker-compose.yml       local Postgres only
├── turbo.json               build/dev/lint/test/typecheck pipeline
└── tsconfig.base.json       shared strict TS config
```

**Full detail:** [`docs/folder-structure.md`](./folder-structure.md).

**Important:** `packages/sdk` and `packages/ui` are real workspaces (they build/typecheck) but are intentionally empty stubs. Do not treat their existence as evidence of a published SDK or a shared component library — nothing in `apps/*` imports from either. They exist only so the tree isn't misread as more built-out than it is; extracting them now (before a second consumer exists) would be exactly the premature abstraction this project's principles rule out.

Each feature module in `apps/api/src` (`auth`, `ingest`, `usage`, `assistant`, `budgets`) owns its own `*.controller.ts` + `*.service.ts` + `dto/*.dto.ts` — **feature-based**, not layered (`controllers/`, `services/` folders don't exist). `apps/web/src/components` mirrors this: `statement/`, `budgets/`, `auth/` feature folders plus a feature-agnostic `ui/` folder.

---

## 4. Coding conventions and naming conventions

These are patterns verified against actual source, not aspirational:

**File naming:** kebab-case throughout (`usage-events.repository.ts`, `answer-template.ts`, `cost-cap-card.tsx`). Nest convention suffixes: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.guard.ts`, `*.decorator.ts`, `*.dto.ts`. React components: kebab-case filename, `PascalCase` export (`app-shell.tsx` exports `AppShell`).

**Test naming:** `*.spec.ts` = unit test, colocated next to the file it tests (`auth/roles.guard.spec.ts` next to `auth/roles.guard.ts`). `*.e2e-spec.ts` = end-to-end test, lives only in `apps/api/test/`.

**TypeScript:** strict mode everywhere (`tsconfig.base.json`), extended per workspace. **Branded/nominal types** for anything that must not be constructible from arbitrary input — `OrgId`, `UserId` (`apps/api/src/db/scope.ts`) are `string & { readonly [brand]: 'OrgId' }`; a plain string is not assignable, so `req.body.orgId as OrgId`-style shortcuts still don't type-check without going through the one legitimate constructor.

**Zod is the single source of truth for a shape**, used for four different jobs from one schema definition: (1) HTTP DTO validation via `ZodValidationPipe`, (2) the LLM tool's `input_schema` (JSON-Schema projection of the same Zod schema), (3) the human-readable "scope" shown in the UI, (4) the result-type contract. Every request DTO is `.strict()` — an unrecognized field is a loud `400`, never silently dropped. **No DTO in the codebase has an `orgId`/`org`/`tenant` field** — this is enforced by convention across every schema, not by a lint rule, and is load-bearing for tenant isolation (§6).

**Repository / data-access function signature convention** (established `apps/api/src/db/repositories/`): every scoped function's **first, non-optional parameter is `scope: TenantScope`**. Never optional, never defaulted, never a keyword arg buried later in the signature. Example: `getSpend(scope: TenantScope, args: MetricArgs): Promise<MetricResult>`. This convention is *the* enforcement mechanism for tenant isolation — see §6 — so it must never be broken when adding a new data-access function.

**All tenant-scoped SQL predicates go through one helper**, `orgScope()` in `apps/api/src/db/scoped-query.ts` — there is exactly one place in the codebase where `org_id = $scope.orgId` is written, not one per table/repository.

**Money is always integer micro-dollars** (`costMicros`, `thresholdAmountMicros`, `budgetAmountMicros`) — 1 USD = 1,000,000. Never a float, never a `numeric`/`decimal` column for a dollar amount that gets summed. `threshold_percent` is the one legitimate `numeric(5,2)` column (a percentage, not a dollar figure). Dollars are converted to micros exactly once, in the DTO layer (`budget-alert.dto.ts`), never in a controller or repository.

**Controller pattern (NestJS):** constructor-injected repository/service, `@UseGuards(AuthGuard)` (+ `RolesGuard` where mutation-privileged), `@Query`/`@Body` decorated with `new ZodValidationPipe(schema)`, scope pulled off `req as RequestWithScope` — never destructured from the query/body. See `apps/api/src/usage/usage.controller.ts` for the canonical shape.

**React/Next conventions:** `"use client"` only on components that need interactivity/hooks/browser APIs — presentational components are server components by default. Route groups `(auth)` and `(shell)` split layout without adding a URL segment. Data fetching never calls `fetch` directly from a component — always through a typed hook in `lib/hooks/`, which wraps `lib/api-client.ts` (REST) or `lib/assistant.ts` (the assistant endpoint) with TanStack Query.

**Accessibility conventions (deliberate, not incidental):** `role="status"` for expected-but-notable outcomes (out-of-scope answer, budget-exceeded pause); `role="alert"` for genuinely unexpected failures (503, network error). Color never carries meaning alone — every status surface pairs a tint with an icon and/or text. `motion-safe:`/`motion-reduce:` Tailwind pairs throughout, with a real static fallback under reduced motion, not just "animation off."

**Comment convention:** comments explain *why*, frequently citing the ADR/decision that produced the code (`// ADR-0001 §1d: ...`), not *what* the code does. This is a strong, consistent pattern in this codebase — when reading or writing code here, a comment without an ADR/decision citation for a non-obvious choice is the exception, not the norm.

---

## 5. Data model

Full column-by-column reference: [`docs/database-schema.md`](./database-schema.md). Source of truth: [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts).

```
orgs (id, name, slug UNIQUE, created_at)
users (id, email UNIQUE, password_hash, created_at)              -- no org_id here, by design
memberships (id, user_id FK, org_id FK, role enum[owner,member]) -- UNIQUE(user_id, org_id)
refresh_tokens (id, token_hash UNIQUE, family_id, user_id FK, org_id FK, expires_at, revoked_at, replaced_by)
usage_events (id, org_id FK, external_id, occurred_at, project, team, model,
              latency_ms, is_error, cost_micros bigint, created_at)
              -- UNIQUE(org_id, external_id); INDEX(org_id, occurred_at)
budget_alerts (id, org_id FK, scope_dimension enum[total,project,team,model], scope_value,
               threshold_type enum[amount,percent], threshold_amount_micros, threshold_percent,
               budget_amount_micros, notify_email, created_at)
               -- UNIQUE(org_id, scope_dimension, scope_value)
api_keys (id, org_id FK, token_hash UNIQUE, name, created_at, revoked_at)
```

**The one invariant every scoped table shares:** `org_id` is the *sole* tenant column, and it is **never populated from client input anywhere** — no DTO has an `orgId` field; it's written only from a verified `TenantScope`.

**Why `users` has no `org_id`:** email is globally unique across the whole system; one identity can hold memberships in multiple orgs via `memberships`. A `users.org_id` column would make the org-switcher UI (designed in the spec) structurally unreachable. **Deliberately not exercised yet:** every account today has exactly one membership — there is no invite flow, so the multi-org model exists but nothing in the running app produces a second membership for a user.

**Why `orgs` uniqueness is on `slug`, not `name`:** `"Acme Robotics"`, `"acme robotics"`, `"Acme  Robotics!"` must collide — that's what a human means by "that name is taken." `slug` is server-derived at signup, never client-supplied directly.

**`budget_alerts.budget_amount_micros`** is the one schema element flagged during the build as genuinely ambiguous: the "% of budget" threshold mode needs a budget figure to divide into, and no standalone "monthly budget" entity exists anywhere in the model. Resolution: persist the figure directly on the alert row (narrowest change) rather than add a new `budgets` table for a value only one alert type uses.

**`budget_alerts.scope_value`** is `''` (never `NULL`) when `scope_dimension = 'total'` — deliberate, because Postgres unique indexes treat every `NULL` as distinct, which would let more than one "total" alert exist per org past the intended constraint.

**Migrations:** generated by `drizzle-kit generate` from `schema.ts` into `apps/api/src/db/migrations/*.sql` (auto-named, e.g. `0000_brainy_romulus.sql`) — see §7, this is the one genuinely code-generated artifact in the repo. Applied with `npm run db:migrate --workspace=apps/api`.

---

## 6. Core business logic and safety properties

### 6.1 Tenant isolation — enforced at the query layer, not the route

The single most important architectural property in this codebase. Full reasoning: [ADR-0001](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md) §Decision-3.

- `OrgId` is a **branded type**; the only function that can produce a `TenantScope` is `scopeFromVerifiedClaims()` (`db/scope.ts`), called only by `AuthGuard`/`ApiKeyGuard` after signature/hash verification.
- Every data-access function takes `scope: TenantScope` as its **mandatory first parameter** — not optional, so omitting it is a compile error, not a runtime bug waiting to happen.
- No request DTO anywhere has an `orgId` field — a client that sends one gets a `400` from Zod `.strict()`, loudly, never silently stripped.
- **Why the query layer and not a route guard**, specifically: the NL-query assistant calls repository functions **directly, as a non-HTTP caller** — there is no controller in that path. A route-level check would not cover it. The enforcement has to live at the layer every caller (HTTP or not) is forced through.
- Cross-tenant resource-by-id lookups return **404, deliberately not 403** — a 403 would confirm the resource exists in *some* org, turning the endpoint into an enumeration oracle.
- **Honest residual:** a developer working inside the repository layer could still write a raw query that omits the predicate — type systems constrain callers, not authors. Mitigated by a tenant-isolation contract test (seeds two orgs, asserts zero cross-tenant rows from every exported function). Postgres Row-Level Security would close this at the database layer but is designed-not-built (§10).

### 6.2 Auth — hybrid, hand-rolled, not "stateless JWT"

Full reasoning: [ADR-0001](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md).

- **Access token:** JWT, HS256, 15 min, `httpOnly` cookie `cogent_access`, `Path=/`. Signature-only verification, no DB read on the hot path.
- **Refresh token:** **not a JWT** — 32 bytes CSPRNG, SHA-256 hash stored in `refresh_tokens`, `httpOnly` cookie `cogent_refresh`, `Path=/api/auth`. Rotated on every use; presenting an already-consumed (revoked) token is treated as a replay and **revokes the entire token family**, forcing re-login.
- On every refresh, `org`/`role` claims are **re-read from `memberships`**, never copied forward from the old token — this is what makes a role change or org removal take effect within one refresh interval (≤15 min) with no denylist.
- **Accepted residual:** an already-issued access token stays valid up to 15 minutes after a revocation event (logout, role change, removal). Argued at length in ADR-0001 §1d as acceptable *for this data's sensitivity* — no funds movement, no destructive action reachable in that window. The designed-not-built escalation is a Redis `jti` denylist.
- **Roles:** exactly two — `owner`, `member`. First signup user is always `owner`. **`RolesGuard` + `@Roles(Role.Owner)`** gates only `BudgetsController.create`/`.remove` — reads (`list`, `scope-options`) are open to any org member. (This enforcement was *added* in a 2026-08-05 amendment to ADR-0001 — the two-role schema existed earlier but nothing checked `scope.role` until then. If you're asked "is RBAC enforced," the answer is yes, narrowly, on budget-alert mutations only — check the amendment before assuming broader coverage.)
- **Ingestion uses a separate credential type** entirely — a bearer API key (`ApiKeyGuard`), minted once at signup, hashed the same way as refresh tokens (fast SHA-256, not argon2id — high-entropy secret, no dictionary to defend against).

### 6.3 The NL-query assistant — the differentiating feature

Full reasoning: [ADR-0003](./adr/0003-nl-query-guardrails.md) (the shape) + [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) and its amendment (the binding — **read the amendment**, the body's dollar-cost model is superseded).

Pipeline (`POST /v1/assistant/ask`):

1. `AssistantService.ask(scope, question)` — `scope` from the same `AuthGuard` machinery as every other route.
2. **Pre-compute admission gate** (`budget-gate.ts`, `checkAdmission()`): question token count checked against a budget (default 500 tokens, `ASSISTANT_MAX_QUESTION_TOKENS`) **before Ollama is touched**. Over budget → `budget_exceeded` response, **zero compute spent**.
3. One call to Ollama (`llama3.2:3B`), five tools exposed: `getSpend`, `getRequestVolume`, `getLatency`, `getErrorRate` (data tools, schemas = JSON-Schema projection of `metricArgsSchema`) + `report_out_of_scope` (control tool). **No sixth path exists.**
4. `coerceStringifiedArgs()` (`coerce-args.ts`) repairs known Ollama quirks (nested objects returned as a JSON string, flattened `window`, explicit `null` for omitted optionals) before Zod sees the output.
5. `metricArgsSchema.safeParse` — the **same** schema the HTTP `/v1/usage/*` routes validate against — is the actual gate. Parse failure or unknown tool name → treated as out-of-scope, not thrown.
6. Server dispatches `repo[fn](scope, parsedArgs)` — `scope` supplied by the server, never by model output. **The model has no `orgId` field to populate anywhere in its tool schema.**
7. `intent: 'point' | 'slice'` is **derived server-side** from whether `groupBy` is present in the validated args — never asserted by the model, so a mis-set discriminator can't silently mis-route the UI.
8. Answer text is **rendered by a deterministic server-side template** (`answer-template.ts`) over the real query result — the model never phrases the figure. This is the load-bearing exactness property: handing a bill to an LLM to phrase reintroduces the one thing a cost tool cannot ship, a hallucinated number.
9. `mapped: { function, args }` is included on every answer — visible provenance, so a mis-mapped-but-in-scope question (including a prompt-injection attempt) is correctable by the user rather than silently trusted. This is the **accepted residual**: the model can steer to a different in-scope query, never to another org's data.

**The cost/compute ceiling, precisely** (this is the part with the most amendment history — see §8):

- It is a **compute budget**, not a dollar figure. Original design (ADR-0004 body) was a $0.02-per-query ceiling on a paid hosted model (`claude-haiku-4-5`); a same-day amendment found the entire premise wrong (this project runs no paid APIs) and re-derived it against local Ollama compute.
- Two parts: (a) pre-compute token admission gate (§ above, refuses before any compute — zero spend), and (b) a **45-second wall-clock timeout** (`REQUEST_TIMEOUT_MS` in `budget-gate.ts`) as the backstop for the one thing not knowable a priori (actual inference time).
- **Cold start is real and large**: 42–74s on first assistant call after boot or after 5+ minutes idle (Ollama's default `keep_alive` unload), because tool-constrained decoding has its own warm-up distinct from a bare text prompt. `OllamaAssistantClient.onModuleInit()` does a best-effort warm-up at boot using the *real* system prompt + tools (a bare-text warm-up was tried first and found insufficient — see ADR-0004 amendment §7 item 9). Warm-state queries answer in ~3.5–23s.
- No Ollama runs in production (§9) — `/v1/assistant/ask` returns a real `503` there, by design, never a fabricated answer.

**Reliability was measured, not assumed:** three full 24-call verification rounds against the real dispatch pipeline closed 54.2% → 62.5% → 91.7%, each round fixing one separately-diagnosed defect traced to raw model output + an exact Zod error (missing `window` wrapper, explicit `null` on optional fields, groupBy-vs-filter prompt confusion). Tool *selection* (picking the right one of 5 tools) was 100% across all 72 live calls run this session — the residual failures were argument-shape issues, not tool hallucination or scope leakage. Full table: ADR-0004 amendment §2.

### 6.4 Ingestion — one synchronous path

Full reasoning: [ADR-0002](./adr/0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md).

`POST /v1/events`, `ApiKeyGuard`, synchronous write, `201` on success (event durably written, not queued — there is no queue). `externalId` + `(org_id, external_id)` unique index gives idempotent retries (`409` on duplicate). Org resolved from the API key, never the payload. The SQS-backed async design (`202` instead of `201`) is fully specified in the ADR but not built — `external_id` already exists specifically so that escalation needs no migration when it lands.

### 6.5 Why Postgres, not DynamoDB

Full reasoning: [ADR-0002](./adr/0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md) §Decision 1. Short version: this product's read pattern is aggregation (`SUM`, `p95`, `GROUP BY`) — DynamoDB has none of that natively. A dominant tenant would hot-partition DynamoDB (hard per-partition throughput ceiling); the fix (write-sharding) degrades exactly the aggregating reads that are the product. Postgres has no per-partition write ceiling — a dominant tenant is just more rows. **Choosing not to add a second database was the deliberate judgment call**, argued in writing rather than defaulted away from.

---

## 7. Generated code vs. handwritten code

This is a small-surface-area distinction in this repo — almost everything is handwritten by design (see the query-builder-vs-named-functions argument in ADR-0002 §3a: a generated/flexible query layer was explicitly rejected because it would reopen the exact attack surface the allow-list architecture exists to close).

**Genuinely generated, do not hand-edit:**
- `apps/api/src/db/migrations/*.sql` and `apps/api/src/db/migrations/meta/*.json` — output of `drizzle-kit generate`, run against `db/schema.ts`. Regenerate by editing `schema.ts` and re-running `npm run db:generate --workspace=apps/api`; never edit a migration file by hand once committed.
- `apps/api/dist/`, `apps/web/.next/`, `.turbo/cache/*` — build output, gitignored, never source.
- `package-lock.json` — generated by npm, do not hand-edit.

**Hand-authored, including things that look like they might be generated:**
- `apps/api/src/db/schema.ts` — the Drizzle table definitions are hand-written TypeScript (not reverse-engineered from a database), with inline comments explaining non-obvious column choices.
- **Every SQL query** in `apps/api/src/db/repositories/*.ts` is hand-written, parameterized Drizzle query-builder code — there is no ORM-generated ambient client (this is *why* Drizzle was chosen over Prisma; see ADR-0001 §Decision-3 — Prisma's generated client is "ambient" and lets an unscoped query compile cleanly, which is precisely the property this codebase needs to prevent).
- **The LLM tool schemas** (`assistant/tools.ts`) are hand-written Zod schemas, the same objects the HTTP DTOs use — not generated from an OpenAPI spec or similar.
- **There is no OpenAPI/Swagger generation anywhere.** `docs/api-documentation.md` is hand-transcribed from the Zod schemas and controller return types and says so explicitly — if it and the code disagree, the code wins.
- UI primitives in `apps/web/src/components/ui/` are hand-built (a few wrap Radix primitives; `select.tsx` deliberately does *not* wrap Radix — it's a styled native `<select>`), not generated by a component-scaffolding tool or copied wholesale from shadcn/ui without modification.

**No code-generation tooling runs as part of the normal dev loop** beyond `drizzle-kit generate` for migrations. There is no codegen step for types-from-schema, API-client-from-OpenAPI, or GraphQL codegen anywhere in this stack.

---

## 8. Reasoning behind every major decision — read the ADRs, but here is the map

Every ADR lives in [`docs/adr/`](./adr/), numbered in the order they were approved, and the index ([`docs/adr/README.md`](./adr/README.md)) states a recommended reading order: **0001 → 0002 → 0003 & 0004 → 0005**.

| ADR | Decision | Status / amendment |
|---|---|---|
| [0001](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md) | Hand-rolled JWT + org-scoped RBAC at the query layer; signup creates the tenant | Amended by 0005 (cross-site cookies); amended 2026-08-05 (RolesGuard was missing — closed) |
| [0002](./adr/0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md) | Postgres over DynamoDB; one synchronous ingestion path; named allow-listed read functions | Accepted, built, no amendments |
| [0003](./adr/0003-nl-query-guardrails.md) | NL-query guardrails: allow-listed schema + per-query ceiling (**the shape**) | Amended 2026-08-04 — several claims (dollar ceiling, ≤2 round-trips, static `intent`) superseded by 0004; this doc's body was never updated until an audit caught it |
| [0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) | The assistant is LLM function-calling bound to 0002's functions; `intent` server-derived; ceiling enforced before spend (**the binding**) | **Superseded in part by its own 2026-07-23 amendment** — dollar ceiling → compute budget, hosted Claude → local Ollama. **This is the ADR to read if you only read one.** |
| [0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md) | Deploy topology (Vercel + separate API host), cross-site cookies, no Ollama in production | Accepted, built |

**When reasoning about "why" in this codebase, prefer the ADR over inferring from the code** — several decisions look arbitrary from the code alone (why HS256 not RS256; why SHA-256 for refresh tokens but argon2id for passwords; why a 45s timeout specifically; why `getStatement` isn't a sixth LLM tool) and are fully argued in the relevant ADR with the rejected alternative named.

**The amendment pattern is a genuine project convention, not an accident** — this repo's standing rule is "name the gap between what was believed and what shipped, in writing, don't quietly edit the mistake away." If you are asked to update an ADR because something it claims turns out to be false, **add a dated amendment section**, leave the original body intact, and update the status line and the ADR index row. Do not rewrite history in place.

**Two ADRs from the sibling portfolio project ("Atlas") are referenced by name** in Cogent's ADRs for contrast (same engineer, same month, opposite calls on auth — Atlas stubbed identity, Cogent built it — with an explicit rule for which case is which). Atlas is a different repository; don't expect to find `atlas/` inside this one.

---

## 9. Deployment and what's actually verified

Live: web on Vercel, API on Render (Docker build), DB on Neon. Full operational detail: [`docs/deployment-guide.md`](./deployment-guide.md).

**No Ollama runs anywhere in production, on purpose** — free-tier PaaS RAM is roughly an order of magnitude short of what `llama3.2:3B` needs resident, free tiers idle-suspend (making the 42–74s cold-load the *normal* case, not an edge case), and the no-paid-API rule rules out the hosted-model workaround. The public deploy's assistant intentionally shows a real `503`/`AssistantErrorCard`, not a faked answer or a hidden feature. See [ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md).

**Four real bugs were found only by deploying**, all fixed — worth knowing because they're the categories of bug that don't show up locally:
1. `SameSite=Lax` cookies silently never persisting across genuinely cross-site domains (fixed by `COGENT_CROSS_SITE_COOKIES=true`).
2. `nest build` emits `dist/src/main.js`, but the checked-in `start:prod` script assumed `dist/main` (fixed in the Dockerfile `CMD`, not `package.json`, so local `npm run start:prod` still uses the original path — check `Dockerfile` if debugging a deployed boot failure, not just `package.json`).
3. No anonymous-visitor redirect existed anywhere in the app (invisible when always logged in locally).
4. `NEXT_PUBLIC_API_URL` deployed without the `/api` prefix.

**What's genuinely open** ([`docs/known-issues.md`](./known-issues.md)): the e2e default timeout was raised to 150s to survive per-suite Ollama cold-start — a slow-to-fail e2e run isn't automatically a regression, check before assuming so. As of the last audit, no e2e items are open (the two previously-tracked 401/RolesGuard e2e gaps have both been root-caused, fixed, and are pending confirmation on the next run with live Postgres — check the file directly for current status, since this is exactly the kind of thing that changes between sessions).

**CI does not run e2e or the `verify:*` scripts** (`.github/workflows/ci.yml` runs lint → typecheck → build → unit tests only) — both need a live Ollama daemon with a multi-minute cold warm-up a GitHub-hosted runner doesn't provision. This is a documented, deliberate CI boundary, not an oversight — don't assume a green CI run implies the e2e suite or the assistant reliability gate passed.

---

## 10. What's designed but not built (do not "helpfully" implement without being asked)

Full detail with mechanisms: [`docs/roadmap.md`](./roadmap.md). Each of these has a complete design in an ADR — if asked "how would you productionize X," point to the ADR section rather than starting from scratch:

| Not built | Where designed | Trigger to build it |
|---|---|---|
| Postgres Row-Level Security (defense-in-depth below the app query layer) | ADR-0001 §Decision-3 | Only if the app-layer contract test stops being trusted as sufficient |
| Redis `jti` denylist (closes the ≤15-min access-token revocation window) | ADR-0001 §1d | If this data's sensitivity changes (e.g. payment instruments enter scope) |
| SQS-backed async ingestion, `201`→`202` contract change | ADR-0002 §2d | Real write-volume load that a synchronous insert can't absorb |
| Hourly query-count throttle on the assistant | ADR-0003 / ADR-0004 | Multi-user volume abuse — the per-query ceiling already closes the cost hole |
| Ollama on a free-tier VM (Oracle Cloud Always-Free Ampere A1) for a working prod assistant | ADR-0005 | Explicitly scoped-and-declined for this project phase, not ruled out forever |
| Published `packages/sdk` client | folder-structure.md | A second real consumer of the ingestion contract |
| Extracted `packages/ui` | folder-structure.md | A second frontend needing the same primitives |
| Token→price normalization at ingestion (cost is currently caller-precomputed) | `ingest-event.dto.ts` | Out of MVP scope by design |
| Budget-alert **notification delivery** (email/webhook) | roadmap.md | `capMicrosFor()` + `getSpend` already compute the crossed-threshold state; nothing sends anything yet — this is UI-only today |
| A real health-check endpoint | roadmap.md | `GET /` is a placeholder liveness check, not fit for an uptime monitor |

**Explicitly and permanently not on this roadmap:** swapping the assistant to a paid hosted LLM API. This has been proposed and rejected multiple times under real pressure (in this project and the sibling Atlas project) and is a closed question, not a deferred one. Do not propose it as a fix for cold-start latency, reliability, or "just for the demo."

---

## 11. Common pitfalls when working in this codebase

- **Don't add an `orgId` field to any DTO, ever, for any reason** — even "just for logging" or "just for an admin view." The entire tenant-isolation argument rests on no DTO having one. If you need to know which org a request belongs to, read it from `req.scope` (populated by `AuthGuard`/`ApiKeyGuard`), never from client input.
- **Don't add a new scoped data-access function without `scope: TenantScope` as the mandatory first parameter.** This isn't a style preference — it's the mechanism. A function that takes scope as an optional param, a later param, or reads org id from `args` breaks the compile-time guarantee the whole design leans on.
- **Don't treat ADR-0003's or ADR-0004's *body* text about dollar costs as current** — read the amendments first (§8). The dollar figures, the `claude-haiku-4-5` model choice, the `ANTHROPIC_API_KEY` env var, and "≤2 round-trips" are all superseded.
- **Don't assume the assistant's first query in a fresh session will be fast** — cold start is 42–74s and is a measured, expected characteristic of tool-constrained local inference, not a bug to "fix" by removing the warm-up.
- **Don't use a float or `numeric` column for anything that gets summed as money.** Integer micros, always. If you see a dollar amount in a DTO/request body, it gets converted to micros exactly once, at the DTO boundary.
- **Don't add Prisma, or reach for an ORM's ambient/global client pattern.** Drizzle was chosen specifically because it has no such client — see §7 and ADR-0001 §Decision-3.
- **Don't suggest a hosted/paid LLM API** as a fix for anything (reliability, cold-start, cost math simplicity). This project's standing rule has already absorbed this exact pressure multiple times; the answer is settled.
- **Local e2e tests need Docker/Postgres running** and can take up to 150s per suite due to per-suite Ollama warm-up — a slow run is not automatically a failure signal.
- **`NEXT_PUBLIC_*` env vars are inlined at Next.js build time** — changing `NEXT_PUBLIC_API_URL` requires a rebuild, not just a redeploy of the same artifact. This exact mistake (missing `/api` suffix) was one of the four real deploy bugs.
- **The Dockerfile's `CMD` and `package.json`'s `start:prod` script intentionally point at different paths** (`dist/src/main.js` vs `dist/main`) — don't "fix" this by making them match without checking which one is actually correct for the current `nest build` output first.
- **Migrations are generated, not hand-written.** If a schema change is needed, edit `schema.ts` and run `db:generate` — don't write a migration `.sql` file by hand.

---

## 12. Quick reference — where to look for X

| Question | File(s) |
|---|---|
| Why does auth work this way? | [`docs/adr/0001-...`](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md) |
| Why Postgres, not DynamoDB? | [`docs/adr/0002-...`](./adr/0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md) |
| How does the assistant actually work end to end? | [`docs/architecture.md`](./architecture.md) §"The NL-query assistant" + [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) + amendment |
| What does endpoint X actually accept/return? | [`docs/api-documentation.md`](./api-documentation.md) (hand-transcribed from the Zod schemas — no Swagger exists) |
| What columns does table X have, and why? | [`docs/database-schema.md`](./database-schema.md), source: `apps/api/src/db/schema.ts` |
| What component renders screen X? | [`docs/component-documentation.md`](./component-documentation.md) |
| Every env var, what happens if it's missing | [`docs/environment-variables.md`](./environment-variables.md) |
| How to run this locally | [`docs/setup-guide.md`](./setup-guide.md) |
| How the live deploy is configured | [`docs/deployment-guide.md`](./deployment-guide.md) |
| What's currently broken | [`docs/known-issues.md`](./known-issues.md) |
| What's designed but not built | [`docs/roadmap.md`](./roadmap.md) |
| Reproduce the demo screenshot by screenshot | [`docs/demo-walkthrough.md`](./demo-walkthrough.md) |
| The UI/UX spec the frontend was built against | [`docs/cogent-ui-implementation-spec.md`](./cogent-ui-implementation-spec.md) |
| Every command (`npm run ...`) available | [`docs/setup-guide.md`](./setup-guide.md) §"Full command reference" |

**Not part of "understand this system" documentation** — these are planning/prep artifacts for the human engineer building the portfolio (career timeline, interview rehearsal, day-by-day scheduling), not documentation of Cogent-AI itself. Skip them unless specifically asked about the engineer's process rather than the system: `docs/interview-prep.md`, `docs/portfolio-plan.md`, `docs/schedule-v2.md`, `docs/day-by-day-schedule.md`, `docs/const.md` (this last one is the source `CLAUDE.md` at the repo root was committed from).

---

## 13. A note on this document's own honesty standard

This repo holds itself to a specific documentation discipline: name what's true, name what changed, name what's deliberately not built, and don't quietly paper over a gap. That discipline should extend to this file too. If you (the AI reading this) find that this file disagrees with the current code or with another doc in `docs/`, treat that as a documentation-drift finding worth surfacing to the user, not something to silently work around — consistent with how this project's own known-issues and ADR-amendment conventions work.
