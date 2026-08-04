# Folder Structure

An npm-workspaces monorepo (`apps/*`, `packages/*`), orchestrated by [Turborepo](https://turbo.build). This doc explains what lives where and why — for how the pieces talk to each other at runtime, see [architecture.md](./architecture.md).

```
cogent/
├── apps/
│   ├── api/            NestJS — the only thing that talks to Postgres
│   └── web/             Next.js App Router — the only thing the browser loads
├── packages/
│   ├── sdk/              stub — reserved for a published ingestion client
│   └── ui/                stub — reserved for extracted shared components
├── docs/                  everything in this folder
├── docker-compose.yml     local Postgres only
├── turbo.json             build/dev/lint/test/typecheck pipeline across workspaces
└── tsconfig.base.json     shared strict TS config, extended by each workspace
```

## `apps/api` — NestJS

```
apps/api/src/
├── main.ts                 bootstrap: global "/api" prefix, cookie-parser, CORS
├── app.module.ts            root module wiring every feature module together
├── auth/                    signup, login, refresh/rotation, guards, roles, cookies
├── ingest/                  POST /v1/events — the one write path for usage data
├── usage/                   the Statement screen's read surface + shared metric types
├── assistant/                the NL-query assistant: tools, prompt, guardrails, Ollama client
├── budgets/                  budget-alert CRUD
├── db/                       Drizzle schema, the TenantScope brand, scoped-query helpers, repositories
└── common/                   cross-cutting pieces (currently: the Zod validation pipe)
```

Feature modules (`auth`, `ingest`, `usage`, `assistant`, `budgets`) each own a `*.controller.ts` (HTTP surface), `*.service.ts` (business logic), and a `dto/` folder (Zod schemas — request validation and, where relevant, response shaping). This is the "feature-based folder structure" from the project's coding standards, not a `controllers/`, `services/`, `dtos/` split by technical layer.

`db/` is the one folder every feature module depends on, never the reverse:

- `schema.ts` — every table, as Drizzle definitions with inline comments explaining non-obvious column choices (see [database-schema.md](./database-schema.md))
- `scope.ts` — the branded `OrgId`/`UserId`/`TenantScope` types and the single function permitted to construct a scope
- `scoped-query.ts` — the `orgScope()` helper every repository composes its `WHERE` clause with
- `repositories/` — one file per table, the only code that issues SQL

`apps/api/scripts/` holds three standalone scripts, run via `npm run <script> --workspace=apps/api`, not part of the Nest app itself:

- `seed-demo-data.ts` — creates a demo org with realistic usage data through the *real* signup/ingestion endpoints (never writes to Postgres directly)
- `verify-ollama-tool-calling.ts` / `verify-token-estimate.ts` — the manual verification passes referenced in [ADR-0004](./adr/0004-nl-query-assistant-function-calling-intent-and-cost-cap.md)'s amendment

`apps/api/test/` holds the e2e suite (`*.e2e-spec.ts`, run with a real Nest app + real Postgres). Unit tests (`*.spec.ts`) live next to the file they test, inside `src/` — e.g. `auth/roles.guard.spec.ts` next to `auth/roles.guard.ts`.

## `apps/web` — Next.js (App Router)

```
apps/web/src/
├── app/
│   ├── (auth)/            route group: login/signup, its own layout
│   ├── (shell)/            route group: everything behind the app shell (Statement, Budgets)
│   ├── layout.tsx           root layout — theme provider, fonts
│   └── globals.css
├── components/
│   ├── ui/                  generic primitives (button, input, table, tabs, ...) — no feature logic
│   ├── auth/                 login/signup form and its layout
│   ├── statement/             the Statement screen, the ask bar, and the answer log
│   ├── budgets/                the Budgets screen and alert CRUD
│   └── (top-level files)       app-shell, org-switcher, theme toggle/provider — cross-feature chrome
├── lib/
│   ├── api-client.ts          the one fetch wrapper every hook goes through
│   ├── assistant.ts             typed client for /v1/assistant/ask
│   ├── hooks/                    React Query hooks, one per data need
│   ├── period.ts / threshold.ts / format.ts / utils.ts   pure helpers
└── styles/tokens.css           design tokens (see cogent-ui-implementation-spec.md)
```

Route groups (`(auth)`, `(shell)`) split the app by layout without adding a URL segment — `(auth)` renders the split-panel login/signup layout, `(shell)` renders the authenticated app shell (org switcher, nav) around the Statement and Budgets screens.

`components/` is organized by feature (`statement/`, `budgets/`, `auth/`) with a `ui/` folder for feature-agnostic primitives — the same feature-based principle as the API side, mirrored on the frontend. Full inventory: [component-documentation.md](./component-documentation.md).

## `packages/sdk` and `packages/ui`

Both are `export {}` workspace stubs — real npm workspaces that build and typecheck, but nothing in `apps/*` imports from them yet. They're recorded here, and in the README, specifically so the tree isn't misread as more built-out than it is:

- `sdk` is reserved for a publishable client wrapping `POST /v1/events` — the shape an external service would actually install, instead of hand-rolling the ingestion contract.
- `ui` is reserved for the subset of `apps/web/src/components/ui/*` that would be worth extracting once (if ever) a second frontend consumes them.

Neither is built because nothing in this project currently needs a second consumer — extracting a package before there's a second caller is exactly the premature abstraction the project's development principles rule out.

## `docs/`

```
docs/
├── ai-context.md                single-file onboarding doc for an AI assistant picking up this repo cold
├── adr/                       every architecture decision record + its index
├── architecture.md             this doc's companion — how the system behaves at runtime
├── folder-structure.md          you are here
├── setup-guide.md                local dev setup
├── deployment-guide.md            how the live deploy is configured
├── environment-variables.md        every env var, across both apps
├── api-documentation.md            every REST endpoint
├── database-schema.md               every table
├── component-documentation.md        the web app's component inventory
├── known-issues.md                    open defects, kept open until actually fixed
├── roadmap.md                          designed-not-built items and genuine next steps
├── demo-walkthrough.md                 reproduce the demo, screenshot by screenshot
├── cogent-ui-implementation-spec.md     the UI/UX spec the frontend was built against
└── media/                                the screenshots demo-walkthrough.md references
```

`interview-prep.md`, `portfolio-plan.md`, `schedule-v2.md`, `day-by-day-schedule.md`, and `const.md` are planning/prep documents for the engineer building this project, not documentation of the system itself — they intentionally live in `docs/` but aren't part of the "new engineer onboarding" set this file and its siblings cover.
