# Component Documentation

`apps/web/src/components` — organized by feature, matching the same feature-based principle the API side uses (see [folder-structure.md](./folder-structure.md)). Every component here is built against [`cogent-ui-implementation-spec.md`](./cogent-ui-implementation-spec.md), referenced below as "spec §x" — that document is the actual design source; this is an inventory of what implements it.

## App shell & cross-cutting chrome

| Component | Purpose |
|---|---|
| [`app-shell.tsx`](../apps/web/src/components/app-shell.tsx) | The authenticated layout wrapper — nav, org switcher, theme toggle. Redirects anonymous visitors to login (`useSession`). |
| [`org-switcher.tsx`](../apps/web/src/components/org-switcher.tsx) | Dropdown showing the current org; reads from `useSession`. |
| [`theme-provider.tsx`](../apps/web/src/components/theme-provider.tsx) | Wraps `next-themes`. Light is a deliberate brand choice (spec §0.3), not a fallback — no `enableSystem`, no OS-preference auto-switch. |
| [`theme-toggle.tsx`](../apps/web/src/components/theme-toggle.tsx) | Manual light/dark switch. Handles the `resolvedTheme === undefined` pre-hydration state explicitly to avoid a flash of the wrong icon. |
| [`query-provider.tsx`](../apps/web/src/components/query-provider.tsx) | TanStack Query's `QueryClientProvider`, instantiated once per mount via `useState`. Every data hook in `lib/hooks/` depends on this being an ancestor. |

## `auth/` — login and signup

| Component | Purpose |
|---|---|
| [`auth-form.tsx`](../apps/web/src/components/auth/auth-form.tsx) | The login/signup form itself — field validation, submit, error display, calls `lib/api-client.ts`'s `login`/`signup`. |
| [`split-layout.tsx`](../apps/web/src/components/auth/split-layout.tsx) | 2-column grid ≥900px (brand panel + form), stacked below that breakpoint (spec §2.1). |
| [`brand-panel.tsx`](../apps/web/src/components/auth/brand-panel.tsx) | The left-column wordmark/lede block; collapses further and hides its ledger motif below 640px (spec §2.1). |

## `statement/` — the Statement screen and the NL-query assistant UI

The largest feature area — the Statement table plus the ask bar and answer log sit on the same screen (spec §2.2/§2.3).

**Screen composition:**

| Component | Purpose |
|---|---|
| [`statement-screen.tsx`](../apps/web/src/components/statement/statement-screen.tsx) | Top-level screen: owns period/grouping/measure state, composes every piece below, switches between loading/empty/error/success. |
| [`statement-caption.tsx`](../apps/web/src/components/statement/statement-caption.tsx) | Restates the org name in the content region (not just the chrome) so tenancy is legible to a screen reader — rendered unconditionally, outside the loading/empty/error switch, so it survives every state (spec §1.6). |
| [`statement-header.tsx`](../apps/web/src/components/statement/statement-header.tsx) | The 30px hero figure + sparkline + `BudgetRule` (Spend measure only). |
| [`statement-table.tsx`](../apps/web/src/components/statement/statement-table.tsx) | The line-item table: `Line item | Requests | p95 ms | Err % | Spend`. |
| [`header-sparkline.tsx`](../apps/web/src/components/statement/header-sparkline.tsx) | The one chart on the whole screen — single-series period spend, always, never swapped by the selected Measure (spec §1.8). Animation is off outright, not just reduced-motion-gated, since a sparkline's entrance has no informational content to preserve. |
| [`statement-skeleton.tsx`](../apps/web/src/components/statement/statement-skeleton.tsx) | Loading-state placeholder rows. |
| [`statement-empty-state.tsx`](../apps/web/src/components/statement/statement-empty-state.tsx) | A real, reachable state for any brand-new org with zero ingested events — not hypothetical. |
| [`statement-error-state.tsx`](../apps/web/src/components/statement/statement-error-state.tsx) | Inline error block with Retry. |

**Controls:**

| Component | Purpose |
|---|---|
| [`measure-segmented.tsx`](../apps/web/src/components/statement/measure-segmented.tsx) | Spend / Latency / Requests / Errors selector. |
| [`grouping-pill.tsx`](../apps/web/src/components/statement/grouping-pill.tsx) | Group by Project (default) / Team / Model. |
| [`period-pill.tsx`](../apps/web/src/components/statement/period-pill.tsx) | Time window presets — see `lib/period.ts` for why the current three-preset set is an implementation default, not a fully resolved design axis. |
| [`pill-select.tsx`](../apps/web/src/components/statement/pill-select.tsx) | The shared compact dropdown-trigger primitive both pills above are built on. |
| [`viewing-filter-chip.tsx`](../apps/web/src/components/statement/viewing-filter-chip.tsx) | Only rendered when the statement has been re-scoped by a real `slice` answer from the assistant — reflects a live query parameter, never a decorative label. |

**The ask bar and answer log:**

| Component | Purpose |
|---|---|
| [`scope-hint.tsx`](../apps/web/src/components/statement/scope-hint.tsx) | "Read-only · answers are drawn from this account's statement below" + one clickable example question. |
| [`ask-bar.tsx`](../apps/web/src/components/statement/ask-bar.tsx) | The question input, with a live client-side token-estimate readout as you type (UX only — the real admission check is server-side, see [architecture.md](./architecture.md)). |
| [`answer-log.tsx`](../apps/web/src/components/statement/answer-log.tsx) | Up to 4 entries, newest on top, `aria-live="polite"`. Switches between `thinking` / `answer` / `out_of_scope` / `budget_exceeded` / error entries. |
| [`thinking-indicator.tsx`](../apps/web/src/components/statement/thinking-indicator.tsx) | The in-flight state while a real, multi-second-to-over-a-minute Ollama call is outstanding — has to read as "genuinely working," not frozen. |
| [`answer-block.tsx`](../apps/web/src/components/statement/answer-block.tsx) | Renders a real `answer` envelope — the point/slice result plus the `mapped:` provenance tag and the token/wall-time usage tag (never a dollar figure — the assistant runs on local Ollama). |
| [`out-of-scope-card.tsx`](../apps/web/src/components/statement/out-of-scope-card.tsx) | `role="status"` — an *expected* outcome (the model correctly declined), not an error. Warn-tint. |
| [`cost-cap-card.tsx`](../apps/web/src/components/statement/cost-cap-card.tsx) | The `budget_exceeded` state: "Query paused — over the per-query compute budget." `role="status"` — a genuinely zero-spend pause, not an error. |
| [`assistant-error-card.tsx`](../apps/web/src/components/statement/assistant-error-card.tsx) | The real `503`/network-failure state, distinct from `OutOfScopeCard` — `role="alert"`, since this *is* genuinely unexpected. This is what the public deploy shows, by design ([ADR-0005](./adr/0005-deploy-topology-and-the-production-ollama-boundary.md)). |

**Budget legibility inside the Statement:**

| Component | Purpose |
|---|---|
| [`budget-rule.tsx`](../apps/web/src/components/statement/budget-rule.tsx) | Renders the ok/warn/danger status language once a `budget_alerts` row exists for the scope currently being viewed (org total by default, or the active filter chip's scope after a slice re-scope). |

## `budgets/` — the Budgets screen

| Component | Purpose |
|---|---|
| [`budgets-screen.tsx`](../apps/web/src/components/budgets/budgets-screen.tsx) | Two-column layout (form + active alerts), stacked below 720px, form first. One shared `aria-live` region for both cards' create/remove outcomes. |
| [`alert-form.tsx`](../apps/web/src/components/budgets/alert-form.tsx) | The create form: scope dimension/value, threshold type/amount/percent. Owner-only at the API level — see [api-documentation.md](./api-documentation.md). |
| [`sits-indicator.tsx`](../apps/web/src/components/budgets/sits-indicator.tsx) | "Current scoped spend vs. threshold," live against whatever scope/threshold is selected in the form *before* the alert is saved — a preview, not a display of a persisted alert. |
| [`active-alerts.tsx`](../apps/web/src/components/budgets/active-alerts.tsx) | The list of existing alerts, or the empty state. |
| [`alert-item.tsx`](../apps/web/src/components/budgets/alert-item.tsx) | One alert row: scope label, status, remove action. |

## `ui/` — feature-agnostic primitives

Generic building blocks with no feature logic — `button`, `input`, `select`, `table`, `tabs`, `badge`, `dropdown-menu`, `radio-group`, `skeleton`. Two worth calling out:

- [`select.tsx`](../apps/web/src/components/ui/select.tsx) — a **native `<select>`**, styled to match the design tokens, not a Radix component. Deliberate: correct keyboard/screen-reader/`<option>` semantics for free, and the simpler choice for a real form input (project priority #1, simplicity) — this workspace has no `@radix-ui/react-select` dependency at all.
- [`skeleton.tsx`](../apps/web/src/components/ui/skeleton.tsx) — `motion-safe:animate-pulse` only; falls back to a static muted block under `prefers-reduced-motion` rather than a jarring flash.

This folder is the closest thing to what `packages/ui`'s empty stub is reserved for — see [folder-structure.md](./folder-structure.md) for why it hasn't been extracted.

## Shared conventions across every component

- **Color never carries meaning alone.** Every status surface (badges, alert cards, threshold indicators) pairs a tint with an icon and/or text label (spec §1.9).
- **`role="status"` vs `role="alert"` is deliberate, not decorative.** Expected outcomes (out-of-scope, budget-exceeded) use `status`; genuinely unexpected failures (`AssistantErrorCard`, `StatementErrorState`) use `alert`.
- **Reduced-motion has a real fallback, not just "no animation."** `Skeleton` and `ThinkingIndicator` both render a static/text alternative under `motion-reduce`, following the same `motion-safe:`/`motion-reduce:` Tailwind pattern throughout.
- **`"use client"` is only on components that need interactivity or browser APIs** (forms, dropdowns, anything using hooks) — presentational components (`brand-panel.tsx`, `cost-cap-card.tsx`, `statement-caption.tsx`, etc.) are server components by default.

## Data flow into these components

Components don't call `fetch` directly — they consume typed hooks from `apps/web/src/lib/hooks/` (`use-session`, `use-statement`, `use-budget-alerts`, `use-spend-trend`), which wrap `lib/api-client.ts` (REST) and `lib/assistant.ts` (the assistant endpoint) with TanStack Query. See [architecture.md](./architecture.md) for the request lifecycle those hooks trigger.
