# ADR-0005: Deploy topology (Vercel + a separate API host), cross-site cookies, and no Ollama in production

**Status:** Accepted
**Date:** 2026-07-26
**Scope:** MVP, interview-critical. `schedule-v2.md` §4 Jul 31 milestone: "Deploy (Vercel)."
**Resolves:** the deploy session's real open question — what the NL-query assistant does in a public deploy, given the standing no-paid-API rule (ADR-0004 amendment §1) and the fact that Ollama is a local daemon.
**Related:** ADR-0004 and its 2026-07-23 amendment (Ollama, the compute budget, the 42–74s cold-load finding). Atlas `atlas_live_deploy` (project memory) — the same question, asked and answered first for Atlas's `ai-assistant` remote, on 2026-07-20.

---

## Context

Cogent's web app (Next.js) and API (NestJS) deploy to two different hosts — Vercel for the web app, a separate host for the API — because that is what "Vercel" in the schedule actually implies once the API is not itself a Next.js API route. That is a genuinely cross-*site* topology, the same shape Atlas hit with Netlify + Render, and it forces two decisions before anything goes live:

1. **Do the auth cookies survive it?** (ADR-0001 assumed same-site `localhost` in dev.)
2. **What does the NL-query assistant do, given it depends on a local Ollama daemon that a managed API host almost certainly cannot run the way a laptop does?**

This ADR is (2), with (1) recorded here because it was found and fixed in the same pass.

---

## Decision 1 — Cookies: `COGENT_CROSS_SITE_COOKIES` toggles `SameSite=None; Secure` on both cookies

`apps/api/src/auth/cookies.ts` hard-coded `SameSite=Lax` (access) / `SameSite=Strict` (refresh) — correct for local dev, where web and API are both `localhost` and therefore same-site, but silently wrong for a real split-host deploy. Neither `Lax` nor `Strict` cookies attach to a genuinely cross-site request: login would return `200` with `Set-Cookie`, and the browser would never store or send it back — every subsequent call reads as anonymous, with no error anywhere to point at. This is exactly the bug Atlas found on Netlify/Render (`ATLAS_CROSS_SITE_COOKIES`), so it was checked for here proactively rather than left to be discovered as a live login failure.

**Fix:** one new env var, `COGENT_CROSS_SITE_COOKIES=true`, read in exactly one place (`cookies.ts`), flips both the access and the refresh cookie to `SameSite=None; Secure`. Unset (the dev default), behavior is byte-identical to before. `Secure` is forced on whenever this flag is on, independent of `NODE_ENV`, since `SameSite=None` without `Secure` is rejected by browsers outright.

One detail that doesn't transfer directly from Atlas: ADR-0001 §1c reasoned that the refresh cookie could be `SameSite=Strict` because it is "only ever read by same-site XHR from an already-loaded page." Under a cross-site deploy that premise is false — the refresh call is a cross-site `fetch()` even though it's initiated by the page's own JS — so the refresh cookie needs the same `None` override, not just the access cookie. Recorded here because it would have been an easy half-fix (flip only the access cookie, watch refresh silently fail 15 minutes into every session).

CORS (`main.ts`) was already env-gated (`WEB_ORIGIN`) and needed no change.

---

## Decision 2 — No Ollama in production; the assistant ships its real degraded state

**The premise, stated once so the rest of this doesn't re-argue it:** ADR-0004's amendment already established, for reasons independent of this deploy, that Cogent runs no paid LLM API — "no paid APIs, no subscriptions, no billing accounts, anywhere in this project — no exceptions." That rule was not written *for* deploy; deploy is just the moment it gets tested hardest, because now there's a real pressure ("just this once, to make the demo work") to reach for a hosted model. This is the third time this exact tension has shown up (Atlas's `ai-assistant`, this project's own original Anthropic-SDK build, now this). The answer has to be the same each time or it isn't a rule.

**Could a free-tier host run Ollama instead of reaching for a paid API?** Checked, not assumed:

- Ollama needs the model resident in memory to serve a request; `llama3.2:3B` plus Ollama's own overhead needs on the order of several GB of RAM to run without thrashing. Standard free-tier PaaS web services (Render's free tier: 512 MB RAM / 0.1 CPU) are roughly an order of magnitude short. This isn't a tuning problem — there's no `num_predict` or quantization knob that closes a >4x RAM gap on a free tier sized for static sites and thin APIs.
- Even ignoring RAM: free PaaS tiers idle-suspend the service (Render free spins down after ~15 minutes of no traffic). Every real visitor to a portfolio demo arrives after exactly that kind of gap, so in practice **every real request would pay the measured 42–74s cold-load-plus-tool-grammar-compilation cost** (ADR-0004 amendment §3b/§7 item 9) — not as a rare edge case, but as the normal case. A demo where the first real click hangs for a minute is a worse outcome than an honest, instant "unavailable."
- A host that genuinely could run it exists in principle — e.g. Oracle Cloud's Always-Free Ampere A1 shape (up to 24 GB RAM, no time limit) is sized for this. It is **not chosen for this deploy**: it is a new cloud account and a meaningfully bigger piece of infrastructure to stand up and operate correctly (health checks, keep-alive, monitoring) than this deploy phase's runway budgets for, to preserve a nice-to-have path for one feature. CLAUDE.md's own rule applies directly — "don't reach for cloud services unless they meaningfully improve the project or the story you can tell about it" — and the story is *better*, not worse, with the boundary shown honestly. Recorded here as the designed-not-built escalation path, not ruled out forever.
- Tunneling the deployed API back to the local Ollama daemon (ngrok/cloudflared) was considered and rejected outright: it makes "deployed" mean "works only while my laptop is on and tunneled," which is a worse and less honest claim than a clean 503, and it reintroduces exactly the kind of fragile hidden dependency this project's other ADRs have consistently refused to accept.

**Decision: production runs with no reachable Ollama daemon, on purpose.** `COGENT_OLLAMA_BASE_URL` is left pointed at a `localhost` default (or simply unset) on the deployed API. This was already the *only* honest option once the RAM/idle-suspend numbers ruled out a free host and the standing rule ruled out a paid one — the code changes required were zero, because the failure path was already built correctly:

- `OllamaAssistantClient.onModuleInit()` is already a best-effort warm-up, not a boot gate (`ollama-client.ts`'s own comment: "a failed warm-up degrades to first-query cold-start latency, not a boot failure"). In production it will log one error to stdout at boot and the process starts normally.
- Every `/v1/assistant/ask` call reaches `OllamaAssistantClient.chat()`'s `fetch` `try/catch`, which throws a `ServiceUnavailableException` — never a silent stub, never a fabricated answer.
- The web app already distinguishes this from an out-of-scope answer: `AssistantErrorCard` (`apps/web/src/components/statement/assistant-error-card.tsx`, landed the session before this one) renders `role="alert"`, "Couldn't reach the query service. Retry." — the honest state, not a broken build or a blank panel.

So this decision cost no new code — it is a deploy-config decision (don't point `COGENT_OLLAMA_BASE_URL` at anything reachable) riding on error handling that was already built for the right reasons before deploy was even a consideration.

**What this means for the Jul 31 milestone's "watched the cost cap actually trigger."** That verification already happened, locally, against a real running Ollama daemon (ADR-0004 amendment §7, items 7–9 — 72 live calls, the cold-start finding, the budget-exceeded gate manufactured and watched firing). The public deploy does not re-run that; it demonstrates the *other* honest state — the one a real visitor to the public URL actually sees. Both are true statements about the system, and an interview answer that produces the local verification transcript *and* the live 503 state is a stronger pair than a deploy that fakes the local result.

---

## Alternatives rejected

- **Swap to a paid hosted API for the deployed environment only, keep Ollama for local dev.** Rejected — this is the same bait the rule exists to refuse, just narrowly scoped ("only in prod" is still an exception). If the rule bends under deploy pressure it was never really a rule.
- **A free-tier "serverless GPU" or LLM-hosting product (e.g. a hosted-inference free tier).** Same shape as ADR-0004 amendment §1's rejection of free-tier hosted LLM APIs: billing-capable account required, rate-limited, "free until a wall," not "free by construction." Not different in kind from the paid-API case above.
- **Ship the assistant UI but hide/disable the ask bar entirely in production**, rather than showing a real error on submit. Rejected: it would misrepresent what was built (the feature exists and is verified locally) and removes the honest artifact — a visitor who tries it should see the real, deliberate boundary, not a feature that looks like it was never finished.

## Consequences

- `apps/api/src/auth/cookies.ts` gains `COGENT_CROSS_SITE_COOKIES` (§Decision 1). `.env.example` documents it.
- No code changes for §Decision 2 — the deploy simply does not point `COGENT_OLLAMA_BASE_URL` at a reachable daemon. `COGENT_OLLAMA_MODEL`/`COGENT_OLLAMA_BASE_URL` stay documented in `.env.example` as the local-dev path.
- `docs/known-issues.md` is unaffected by this decision (it is a deploy-topology choice, not a defect) — no entry added there.
- Closeout (README "why the assistant shows unavailable in prod" framing, demo walkthrough) is next session's work, not this one; this ADR is the record in the meantime.

## Verification plan

1. Deploy with `COGENT_CROSS_SITE_COOKIES=true` on the API host, `NEXT_PUBLIC_API_URL` pointed at it from the Vercel deploy. Sign up on the real public URL; confirm the session cookie is present in DevTools (`HttpOnly`, `Secure`, `SameSite=None`) and that a page reload keeps the session (not silently anonymous).
2. Hit `/v1/assistant/ask` on the real deployed API with no Ollama reachable; confirm a `503` with `"Assistant is temporarily unavailable"`, and confirm the web UI renders `AssistantErrorCard` (`role="alert"`), not a blank panel or an uncaught error.
3. Confirm API boot does not hang or crash when `onModuleInit()`'s warm-up fails — the process should reach "listening" and serve other routes normally.
