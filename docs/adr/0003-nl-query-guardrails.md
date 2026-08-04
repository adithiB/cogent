# ADR-0003: NL-query assistant guardrails: allow-listed query schema + per-query cost ceiling

- Status: Accepted. **Amended 2026-08-04** — read the amendment at the bottom before §Decision 4 and §6: the dollar cost ceiling, the ≤2-round-trip framing, the DynamoDB mention in §1, and §6's claim that `intent` is "a property of the function, not inferred at runtime" were all superseded by ADR-0004 and its own 2026-07-23 amendment. This ADR was never updated to say so until a documentation audit found the gap.
- Date: 2026-07-05
- Scope: MVP (interview-critical). This is the differentiating feature; full rigor applies.
- **Numbering note:** Deferred by ADR-0001 and ADR-0002 (each of which said this ADR becomes `0003` on approval) until the session that finally binds it — ADR-0004 (`0004-nl-query-assistant-function-calling-intent-and-cost-cap.md`), renamed here on that ADR's approval.

## Context

Cogent-AI is a multi-tenant LLM cost/observability platform. Its differentiating feature is a natural-language query assistant that lets an engineering lead ask questions in plain English ("what did checkout-service spend on GPT-4o last week?") and get answers over their org's usage data.

An LLM sitting in front of a database, in a multi-tenant product, over billing data, has three failure modes that all have to be closed before this is safe to demo, let alone defend in an interview:

1. Runaway cost — a single pathological request (unbounded output, many tool round-trips, a query that returns a huge result set fed back into the model) quietly burning real money. A cost-monitoring product whose own AI feature is uncapped is the obvious interview gotcha.
2. Cross-tenant leakage — a query, whether by model error or user intent, reaching another org's data.
3. Out-of-scope requests — the model being asked something the data can't answer, and either hallucinating an answer or returning a raw error.

The design has to close all three and be legible to the user — the guardrails are a selling point, not silent plumbing, so they need to be visible on screen (see the Cogent-AI design direction). This ADR records how.

## Decision

The assistant does not let the model write queries. It maps natural language onto a finite, pre-approved set of parameterized query functions via LLM function-calling, validates every call against a Zod schema, injects tenant scope server-side, and enforces a hard per-query cost ceiling on the server.

Concretely:

1. Allow-listed query functions. There is a fixed set of read-only query functions (e.g. `getSpend`, `getLatency`, `getRequestVolume`, `getErrorRate`), each backed by a hand-written, parameterized SQL/DynamoDB query. The model's only job is to choose one function and supply arguments. No SQL, no query string, and no raw filter expression ever leaves the model. Each function also declares the shape of its result — a single figure or a grouped set — via an `intent` discriminator (see 6).

2. Zod schema as the allow-list. Each function's argument shape is a Zod schema: `metric ∈ {spend, latency, requests, errors}`, `groupBy ∈ {team, project, model, time}`, a bounded `timeRange`, and an optional `filter` restricted to enumerated dimension values. Zod validates shape and bounds on the way in; anything that doesn't parse is rejected before a query runs. The schema is simultaneously the LLM tool definition, the API DTO validator, and the human-readable "scope" shown in the UI — one source of truth. The same schema also types each function's *result*, including the `intent` discriminator described in 6, so the presentation contract lives in the same place as the query contract.

3. Tenant scope is server-injected, never model-controlled. `orgId` is read from the authenticated JWT and injected into every query on the server. It is not a function argument the model can set. The model structurally cannot request another org's data because it has no parameter to do so. This is the tenant-isolation guarantee (defense-in-depth with the query-layer RBAC).

4. Per-query cost ceiling, enforced server-side. Each request runs under a hard ceiling (target `$0.02`). The ceiling is derived from concrete caps: capped output tokens, a bounded input context, a small cap on tool-call round-trips (≤2), and aggregate-only result sets (queries return rolled-up figures with a `LIMIT`, never raw event rows). The server tracks actual token usage and hard-stops a request projected to exceed the ceiling. The client shows an estimate before sending (`≈ $0.006`) and the actual cost after (`$0.006 / $0.02`) — but the client estimate is UX only and is never the enforcement point.

5. Deterministic out-of-scope fallback. If the model cannot map a question to any allow-listed function, it returns a structured "out of scope" result rather than guessing. The UI renders a specific fallback card explaining what can't be answered and offering in-scope rephrasings — not a generic error toast.

6. Result envelope declares `intent`. Every query function returns a typed envelope carrying `intent: 'point' | 'slice'` alongside its data. `point` means the answer is a single scalar figure (e.g. "checkout-service spent $1,284.50 on GPT-4o last week"); `slice` means the answer is a filtered or grouped set (e.g. "spend by model this month"). This is declared per function in the Zod schema — a property of the function, not inferred at runtime — and it drives how the answer is presented: a `point` result renders as an inline answer block, a `slice` result re-scopes the statement view to the returned filter. The UI switches on this field and never guesses, so the same schema is the single contract behind both what the model may call and how each answer is surfaced. The Zod result type is therefore a discriminated union on `intent`: `point` results expose a single `{ metric, value, unit }`; `slice` results expose `{ groupBy, rows[] }`. Out-of-scope (5) and cost-cap-exceeded responses are separate envelope variants, not an `intent` value — they carry no data payload.

## Alternatives considered and rejected

### Allow-list of query functions vs. a block-list over generated SQL
Rejected the block-list. The block-list approach — let the model emit SQL, then strip or reject dangerous statements (`DROP`, `DELETE`, stacked queries, etc.) — is enumerate-the-bad, and that set never closes. Comment injection, subqueries reaching other tenants, and deliberately expensive Cartesian joins are all new holes as they're discovered. An allow-list is enumerate-the-good: the safe query surface is finite, hand-reviewed, and auditable, and adding a capability is a deliberate act rather than a gap someone finds later. This is the core security-by-design decision, and it also closes the cross-tenant and runaway-query-cost vectors that free SQL would open.

### Function-calling with structured args vs. model-generated parameterized SQL from templates
Both are "allow-list" flavored, but chose function-calling. Having the model fill a SQL template still means query text crosses the model boundary and has to be re-validated. With function-calling the model emits structured arguments only; the server owns the mapping from `(function, args)` to a parameterized query. Less surface, cleaner validation, and the arguments are trivially checkable with Zod.

### Server-enforced cost cap vs. client-side estimation only
Rejected client-side-only. A client-side estimate is valuable for legibility — showing `≈ $0.006` before the user sends sets expectations — but it is trivially bypassable and only approximate, so it cannot be the thing that protects the bill. The hard ceiling is enforced on the server against real token accounting. We keep both, with an explicit split: client estimate = legibility, server ceiling = enforcement.

### Per-query cost ceiling vs. hourly query-count throttle (the deferred piece)
Shipping the per-query ceiling; the hourly throttle is designed-not-built (see below). These guard different things. The per-query ceiling bounds the cost of any single request — the actual runaway-cost failure mode, tied directly to dollars. A query-count throttle bounds volume (a user or a loop hammering the endpoint), which is real but is an abuse/volume concern, not a per-request cost concern. Two consequences settle the order: (a) at MVP data volume with a single authenticated user, volume abuse is not the live risk, whereas one pathological query is; and (b) shipping only the throttle would leave the more important hole — a single expensive query — wide open, while shipping only the ceiling closes it. So the ceiling ships first; the throttle is documented as designed-not-built and added at production scale.

### Enforcing org scope in the prompt vs. at the query layer
Rejected prompt-level scoping. Instructing the model "only return data for org X" is not a security control — it's a suggestion the model can ignore or be talked out of. `orgId` comes from the JWT and is injected server-side into every query; the model never sees it as a controllable parameter.

## Designed, not built — hourly query-count throttle

Deferred to production scale, recorded here so it's a deliberate boundary rather than a gap.

- Purpose: bound request volume per user (abuse, runaway client loops), complementing — not replacing — the per-query cost ceiling.
- Mechanism: a sliding-window counter keyed on `orgId + userId`, allowing N LLM-backed queries per rolling hour. On breach, the endpoint returns HTTP 429 with a `resetAt` timestamp.
- UI surfacing (when built): a rail meter (`8 / 10 this hour`) that shifts teal → amber → red, plus an amber "queries left this hour · resets HH:MM" banner above the input as the limit approaches, and a paused-input state with the reset time when hit.
- Why safe to defer: the per-query ceiling already bounds cost per request; the throttle adds volume protection that only matters at real multi-user scale, which the MVP demo does not exercise.

Interview framing: this is the "knowing what you deferred and why" answer — the deferred piece is a volume control, the shipped piece is the cost control, and shipping the cost control first is the correct order because it closes the larger hole.

## Trade-offs and consequences

Positive:
- The query surface is finite, auditable, and reviewed — no open-ended SQL over billing data.
- Cost is bounded per request and enforced where it can't be bypassed.
- Tenant isolation is structural: the model has no parameter to reach another org.
- The Zod schema is a single source of truth — LLM tool definition, API validation, and the user-facing "scope" list all derive from it.
- Guardrails are legible on screen (mapped-query tag, per-query cost vs. cap, out-of-scope fallback), which is the interview talking point.

Negative / accepted costs:
- The assistant can only answer questions that map to an allow-listed function; genuinely novel questions require adding a new function. This is a deliberate limitation, not a defect.
- Maintenance cost grows as query types are added.
- The model can occasionally map an ambiguous question to a slightly-wrong function; mitigated by always showing the "mapped to" tag so the user can see and correct the interpretation.

UI consequence of the locked MVP scope (reflect across all four screens):
- The assistant screen shows the per-query cost ceiling only — the `≈ $0.006` pre-send estimate, the `$0.006 / $0.02` post-answer cost tag, and the `Per-query cap $0.02` reference in the cost-cap rail.
- The hourly count meter (`8 / 10 this hour`) and the amber "queries left this hour" banner are part of the deferred throttle and are absent from the MVP UI. The cost-cap rail panel shows per-query cap and last-query cost, not an hourly count.
- Login/signup, dashboard, and budget-alert screens are unaffected in mechanism but should not imply an hourly quota anywhere in copy.

## Follow-ups

- Hourly query-count throttle (designed above).
- Caching identical queries within a short window to avoid re-paying for repeated questions.
- Compositional / multi-step queries (raises the round-trip cap and the ceiling — revisit deliberately, not by default).

---

## Amendment (2026-08-04) — four claims in the body did not survive ADR-0004 and its own 2026-07-23 amendment; this ADR was never corrected to say so

**Status of what this amends:** ADR-0004 built the binding this ADR only sketched the shape of, and ADR-0004's same-day amendment then reversed the cost model the shape was built on — dollars to a local compute budget, Ollama instead of a hosted model. ADR-0004 named that reversal explicitly, in writing, the day it happened. This ADR did not get the same treatment: its Status line stayed a bare "Accepted" for twelve days while its own Decision 4 and §6 quietly stopped being true. A 2026-08-04 documentation audit is what caught it, not the build session that caused it. Per this branch's own rule — name the gap, don't silently patch the body — the text below is left exactly as written on 2026-07-05, and this section is the correction of record.

### 1. Decision 4's dollar ceiling — superseded

The body's §4 sets "a hard ceiling (target `$0.02`)" enforced by "the server tracks actual token usage and hard-stops," with a client-side "≈ $0.006" estimate and a post-answer "$0.006 / $0.02" tag. None of this survives ADR-0004's 2026-07-23 amendment §3, which re-derives the ceiling as a **pre-compute token admission gate** (`checkAdmission()`, 500 question tokens against a computed ~2,749-token fixed prefix) plus a **45-second wall-clock timeout backstop** (`REQUEST_TIMEOUT_MS` in `apps/api/src/assistant/budget-gate.ts`, renamed from `cost-gate.ts` — no pricing constant survives in that file). The enforce-*before*-spend ordering the body argued for is exactly what carries forward; only what gets measured (dollars → tokens and wall-time) changed. The UI reflects this: `apps/web/src/components/statement/cost-cap-card.tsx` reads "Query paused — over the per-query compute budget," `~{tok} estimated, {tok} budget" — no `$` anywhere in either the client estimate (`ask-bar.tsx`) or the post-answer meter (`answer-block.tsx`).

### 2. "≤2 tool-call round-trips" — superseded

The body's §4 sketches "a small cap on tool-call round-trips (≤2)." ADR-0004 §Decision 3a tightened this to **exactly one** model call, structurally: the mapping call returns one tool_use, and the answer is rendered by a deterministic server-side template — there is no second (synthesis) call to bound, so there is no round-trip count left to cap. `assistant.service.ts` dispatches once per request; nothing in the codebase makes a second model call.

### 3. §6 — `intent` is derived server-side at runtime, not a static property of the function

This is the one worth flagging most precisely, because the body's claim and the shipped behavior are direct opposites, not just differently worded. The body's §6 says: *"This is declared per function in the Zod schema — **a property of the function, not inferred at runtime**."* ADR-0004 §Decision 2 states the opposite and built it that way: *"Not inherent to the function. `getSpend` returns either a point or a slice; the function does not 'know' which… Derived, server-side, deterministically"* from whether the validated arguments include `groupBy`. Verified in `usage-events.repository.ts`: each of the four metric functions computes `intent` from `groupBy`'s presence in the parsed args at call time — there is no per-function static discriminator anywhere in the schema. The property this ADR actually cares about — the UI switches on `intent` and never infers it itself — still holds; only the mechanism that produces `intent` is different from what's written above.

### 4. §1's "SQL/DynamoDB query" — DynamoDB was rejected before this ADR was even renumbered

The body's §1 describes each allow-listed function as "backed by a hand-written, parameterized SQL/DynamoDB query." ADR-0002 §Decision 1 (2026-07-22) rejected DynamoDB outright — hot-partition analysis against this product's write distribution — and shipped a single Postgres `usage_events` table. No DynamoDB dependency, config, or code path exists anywhere in the repo. The word survives here only because this ADR's body predates ADR-0002 and was never swept for the reference once the database decision landed.

### 5. What is explicitly NOT reopened

The properties this ADR exists to guarantee are untouched by any of the above, and ADR-0004 built directly against them without amendment:
- **Allow-listed functions, not generated SQL** (§1/§2) — the five-name hardcoded dispatch, Zod schema as the sole allow-list, `filter.value` reaching the database only as a bound parameter.
- **Tenant scope server-injected, never model-controlled** (§3) — no tool's input schema has ever had an `orgId` field.
- **Deterministic out-of-scope fallback** (§5) — `report_out_of_scope` is still a forced structured tool call, not a keyword pre-filter, and still costs at most one bounded call.
- **`intent` still drives presentation deterministically** (§6) — only *how* it's computed changed (point 3 above), not that the UI trusts it unconditionally.

### 6. Corrections this amendment makes to the record

- **This ADR's Status** now reads "Amended 2026-08-04," matching the header note added above, instead of implying the 2026-07-05 body is still the operative design.
- **`docs/adr/README.md`'s index row for 0003** currently reads "Accepted" with no amendment marker — it should be updated to match ADR-0001's and ADR-0004's rows, which both name their amending ADR/date inline. Not changed by this amendment (out of this file's scope), flagged here so it isn't mistaken for having been fixed.
- **No code changes.** Every discrepancy above is a documentation gap, not a behavior gap — the shipped system already matches ADR-0004 and its amendment; only this ADR's text was stale.
