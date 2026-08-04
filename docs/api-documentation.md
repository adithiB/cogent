# API Documentation

`apps/api` — NestJS. All routes are served under the global prefix **`/api`** (`main.ts`'s `setGlobalPrefix('api')`), so a route documented below as `POST /v1/events` is actually `POST /api/v1/events` on the wire. Local base URL: `http://localhost:3000/api`. Live: `https://cogent-api.onrender.com/api`.

There is no OpenAPI/Swagger document generated for this API — every request/response shape below is transcribed directly from the Zod schemas and controller return types in `apps/api/src`, which are the actual source of truth (`apps/*/dto/*.dto.ts`). If this doc and the code ever disagree, trust the code.

## Auth model

Two independent credential types, never interchangeable:

- **Cookie session** (`AuthGuard`) — for the human-facing app. `cogent_access` (httpOnly, 15 min, `Path=/`) is checked on every guarded request; `cogent_refresh` (httpOnly, DB-backed, `Path=/api/auth`) is only sent to the auth routes. See [architecture.md#auth-model](./architecture.md#auth-model).
- **Bearer API key** (`ApiKeyGuard`) — for machine-to-machine ingestion only. `Authorization: Bearer <key>`, minted once at signup, shown in the signup response and never retrievable again.

Every guarded route below states which one it requires. All requests to authenticated routes must include cookies (`credentials: 'include'` in `fetch`); the API's CORS is an explicit origin allow-list (`WEB_ORIGIN`), not a wildcard, and won't accept credentialed cross-origin requests from anywhere else.

## Error shapes

- **`400 Bad Request`** — Zod validation failure. Body is `result.error.flatten()` (Zod's flattened `{ formErrors, fieldErrors }` shape), thrown by the shared `ZodValidationPipe`. Every request DTO is `.strict()`, so an unrecognized field (most pointedly a client-supplied `orgId`) fails here rather than being silently dropped.
- **`401 Unauthorized`** — missing/invalid/expired access token or API key.
- **`403 Forbidden`** — authenticated and correctly org-scoped, but the account's role doesn't permit the action (`RolesGuard`). Distinct from a `404` on cross-tenant resource lookups — see [architecture.md](./architecture.md) and [ADR-0001](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md) for why that distinction is deliberate.
- **`404 Not Found`** — resource doesn't exist *for this org*. A budget alert belonging to another org 404s exactly like one that doesn't exist at all — this is the enumeration-safe behavior, not a bug.
- **`409 Conflict`** — a unique constraint was violated (duplicate org name, duplicate email, duplicate budget-alert scope).
- **`503 Service Unavailable`** — the assistant's real degraded state when Ollama isn't reachable. Never a fabricated answer.

---

## `auth` — `/v1/auth`... actually `/auth` (no `v1` prefix on this module)

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| `POST` | `/auth/signup` | none | `{ email, password (≥12 chars), orgName (2–64 chars) }` | Creates a **new org** and its first user (`owner`) atomically. Signup *is* tenant creation — there is no separate "create org" step and no field anywhere for a client to join an existing org by id. Also mints the org's first ingestion API key in the same transaction. Sets both auth cookies. |
| `POST` | `/auth/login` | none | `{ email, password }` | Rate-limited per IP and per email (`LoginRateLimiterService`). Sets both auth cookies. |
| `POST` | `/auth/refresh` | refresh cookie | — | Reads `cogent_refresh`, rotates it, re-derives `org`/`role` from the `memberships` table (not from the old token's claims). Reusing an already-rotated token revokes the whole token family. |
| `POST` | `/auth/logout` | refresh cookie (optional) | — | Ends the session, revokes the refresh token, clears both cookies. |
| `GET` | `/auth/session` | access cookie (`AuthGuard`) | — | Returns the current session — used by the web app on load to decide authenticated vs. anonymous. |

**`signup` response:**
```json
{
  "authenticated": true,
  "org": { "name": "Acme Robotics" },
  "role": "owner",
  "apiKey": "shown once, never retrievable again"
}
```

**`login` / `session` response** (same shape, minus `apiKey`):
```json
{ "authenticated": true, "org": { "name": "Acme Robotics" }, "role": "owner" }
```
`session` additionally nests `user: { email }` alongside `org`/`role`.

---

## `ingest` — `/v1/events`

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/v1/events` | API key (`ApiKeyGuard`) | see below |

The one write path for usage data — machine-to-machine only, no human session involved. Org is resolved from the API key, never from the payload (no `orgId` field exists on the DTO). Returns `201 Created` on success — meaning the event is *durably written*, not merely queued (there is no queue; see [ADR-0002](./adr/0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md)).

**Request body:**
```json
{
  "externalId": "idempotency key, unique per org",
  "occurredAt": "2026-08-01T12:00:00Z",
  "project": "checkout-service",
  "team": "platform",
  "model": "gpt-4o-mini",
  "latencyMs": 842,
  "isError": false,
  "costMicros": 1250
}
```
`costMicros` is integer micro-dollars (1 USD = 1,000,000), never a float — see [database-schema.md](./database-schema.md). `externalId` is unique per `(orgId, externalId)`; a duplicate is rejected via the DB constraint, giving idempotent retries.

**Response:** `{ "received": true }`

---

## `usage` — `/v1/usage`

Both routes call the exact same aggregation functions the NL-query assistant calls — this controller is just an HTTP entry point for the UI's own deterministic reads. Query params are flattened for a GET query string, never nested JSON.

| Method | Path | Auth | Query params |
|---|---|---|---|
| `GET` | `/v1/usage/statement` | access cookie | `from`, `to` (ISO dates, `from < to`), `groupBy` (`project`\|`team`\|`model`\|`time`, required), `filterDimension`+`filterValue` (optional) |
| `GET` | `/v1/usage/spend` | access cookie | `from`, `to`, `groupBy` (optional), `filterDimension`+`filterValue` (optional) |

`statement` backs the Statement table (`{ lineItem, requests, p95Ms, errorRatePct, spendMicros }[]`). `spend` backs the header sparkline, always called with `groupBy: 'time'` from the client.

---

## `budget-alerts` — `/v1/budget-alerts`

Role-gated: `list`/`scope-options` are open to any org member; `create`/`remove` require the `owner` role (`RolesGuard`, `@Roles(Role.Owner)`).

| Method | Path | Auth | Role | Body |
|---|---|---|---|---|
| `GET` | `/v1/budget-alerts` | access cookie | any member | — |
| `GET` | `/v1/budget-alerts/scope-options` | access cookie | any member | — |
| `POST` | `/v1/budget-alerts` | access cookie | **owner** | see below |
| `DELETE` | `/v1/budget-alerts/:id` | access cookie | **owner** | — (`204 No Content`) |

`scope-options` returns real, currently-ingested `project`/`team`/`model` values plus a fixed `{ dimension: "total", value: null }` entry — the alert form's scope selector is never free text.

**`create` request body** (dollars in, micros stored — the conversion happens once, in the DTO):
```json
{
  "scopeDimension": "project",
  "scopeValue": "checkout-service",
  "thresholdType": "amount",
  "thresholdAmount": 500
}
```
or, percent-of-budget mode:
```json
{
  "scopeDimension": "total",
  "thresholdType": "percent",
  "thresholdPercent": 80,
  "budgetAmount": 1000
}
```
`scopeValue` must be omitted when `scopeDimension` is `"total"`, and required otherwise. `thresholdAmount` is required (and `thresholdPercent`/`budgetAmount` forbidden) in `amount` mode; the reverse in `percent` mode. Violating either rule is a `400` from the DTO's `superRefine`, not a generic Zod type error.

**Response shape** (`list`/`create`):
```json
{
  "id": "uuid",
  "scope": { "dimension": "project", "value": "checkout-service" },
  "thresholdType": "amount",
  "thresholdAmountMicros": 500000000,
  "thresholdPercent": null,
  "budgetAmountMicros": null,
  "capMicros": 500000000,
  "notifyEmail": "owner's own account email — never client-supplied",
  "createdAt": "2026-08-01T12:00:00.000Z"
}
```

Duplicate `(orgId, scopeDimension, scopeValue)` returns `409 Conflict`. Deleting/reading another org's alert `id` returns `404`, identical to a non-existent id.

---

## `assistant` — `/v1/assistant`

The NL-query assistant. See [architecture.md](./architecture.md#the-nl-query-assistant) for the pipeline this endpoint sits in front of, and [ADR-0003](./adr/0003-nl-query-guardrails.md)/[ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) for the full guardrail design.

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/v1/assistant/ask` | access cookie | `{ "question": "string, 1–4000 chars" }` |

Always returns `200 OK` for a well-formed request — there's no separate error status for "couldn't map the question," because that's a real, expected outcome (`out_of_scope`), not a server error. `503` is reserved for the assistant genuinely being unreachable (Ollama down).

**Response** is one of three discriminated shapes (`type` field):

```jsonc
// type: "answer" — a point (single figure) result
{
  "type": "answer",
  "result": { "intent": "point", "metric": "spend", "value": 128.42, "unit": "usd" },
  "mapped": { "function": "getSpend", "args": { "window": { "from": "...", "to": "..." } } },
  "answerText": "You spent $128.42 in total.",
  "usage": { "promptTokens": 812, "completionTokens": 34, "durationMs": 18042 }
}
```
```jsonc
// type: "answer" — a slice (grouped/breakdown) result
{
  "type": "answer",
  "result": {
    "intent": "slice", "metric": "requests", "groupBy": "project",
    "rows": [{ "key": "checkout-service", "value": 412 }, { "key": "billing", "value": 88 }]
  },
  "mapped": { "function": "getRequestVolume", "args": { "window": {...}, "groupBy": "project" } },
  "answerText": "...",
  "usage": { "promptTokens": 790, "completionTokens": 41, "durationMs": 16210 }
}
```
```jsonc
// type: "out_of_scope" — the question doesn't map to any of the 4 metrics
{
  "type": "out_of_scope",
  "reason": "This asks about something other than this account's own usage data.",
  "rephraseChips": ["What did we spend last week?", "Show requests by project this month.", "What is our error rate today?"]
}
```
```jsonc
// type: "budget_exceeded" — refused before any compute was spent
{ "type": "budget_exceeded", "estimatedQuestionTokens": 612, "maxQuestionTokens": 500 }
```

`mapped` is present on every `answer` specifically so a mis-mapped-but-in-scope question (including a prompt-injection attempt) is visible and correctable in the UI, rather than silently trusted — see [architecture.md](./architecture.md) for why that's the accepted residual, not a gap.

`503 Service Unavailable` (`{ "message": "Assistant is temporarily unavailable" }` or similar) is returned when Ollama can't be reached at all — this is the state the public deploy shows, by design ([ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md)).

---

## Root

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/` | none | `AppController.getHello()` — trivial liveness check, not a real health endpoint |
