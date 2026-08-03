# Cogent-AI — Known Issues

Running list of flagged debt, kept open until each is closed for real — same discipline Atlas keeps for `RemoteIdentity`, `useTeamRecords`, and the SRI mismatch. An item moves to Closed only when it's actually fixed, not when it stops being annoying.

## Open

- **e2e default test timeout raised to 150s.** `apps/api/test/jest-e2e.json`, changed 2026-07-26 (Budgets session). Every describe block in `tenant-isolation.e2e-spec.ts` bootstraps its own full Nest app, including a real `OllamaAssistantClient.onModuleInit()` warm-up call — a cold local-model load can exceed Jest's default 5s hook timeout, which was failing every block's `beforeAll` before this change. The trade: a genuinely hung or slow-regressed test now takes up to 150s to report failure instead of 5s, which will quietly slow the feedback loop on this suite. If a future session hits a slow-to-fail e2e run, this is why — check whether it's a real regression before assuming it's just Ollama cold-start.

## Closed

- ~~NL-query assistant: 3 e2e tests fail with 401 on cookie-authenticated requests~~ — root-caused and fixed 2026-08-03. Not an auth-path defect: `main.ts` registers `cookie-parser()` at bootstrap, but every e2e describe block's `createNestApplication()` bypasses `main.ts` entirely and never registers it, so `AuthGuard` reads an undefined `req.cookies` and 401s before touching real auth logic. Only the "Tenant isolation — NL-query assistant (ADR-0004)" block is affected, because it's the only one authenticating via `.set('Cookie', ...)` rather than a bearer API key or a direct repository call. Fix: `app.use(cookieParser())` added to that block's `beforeAll`, mirroring `main.ts`'s own bootstrap line-for-line; `cookie-parser`/`@types/cookie-parser` were already dependencies, so no new package. **Not locally re-run against a live Postgres instance** — Docker Desktop is not runnable on this dev machine (same limitation Atlas's README already names), so the fix is verified by exact code-path tracing against `main.ts`, not by a green CI run. Confirm on the next CI run or whenever Docker/Postgres is available locally.
