# Roadmap

What's designed but intentionally not built, and what a genuine next phase would tackle — distinct from [known-issues.md](./known-issues.md), which tracks defects in what *is* built. Every item here has an owner ADR with the mechanism worked out, so "how would you make this production-grade?" has a concrete answer, not a shrug. That's a deliberate project convention: a documented cut is a legitimate outcome under this project's time-box, not a failure state.

## Designed, not built

| Item | Where it's designed | Why it's not built yet |
|---|---|---|
| **Postgres Row-Level Security** as a second enforcement layer beneath the application query layer | [ADR-0001 §Decision-3](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md) | Application-layer enforcement (`orgScope()`) already closes the isolation gap for every real caller, including the assistant's non-HTTP data access. RLS would be defense-in-depth, not a fix for a known hole. |
| **A `jti` denylist in Redis** to close the ≤15-minute access-token revocation window | [ADR-0001 §1d](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md) | The window is an accepted residual for this data's sensitivity — closing it needs a new piece of infrastructure (Redis) for a gap that's real but small. |
| **SQS-backed async ingestion**, including the `201`→`202` contract change it implies | [ADR-0002 §2d](./adr/0002-usage-event-persistence-single-path-ingestion-and-named-aggregation-layer.md) | The synchronous path handles the demo's real load; `externalId` is already present on `usage_events` specifically so this escalation needs no migration when it lands. |
| **An hourly query-count throttle** on the assistant, layered on top of the existing per-query token ceiling | [ADR-0003](./adr/0003-nl-query-guardrails.md), [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md) | The per-query ceiling already closes the cost hole; the throttle is a volume control the demo never exercises. |
| **Running Ollama on a free-tier VM** (Oracle Cloud Always-Free Ampere A1, sized to fit) so the assistant works on the public deploy | [ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md) | Scoped and explicitly declined for this phase — a new cloud account and real operational surface (health checks, keep-alive, monitoring) to preserve one feature, weighed against this phase's runway. Not ruled out forever. |
| **A published `sdk` package** wrapping `POST /v1/events` | `packages/sdk` (currently an `export {}` stub) | No second consumer exists yet to justify extracting a public client — building it now would be the premature abstraction the project's development principles explicitly rule out. |
| **Extracted shared UI package** | `packages/ui` (currently an `export {}` stub) | Same reasoning as `sdk` — `apps/web/src/components/ui/*` is the candidate set, extractable once (if ever) a second frontend needs it. |
| **Token→price normalization** at ingestion time (cost precomputed by the caller today) | noted in `ingest-event.dto.ts` | Out of MVP scope — the ingestion contract accepts a precomputed `costMicros`, which is realistic for a service that already knows its own per-call pricing. |

## Genuine near-term next steps

Unlike the table above, these aren't formally designed yet — they're the most obvious next moves if this project continued past its current interview-ready state:

- **Resolve the two open e2e items in [known-issues.md](./known-issues.md)** — confirm the role-gated budget-alert e2e block and the cookie-auth fix both pass against a live Postgres instance, once Docker is available on a dev machine that can run it. Both fixes are code-complete and reasoned through; neither has been observed green.
- **Decide the free-tier-vs-VM question for the assistant in production** for real, rather than leaving it as a scoped-and-declined option — either stand up the Oracle Cloud path from ADR-0005, or write a short follow-up ADR formally closing the question for this project's lifetime.
- **Budget-alert notifications are computed but not delivered.** `capMicrosFor()` and `getSpend` together give everything needed to detect a crossed threshold, but nothing currently sends an email or webhook when one fires — the "notify" half of "budget alert" is UI-only today (the form collects `notifyEmail`, nothing consumes it yet).
- **A real health-check endpoint.** `GET /` (`AppController.getHello()`) is a placeholder liveness check, not something a real uptime monitor or Render health check should depend on for anything beyond "the process is up."

## Explicitly not on this roadmap

Per this project's own standing rule (see [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md)'s amendment and [ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md)): **swapping the assistant to a paid hosted LLM API.** This has been proposed and rejected multiple times, in this project and its sibling (Atlas), specifically because "just this once, to make the demo work" is the exact pressure the no-paid-API rule exists to hold against. It doesn't belong on a roadmap because it isn't a planned future state — it's a considered and closed question.
