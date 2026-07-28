# `api` — Cogent-AI backend

NestJS. Auth, ingestion, usage aggregation, budget alerts, and the NL-query assistant.

See the [root README](../../README.md) for architecture and setup, and [`docs/adr/`](../../docs/adr/README.md) for why any of it is shaped the way it is.

```
src/
  auth/        Hand-rolled JWT (argon2id, rotating refresh w/ reuse detection),
               the API-key guard for machine-to-machine ingestion, cookie policy
  db/          Drizzle schema, migrations, repositories, and the TenantScope
               primitives — branded OrgId, the one scoped-query helper
  ingest/      POST /v1/events — one synchronous write path (ADR-0002)
  usage/       The named, allow-listed aggregation functions the Statement
               and the assistant both read through
  budgets/     Budget alert CRUD and threshold evaluation
  assistant/   Ollama client, the five tool definitions, the dispatch map,
               the compute-budget gate, and deterministic answer templating
```

## Scripts worth knowing

| Command | What it does |
|---|---|
| `npm run start:dev` | Dev server on :3000. First boot warms Ollama — 42–74s cold. |
| `npm run db:generate` / `db:migrate` | Drizzle migration generate / apply |
| `npm run seed:demo` | Creates a demo org and ~3,000 events through the real HTTP API |
| `npm run verify:ollama-tool-calling` | Re-runs the 24-call tool-calling reliability gate against a live daemon |
| `npm run verify:token-estimate` | Checks the local token estimator over-counts against Ollama's real counts |

The two `verify:*` scripts need a running Ollama daemon and are excluded from `npm test` by design — they measure a live model, so they're a gate you run deliberately, not on every commit. Re-run `verify:ollama-tool-calling` whenever the system prompt, the tool schemas, or `coerce-args.ts` change; a passing run today isn't a permanent guarantee.
