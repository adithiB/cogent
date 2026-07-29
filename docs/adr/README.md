# Architecture Decision Records — Cogent-AI

Every significant decision in this repo, with the alternatives considered and the trade-off taken. These are written to be read by someone who wasn't there — each one names what it rejected and why, and several of them record where a later finding proved an earlier belief wrong rather than quietly editing the mistake out.

**Read in this order** if you're new to the project: 0001 (how tenancy is enforced) → 0002 (what the data layer looks like) → 0003 and 0004 (the NL-query assistant, which is the point of the project) → 0005 (how it deploys, and what it honestly can't do in production).

| # | Decision | Status |
|---|---|---|
| [0001](./0001-hand-rolled-jwt-and-org-scoped-rbac.md) | Hand-rolled JWT auth, org-scoped RBAC enforced at the query layer, signup creates the tenant | Accepted, built · amended by 0005 |
| [0002](./0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md) | Usage events in Postgres, one synchronous ingestion path, reads through named allow-listed aggregation functions | Accepted, built |
| [0003](./0003-nl-query-guardrails.md) | NL-query guardrails: allow-listed query schema + per-query ceiling (the shape) | Accepted |
| [0004](./0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) | The assistant is LLM function-calling bound to 0002's functions; `intent` derived server-side; ceiling enforced before spend (the binding) | Accepted, built · **superseded in part by its own 2026-07-23 amendment** |
| [0005](./0005-deploy-topology-and-the-production-ollama-boundary.md) | Deploy topology (Vercel + separate API host), cross-site cookies, and no Ollama in production | Accepted, built |

## The three that carry the most interview weight

**[0001](./0001-hand-rolled-jwt-and-org-scoped-rbac.md) — why tenant isolation lives at the query layer, not the route.** The argument isn't "route guards are bypassable" (they aren't — they run on the server). It's that the assistant is a *non-HTTP caller of the data layer*, so an HTTP-layer check doesn't cover the feature the product exists to demonstrate. Also contains the deliberate contrast with Atlas's ADR-0007, which stubbed auth: *build what your project's central claim is about, stub what it merely consumes.* Same engineer, same month, opposite calls, one rule generating both.

**[0004](./0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) + its amendment — the one to read if you only read one.** The body argues a per-query \$0.02 dollar ceiling on `claude-haiku-4-5`. The amendment, written the same day before that code was committed, records that the entire premise was wrong: this project runs no paid APIs, so there is no per-token dollar cost to bound. Rather than silently rewriting the body, the amendment names the gap and re-derives the guardrail as a **compute** budget — a pre-compute token admission gate plus a wall-clock timeout, both empirically measured on the real daemon. It also documents four separately-diagnosed model-output defects found by running a 24-call verification pass three times (54.2% → 62.5% → 91.7%), each fix written only after tracing the failure to raw model output and an exact Zod error.

**[0005](./0005-deploy-topology-and-the-production-ollama-boundary.md) — the decision not to fake a working demo.** No free-tier host can run Ollama (RAM floor, plus idle-suspend making every real visitor pay the measured 42–74s cold-load), and the standing no-paid-API rule rules out the workaround. Production therefore ships the assistant's real 503 degraded state. The interesting part is that this cost zero new code — the honest failure path was already built, for its own reasons, before deploy was a consideration.

## Designed, not built

Recorded with their mechanisms so "how would you make this production-grade?" has a concrete answer rather than a shrug:

- **Postgres Row-Level Security** as the layer below the application's query-layer enforcement — 0001 §Decision-3.
- **A `jti` denylist in Redis** to close the ≤15-minute access-token revocation window — 0001 §1d, including why the window is acceptable *for this data* and what would change that.
- **SQS-backed async ingestion** (and the `201`→`202` contract change it implies) — 0002 §2d.
- **The hourly query-count throttle** — 0003, 0004; deliberately not built, because the per-query ceiling closes the cost hole while the throttle is a volume control the demo never exercises.
- **DynamoDB, rejected** — 0002. Choosing not to add a database, with the reasoning written down, rather than adding one for the résumé line.
- **Running Ollama on a VM-class free tier** (Oracle Cloud Ampere A1) — 0005, scoped and declined for this phase rather than left unexamined.

## What CI actually checks

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs lint, typecheck, build, and `apps/api`'s unit test suite on every push and PR to `main`. It deliberately does **not** run `test:e2e` or the `verify:*` scripts, for the same reason 0004 and 0005 both apply elsewhere: a check that can't actually run for real is worse than no check. `test:e2e`'s assistant describe block needs a live Ollama daemon — a 42–131s cold warm-up (0004's amendment) a GitHub-hosted runner doesn't provision — and three of its cases have a pre-existing, tracked cross-tenant-cookie gap ([`known-issues.md`](../known-issues.md)) that would either fail CI on missing infrastructure or hide inside 150s of expected-looking flakiness. The comment in the workflow file names this inline rather than leaving a silent gap between what CI's badge implies and what it actually covers.
