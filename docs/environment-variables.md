# Environment Variables

Every environment variable the codebase actually reads, grepped from source rather than transcribed from memory — if this list and `process.env`/`ConfigService` usage ever disagree, trust the code and fix this file.

## `apps/api`

Template: [`apps/api/.env.example`](../apps/api/.env.example). Copy to `apps/api/.env` for local dev.

| Variable | Required | Default | Read in | Meaning |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | — (`getOrThrow`, boot fails without it) | `db/db.module.ts` | Postgres connection string. Local dev: `postgres://cogent:cogent_dev_only@localhost:5432/cogent`, matching `docker-compose.yml`. |
| `JWT_SECRET` | **Yes** | — (`getOrThrow`, boot fails without it) | `auth/auth.guard.ts`, `auth/tokens.service.ts` | HS256 signing secret for access tokens. One issuer, one verifier, same process — see [ADR-0001](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md). Use a long random value; never commit a real one. |
| `PORT` | No | `3000` | `main.ts` | Port the NestJS app listens on. |
| `NODE_ENV` | No | unset | `auth/cookies.ts` | When `production`, forces the `Secure` flag on both auth cookies (independent of `COGENT_CROSS_SITE_COOKIES`). |
| `WEB_ORIGIN` | No | `http://localhost:3001` | `main.ts` | CORS allow-list origin. Must exactly match the deployed web app's origin in production — CORS is an explicit allow-list, not a wildcard, because credentialed cross-origin requests can't use one. |
| `COGENT_CROSS_SITE_COOKIES` | No | unset (falsy) | `auth/cookies.ts` | Set to the literal string `"true"` **only** when web and API are on genuinely different registrable domains (e.g. Vercel + a separate API host). Flips both auth cookies to `SameSite=None; Secure`. Leave unset for local dev, where web/API share `localhost` and are same-site. See [ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md). |
| `COGENT_OLLAMA_BASE_URL` | No | `http://localhost:11434` | `assistant/ollama-client.ts` | Base URL of the Ollama daemon the assistant calls. Left unset/unreachable in production **on purpose** — no Ollama runs in production ([ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md)). |
| `COGENT_OLLAMA_MODEL` | No | `llama3.2` | `assistant/ollama-client.ts` | Ollama model tag. Must match a model already pulled locally (`ollama pull llama3.2`). |
| `ASSISTANT_MAX_QUESTION_TOKENS` | No | `500` (`MAX_QUESTION_TOKENS` in `budget-gate.ts`) | `assistant/assistant.service.ts` | Overrides the per-query token admission ceiling. Mainly a verification lever for manufacturing the `budget_exceeded` state on demand — see [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md)'s amendment. **Leave blank, not set to an empty string with intent to "disable" it** — an explicitly blank value is treated as absent (see the comment in `assistant.service.ts` about the `Number('') === 0` bug this guards against), so blank correctly falls back to the default rather than blocking every query. |

No API keys for any hosted LLM provider exist anywhere in this list, by design — the project runs no paid APIs. See [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md)'s amendment and [ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md).

## `apps/web`

Template: [`apps/web/.env.local`](../apps/web/.env.local).

| Variable | Required | Default | Read in | Meaning |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3000/api` | `lib/api-client.ts` | Base URL the browser calls the API at, **including the `/api` prefix** (`main.ts`'s `setGlobalPrefix('api')`). This is the exact variable that caused one of the four real deploy bugs — the Vercel env var was set without the `/api` suffix. `NEXT_PUBLIC_*` is inlined into the client bundle at build time by Next.js, so changing it requires a rebuild, not just a redeploy of the same artifact. |

## Not environment variables, but adjacent

- `docker-compose.yml` sets `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` for the local Postgres container only — these aren't read by application code, they just need to match the credentials embedded in the local `DATABASE_URL` above.
- Neon (production Postgres), Render (API host), and Vercel (web host) each hold their own copies of the `apps/api` / `apps/web` variables above in their own dashboards — there is no shared `.env.production` checked into the repo. See [deployment-guide.md](./deployment-guide.md).
