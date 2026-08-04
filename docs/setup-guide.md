# Setup Guide

Getting Cogent-AI running locally, end to end, including the parts that trip people up. For a quick version, the README's "Running locally" section covers the same ground more tersely.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥20 (see `.nvmrc`) | Both apps and the workspace root require it (`package.json` `engines.node`) |
| npm | 10.x | The monorepo uses npm workspaces — a different package manager (pnpm/yarn) will not resolve the workspace correctly |
| Docker | any recent version | Runs local Postgres via `docker-compose.yml`. Not required if you point `DATABASE_URL` at a Postgres instance you already have running elsewhere |
| [Ollama](https://ollama.com) | any recent version | Only needed for the NL-query assistant. Everything else (auth, ingestion, Statement, Budgets) works without it |

## 1. Install dependencies

From the repo root — this is a single npm workspace, not three separate installs:

```bash
npm install
```

## 2. Start Postgres

```bash
docker compose up -d postgres
```

This starts Postgres 16 on `localhost:5432` with credentials matching `apps/api/.env.example`'s default `DATABASE_URL` (`cogent` / `cogent_dev_only` / db `cogent`). Data persists in a named Docker volume (`postgres_data`) across restarts.

If you'd rather not run Docker, point `DATABASE_URL` at any reachable Postgres 16+ instance — nothing else in the setup depends on it being containerized.

## 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Then open `apps/api/.env` and set `JWT_SECRET` to a long random value — it's the only variable in the example file without a usable default. Everything else is fine for local dev as-is. Full reference for every variable, in both apps: [environment-variables.md](./environment-variables.md).

## 4. Run database migrations

```bash
npm run db:migrate --workspace=apps/api
```

This applies the Drizzle migrations that create every table in [database-schema.md](./database-schema.md). Re-run this any time you pull changes that touch `apps/api/src/db/schema.ts` or `apps/api/drizzle/`.

## 5. (Optional) Pull the assistant's model

Only needed if you want to use the NL-query assistant:

```bash
ollama pull llama3.2
```

Everything else in the app works with no Ollama daemon running at all — the assistant will simply return its real "couldn't reach the query service" error, the same state the public deploy shows.

## 6. Run both apps

In two separate terminals:

```bash
npm run start:dev --workspace=apps/api   # http://localhost:3000
```

```bash
npm run dev --workspace=apps/web         # http://localhost:3001
```

Or, from the repo root, `npm run dev` runs every workspace's `dev`/`start:dev` script in parallel via Turborepo — equivalent to the two commands above, one terminal instead of two.

Open `http://localhost:3001`. An anonymous visit redirects to login; sign up to create an org (signup *is* tenant creation — see [ADR-0001](./adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md)).

## 7. (Optional) Seed demo data

To get a fully populated org instead of starting from zero, with the API already running:

```bash
npm run seed:demo --workspace=apps/api
```

This prints the login credentials it creates and produces ~3,000 usage events across four projects over 14 days. It goes through the *real* signup and ingestion HTTP endpoints — nothing writes to Postgres directly — so if ingestion or the API-key guard is broken, the seed fails loudly instead of papering over it.

## Known slow paths — not bugs

- **First assistant query is slow.** The API warm-loads Ollama at boot (`OllamaAssistantClient.onModuleInit()`), which measures **42–74s cold** — model weights plus a separate tool-grammar compilation a bare text prompt doesn't trigger. Once warm, real questions answer in ~15–20s. If Ollama isn't running at all, you'll get a real 503 immediately, not a hang.
- **e2e tests can take up to 150s per suite.** Every describe block in `tenant-isolation.e2e-spec.ts` boots a full Nest app including that same Ollama warm-up call — see [known-issues.md](./known-issues.md) for why the timeout was raised rather than the warm-up removed.

## Common setup problems

| Symptom | Likely cause |
|---|---|
| API fails to boot with a config error | `JWT_SECRET` or `DATABASE_URL` missing from `apps/api/.env` — both use `getOrThrow`, so a missing value fails fast at boot rather than failing later on first use |
| Login works, but a page reload logs you out | Check `apps/web/.env.local`'s `NEXT_PUBLIC_API_URL` matches where the API is actually listening, and that you didn't set `COGENT_CROSS_SITE_COOKIES=true` locally (it forces `SameSite=None`, which some browsers won't store over plain `http://localhost`) |
| `npm run db:migrate` can't connect | Confirm `docker compose ps` shows `postgres` as healthy, or that your external `DATABASE_URL` is reachable |
| Seed script fails partway | It's calling real endpoints — check the API is actually running and reachable at the URL the script expects before assuming the seed logic is at fault |

## Verifying the setup worked

- `npm run typecheck` and `npm run lint` (from the repo root, runs across every workspace via Turborepo) should both pass clean on an unmodified checkout.
- `npm run test --workspace=apps/api` runs the unit suite (no Docker/Ollama required).
- `npm run test:e2e --workspace=apps/api` requires a live Postgres connection and boots a real Ollama warm-up per describe block — expect it to be slow (above), not necessarily fast-failing.

## Full command reference

`apps/api` (`--workspace=apps/api`):

| Command | Purpose |
|---|---|
| `start:dev` | Watch-mode dev server, `:3000` |
| `build` | Production build (`nest build`) |
| `start:prod` | Run the built output — matches what the Docker image runs |
| `lint` / `typecheck` | ESLint (`--fix`) / `tsc --noEmit` |
| `test` / `test:e2e` | Unit suite / e2e suite |
| `db:generate` / `db:migrate` / `db:studio` | Drizzle Kit: generate a migration from schema changes / apply migrations / open Drizzle Studio |
| `seed:demo` | Seed a demo org through the real API |
| `verify:token-estimate` / `verify:ollama-tool-calling` | The assistant's manual verification scripts ([ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md)) |

`apps/web` (`--workspace=apps/web`):

| Command | Purpose |
|---|---|
| `dev` | Dev server, `:3001` |
| `build` / `start` | Production build / run it |
| `lint` / `typecheck` | ESLint / `tsc --noEmit` |

Repo root (Turborepo, runs the same script across every workspace that defines it): `npm run build`, `dev`, `lint`, `test`, `typecheck`.
