# Cogent-AI — UI Implementation Specification

**Purpose.** Implementation-ready spec for the four MVP screens. It leaves no open design decisions: every color, control, state, breakpoint, and guardrail is fixed. Hand Claude Code "implement Screen X per §X" and there should be nothing to invent.

**Structural approach (locked earlier, restated).** No left sidebar — a top tab bar with three destinations (Statement · Budgets · Settings). The product is one object — an account of LLM spend — read as an itemized **financial statement**, not a dashboard of KPI tiles. The NL-query **assistant is not a nav destination**; it is the primary control surface embedded in the Statement (ask bar + inline answers) plus a focused expanded thread. Landing is the Statement (`/`): query-first affordance, ledger resting state.

**Palette (locked earlier, restated).** "Ledger" — warm paper, forest ledger-ink accent. Light is default; dark is the accommodation. IBM Plex Sans (UI) + IBM Plex Mono (every measured quantity).

**Stack (locked).** Next.js (App Router) · Tailwind (reads `var(--token)`) · shadcn/ui (Radix) · lucide-react · Recharts · TanStack Query · Zod (the allow-list schema is also the API DTO) · `next/font` self-hosting Plex · Vercel + AWS Lambda.

---

## 0. Resolved open questions (closing the loop)

Every concern raised this session, now closed with a concrete decision.

1. **Does the Ledger palette fit the ledger/statement structure?** Yes — it reinforces it (paper + green-ink is the accounting-ledger vernacular), and it fixes the mild tension the teal/ink palette had with a statement layout. Consequences below are now locked.
2. **Green-on-green (brand forest `#2F5D3E` vs. ok `#3E7A45`).** Locked usage rule: forest `--accent` is used **only** for interactive chrome (primary buttons, active tab underline, links, send control, the `mapped:` tag). Green `--ok` is used **only** inside status readouts (budget under-threshold, improved deltas). They are never placed adjacent. Status meaning always carries an icon + text label, never hue alone.
3. **Default theme.** Locked: **light by default** as a deliberate brand call (the identity is paper); the toggle is available and the choice is persisted (`next-themes`). We do **not** auto-switch to dark on `prefers-color-scheme` — landing on paper is intentional. (Revisitable, but this is the decision.)
4. **Over / near-threshold row treatment.** Was never concretely specified. Locked in §1.7.
5. **Answer inline vs. re-scope the statement.** Locked: a point-lookup renders an inline answer block; a slice query re-scopes the statement. The choice is driven by a backend `intent: 'point' | 'slice'` field on the query result — the UI never guesses. See §3 and §1.8.
6. **Where the always-visible allow-list lives (post-merge).** Locked: on the Statement, the **Measure segmented control + Grouping pill are the visible allow-list** — they enumerate exactly the metrics and dimensions the assistant may query. The expanded assistant mode adds an explicit Scope panel. No separate persistent scope rail on the compact Statement.
7. **Per-query cost ceiling vs. hourly throttle.** Locked (per the guardrail ADR): ship the **per-query $0.02 ceiling only**. The hourly query-count throttle is designed-not-built. UI consequence, locked: **no hourly meter, no "queries left this hour" banner** anywhere.
8. **Charts in a ledger.** Locked: exactly one **header sparkline** (Recharts, single-series period spend) beside the total, plus the budget rule. No per-row bars, no widget chart panels. Keeps Recharts in the stack without reverting to a dashboard.
9. **Assistant as route vs. surface.** Locked: not a route. It's the ask bar + answer log on the Statement, plus an expanded thread (a right Sheet ≥1024px, full-screen below). State persists across compact/expanded.

---

## 1. Foundation (build once, before any screen)

### 1.1 Design tokens — CSS custom properties

Define on `:root` (light) and `[data-theme="dark"]`. Tailwind config references these via `var(--…)`; no hardcoded hex in components, no JS theme object. One `data-theme` flip re-resolves everything in the browser.

**Light (default)**
```
--bg:#F7F4EC;  --surface:#FFFDF7;  --inset:#F0EBDD;
--border:#E2DCC9;  --border-strong:#D3CBB2;
--text:#221F16;  --text-muted:#7A7460;  --text-faint:#9A9481;
--accent:#2F5D3E;  --accent-ink:#234A30;  --accent-tint:rgba(47,93,62,.10);  --on-accent:#FFFDF7;
--ok:#3E7A45;
--warn:#A9791C;  --warn-ink:#7C5810;  --warn-tint:rgba(169,121,28,.12);
--danger:#A13A2E;  --danger-ink:#7E2C22;  --danger-tint:rgba(161,58,46,.10);
```

**Dark (accommodation)**
```
--bg:#12140F;  --surface:#1B1E16;  --inset:#171A12;
--border:#2C3024;  --border-strong:#3A3F2E;
--text:#EAE7DA;  --text-muted:#8B8873;  --text-faint:#6E6B58;
--accent:#4E8A62;  --accent-ink:#8FC49E;  --accent-tint:rgba(78,138,98,.15);  --on-accent:#0E1510;
--ok:#5FA868;
--warn:#D0A03A;  --warn-ink:#E0BE73;  --warn-tint:rgba(208,160,58,.15);
--danger:#E0645A;  --danger-ink:#F0A29B;  --danger-tint:rgba(224,100,90,.15);
```

Both accent and semantics **re-anchor** per theme (they are not lightness inversions), which is exactly why they live in CSS variables. Contrast: `--on-accent` on `--accent` and `--text` on `--bg`/`--surface` all meet WCAG AA.

**Categorical ramp** (only if a grouped multi-series viz is ever added; MVP is single-series): `#2F5D3E`, `#A9791C`, `#6B7280`, `#8C5A3B`. Not used in MVP.

### 1.2 Typography
- Display / statement total: Plex **Mono** 30px / line-height 1.1, weight 400, tabular.
- Page title: Plex Sans 20px / 1.4, weight 500.
- Card title: 15px / 1.4, weight 500.
- Body: 14px / 1.5, weight 400.
- Secondary: 12.5px.
- Eyebrow label: 11px, letter-spacing .05em, uppercase, `--text-faint`.
- Meta / micro: 11px.
- **Mono is mandatory** for every measured quantity: currency, counts, %, latency ms, IDs, API keys. Tabular lining figures; right-aligned and decimal-aligned in tables.

### 1.3 Spacing / radii / borders / elevation
- Spacing scale (4px base): 4 / 8 / 12 / 16 / 24 / 32 / 48. Workhorses: 12 and 16.
- Radii: sm 4 (chips, controls) · md 6 (inputs, buttons) · lg 8–10 (cards) · full (pills, meters, avatar). **Max 10.**
- Borders: 1px `--border` hairline; `--border-strong` for interactive/emphasis edges.
- Elevation: cards use **border, not shadow**. Shadow only on floating layers (menus, popovers, sheets): light `0 6px 20px rgba(0,0,0,.08)`, dark `0 6px 24px rgba(0,0,0,.5)`.
- Focus ring (global): `2px solid var(--accent)`, offset 2px.

### 1.4 Icons & components
- Icon set: **lucide-react** (sizes 14 / 16 / 18).
- Components: shadcn/ui (Radix primitives) — Button, Input, Select, Tabs, Sheet, Popover/DropdownMenu, Dialog, Skeleton. Styled to the tokens above.

### 1.5 App shell (top bar + routing)
- **Top bar** (surface bg, 1px bottom border), max-width 1000px inner: left cluster = wordmark + divider + **OrgSwitcher**; center = **Tabs** (Statement / Budgets / Settings); right = **ThemeToggle** + **Avatar**.
- Routes: `/` (Statement, default) · `/budgets` · `/settings`. Auth routes `/login`, `/signup` render **outside** the shell (no tabs, no org switcher).
- Theme: `next-themes`, default light, persisted, no system-auto (see §0.3).
- Data: a single `QueryClient` (TanStack Query) at the app root.

### 1.6 Multi-tenancy legibility (global, applies to every authenticated screen)
> **Schema note (ADR-0001):** role and org membership live on a `memberships(user_id, org_id, role)` join table, not a column on `users`. A single `users.org_id` would make the switch behavior below unreachable — the model has to support one user in more than one org before the switcher can be anything but decoration. MVP signup produces exactly one membership per user, so the switcher renders the current org name as text (below) without yet offering a second option — the interaction is deferred, not the schema.
- OrgSwitcher is always present in the top bar and always renders the **current org name as text** (not icon-only). It's a `button` with `aria-haspopup="menu"` / `aria-expanded`.
- `orgId` is read server-side from the JWT claim and injected into every query. It is never a client-controllable parameter and never appears in a URL.
- On **org switch**: refetch scoped data, **clear the transient query log**, reset the Budgets form to the new org's scopes/alerts, move focus to the primary heading, and announce via `aria-live="polite"` ("Now viewing Northwind Labs").
- The Statement's caption restates the org in the **content region** ("Acme Robotics — statement · July 2026") so tenancy is legible to a screen reader from the content, not only the chrome.

### 1.7 Threshold visual language (defined once, reused on Statement §2.2 and Budgets §2.4)
- **Budget rule fill** color by % of budget consumed: `<75%` → `--ok`; `75–<90%` → `--warn`; `≥90%` → `--danger`. The numeric % label is shown in the matching ink color **and** a word: "on track" / "near cap" / "over".
- **Over/near-threshold row** (a group row whose scope has an active alert it has reached): leading lucide `AlertTriangle` (14px, `--warn` near / `--danger` over) before the name; a mono pill next to the name reading e.g. `82% of $2,000 cap`; the subtotal figure in `--warn-ink` / `--danger-ink`; a subtle `--warn-tint` / `--danger-tint` wash on **that group row only**. Never wash alone — the icon + pill carry the meaning, and the row gets an `aria-label` stating status in words ("checkout-service, over budget alert, 118% of $2,000 cap"). MVP ships one alert, so at most one scope is ever marked.

### 1.8 Query-answer routing contract (drives §2 and §3)
The backend query result carries `intent: 'point' | 'slice'`.
- `point` (a scalar answer) → render an inline **AnswerBlock** in the log; statement unchanged.
- `slice` (a filtered/grouped set) → **re-scope the statement** to that filter, show a dismissible **ViewingFilterChip** above the statement header, and drop a one-line confirmation in the log. The UI switches on `intent`; it does not infer.

### 1.9 Accessibility floor (global)
WCAG AA contrast · visible keyboard focus on every interactive element · `prefers-reduced-motion` honored (no shimmer/parallax; swap to static/opacity) · status conveyed by icon + label, never color alone · full keyboard operability · `aria-live` on dynamic regions (answers, budget preview, org-switch announce).

---

## 2. Screen specifications

### 2.1 Screen A — Login / Signup
**Route:** `/login`, `/signup` (outside shell).
**Components:** SplitLayout (BrandPanel + AuthCard) · mode toggle (login/signup) · Input ×2–3 (email, password, and org-name on signup) · password show/hide IconButton · primary Button · text-link mode switch · inline field-error · form-level error banner.
**Layout hierarchy:**
- Page — 2-col grid ≥900px, stacked below.
  - BrandPanel (left, `--inset`): wordmark; lede "A clear, defensible account of what your models cost."; static ledger motif (mini three-line statement + total); footer "Hand-rolled JWT · org-scoped at the query layer."
  - AuthCard (right, centered, max 340px): title; sub; **[org-name field — signup only]** with helper "This creates your organization — your data is scoped to it."; email; password (+ show/hide); primary button ("Log in" / "Create organization"); mode-switch link.
- No "remember me." Token issuance (access + httpOnly refresh) is server-side and invisible to the UI.
**States:** idle · submitting (button spinner + disabled) · field errors (email format, required) · auth error banner ("Email or password is incorrect." — interface voice, not apologetic) · signup "That organization name is taken."
**Responsive:** ≥900px split · <900px single column (brand collapses to wordmark + lede above the card) · <640px hide the ledger motif.
**A11y:** labels tied to inputs; field errors via `aria-describedby`; form-level banner `role="alert"`; password toggle `aria-pressed`; on failed submit move focus to the first error; Enter submits; errors carry icon + text (color-independent).

### 2.2 Screen B — Usage view = The Statement (core, landing)
**Route:** `/` (default authenticated landing).
**Components:** AppShell · **AskBar** (input + live cost estimate + send) · ScopeHint line (+ example link) · **AnswerLog** (AnswerBlock / OutOfScopeCard / CostCapCard, ≤4, newest on top) · **Controls** (MeasureSegmented · PeriodPill · GroupingPill) · ViewingFilterChip (only when re-scoped) · **StatementHeader** (caption · total hero · HeaderSparkline · BudgetRule) · **StatementTable** (group rows + item rows + total row) with over-threshold markers per §1.7.
**Layout hierarchy:**
- AppShell top bar.
- Main (max-width 1000px, centered):
  1. AskBar
  2. ScopeHint (`Read-only · answers are drawn from this account's statement below` + one example link)
  3. AnswerLog
  4. Controls  [+ ViewingFilterChip when filtered]
  5. StatementHeader — left: caption + 30px mono total + sparkline; right: BudgetRule (**Spend measure only**)
  6. StatementTable — columns: `Line item | Requests | p95 ms | Err % | Spend`
- **Measure toggle** (Spend / Latency / Requests / Errors): emphasizes that column (text weight 500 + `--accent` for Spend, `--text` emphasis for others) and swaps the hero figure; **budget rule shows only for Spend** (budget is a spend concept). **Grouping pill:** by project (default) / team / model. **Period pill:** time window.
**States:** loading (skeleton rows; reduced-motion → static muted rows) · empty (new org: "No usage recorded yet. Once your services send events, your statement builds here." + one ghost example line; ask bar still present, answers return "no data yet") · error (inline block, interface voice, Retry) · over-threshold (group-row marking per §1.7).
**Responsive:** ≥1024 full 5 columns · 640–1024 hide `Err %` · <640 collapse to `Line item + active-measure column`, group rows become disclosures that expand to a stacked mini-list of the other metrics; tabs move to a full-width segmented row under the top bar; org switcher stays in the top bar (icon + truncated name); cost estimate hidden <400.
**A11y (screen-specific):**
- **Tenant/org legibility:** current org always as text in the top bar; caption restates org in content; org switch announced via `aria-live` with focus moved to the statement heading (§1.6).
- **Guardrail legibility:** the **Measure control + Grouping pill are the visible allow-list**; ScopeHint states read-only; each AnswerBlock carries the `mapped:` tag and `cost / cap` tag (§2.3).
- Statement uses a real `<table>`; `<th scope="col">`; group rows labeled; total row labeled; emphasized column conveyed by weight + text, not color alone; over-threshold rows carry a status `aria-label`. Measure control = radiogroup with arrow-key navigation.

### 2.3 Screen C — NL-query assistant (surface + expanded thread)
**Routing (locked):** not a route. (1) AskBar + AnswerLog embedded on the Statement; (2) **ExpandedThread** opened from an expand control on the ask bar — a right **Sheet** (~420px) ≥1024px, full-screen overlay below. State persists across compact/expanded.
**Components:** AskBar (shared) · AnswerBlock · **OutOfScopeCard** · **CostCapCard** · MappedTag · CostTag · **ScopePanel** (expanded only) · ThreadHistory · ExpandToggle · RephraseChip.
**Layout hierarchy (expanded, desktop Sheet):**
- Sheet (right): Header ("Ask about your usage" + close) → **ScopePanel** (metric chips: Spend / Latency / Requests / Errors; grouped-by chips: team / project / model / time; "Read-only · allow-listed") → ThreadHistory (Q bubbles + AnswerBlock / OutOfScopeCard / CostCapCard, scrollable) → AskBar pinned at bottom.
**Guardrail legibility (locked, per ADR — implement exactly):**
- **Scope always visible:** compact mode via Measure + Grouping controls + ScopeHint; expanded mode via ScopePanel.
- **Per-query cost ceiling:** live `≈ $0.00X` estimate on the input (client-side, UX only); every answer shows `query cost $0.00X / $0.02 cap` (mono, muted); on trigger, a **CostCapCard** (`--danger-tint`) — "Query paused — over the per-query cost cap" + narrow-scope affordance. Enforcement is server-side. **No hourly meter, no "queries left" banner.**
- **Mapped-to tag:** every answer shows `mapped: <function · dims · window>` (`--accent-tint` chip).
- **Out-of-scope:** **OutOfScopeCard** (`--warn-tint`, `AlertTriangle`, distinct from an error) — plain reason + 2–3 clickable RephraseChips derived from intent. This is a `status`, not an `alert`.
**States:** idle · thinking (inline dots; reduced-motion → "Working…") · answered · out-of-scope · cost-cap-blocked · backend error (distinct: "Couldn't reach the query service. Retry." — `role="alert"`).
**Responsive:** expanded = right Sheet ≥1024, full-screen below. Compact ask bar always on the Statement.
**A11y (screen-specific):** ask input labeled; AnswerLog is `aria-live="polite"`; mapped/cost tags are readable **text**, not decorative; OutOfScopeCard and CostCapCard use `role="status"` (expected outcomes) while backend error uses `role="alert"`; RephraseChips are buttons with descriptive labels; the Sheet traps focus, Esc closes, focus returns to the ExpandToggle; scroll region is keyboard-scrollable.

### 2.4 Screen D — Budget alert setup
**Route:** `/budgets`.
**Components:** Grid2 (AlertForm card + ActiveAlerts card) · Select (scope) · ThresholdInput + TypeSegmented (`$` / `% of budget`) · Select (channel — email, single) · **PreviewSentence** (live) · **SitsIndicator** (current scoped spend vs. threshold) · primary Button (Create alert) · AlertItem rows (text + Remove) · empty state.
**Layout hierarchy:**
- Main → Grid2 (stacks <720):
  - Card "New budget alert": scope Select; Threshold (Input + TypeSegmented); Notify Select; PreviewSentence; SitsIndicator; Create button.
  - Card "Active alerts": AlertItem list or empty state ("No alerts yet. Create one on the left.").
**Behavior (locked):** PreviewSentence updates live ("Alert pk@acme.dev when checkout-service spend crosses $2,000.00 in a calendar month."). SitsIndicator states whether current scoped spend is already above/below, using the **§1.7 threshold language** (icon + word + ink color). `%` mode computes against the scope's budget. **Single trigger path** — no severity, no multi-channel, no matrix. Create appends; Remove deletes.
**States:** idle · invalid amount (non-numeric → inline hint) · empty active list · saved (item appears + brief `aria-live` announce) · over-threshold-on-create (SitsIndicator + AlertItem show the "over" state, consistent with the Statement's row marking — this is the connective tissue between the two screens).
**Responsive:** two-column ≥720 · stacked <720 (form first) · inputs full-width on mobile; TypeSegmented stays inline.
**A11y:** labels tied; PreviewSentence in an `aria-live="polite"` region so the rule is heard as inputs change; SitsIndicator status via text + icon; Remove buttons `aria-label` naming the alert; amount `inputmode="decimal"`; TypeSegmented is a radiogroup.
**Tenant note:** the scope Select names the current org; alerts are org-scoped; switching org resets the form and the active-alerts list to that org.

---

## 3. Build order (with reasoning)

**Foundation (0) → Login/Signup (1) → Statement/Usage (2) → Budget alert (3) → NL-query assistant (4).**

- **0 · Foundation.** Tokens (both themes), type, spacing/radii, app shell, routing, `next-themes`, TanStack `QueryClient`, shadcn + lucide + Plex via `next/font`. Nothing renders correctly until these exist; pure setup, no backend.
- **1 · Login/Signup — proves the foundation most simply.** The lowest-integration screen (one auth endpoint pair) that still exercises tokens, type, the primary button, inputs, validation, the split layout, and the **auth boundary** (JWT issue + httpOnly refresh) that everything else sits behind. Also proves signup-creates-tenant. If the tokens and forms look right here, they look right everywhere.
- **2 · Statement/Usage — the core object and the shell in anger.** Top bar, org switcher, tabs, theme toggle, the statement table, the controls that double as the visible allow-list, header sparkline, budget rule, loading/empty/error states, and the tenant-legibility patterns. Depends on a **read-only usage aggregation endpoint** (the allow-listed query functions' data layer) but **not** the LLM. Must precede the assistant because the assistant renders *into* this surface (inline blocks + re-scope) and calls the *same* data functions that back it. Build the compact ask bar here as visual-only (stubbed responses) so the surface is complete; wire the real backend in step 4.
- **3 · Budget alert — small, self-contained, defines shared threshold language.** Depends on a budgets CRUD endpoint plus the scoped-spend read already built in step 2. Introduces the **§1.7 over/near/on-track visual language** once, so the Statement's over-threshold rows reuse it rather than inventing a parallel treatment. Low integration; reinforces tenancy (org-scoped alerts).
- **4 · NL-query assistant — most integration-heavy, correctly last despite being the differentiator.** Depends on the backend **allow-list Zod schema + function-calling**, the **per-query cost-ceiling enforcement** (real token accounting), and the **`intent` contract** (§1.8) that drives inline-vs-rescope — and it renders into the Statement (step 2) and reuses the threshold tokens (steps 2–3). Building it last means every surface it touches is already stable; you integrate the LLM against a known-good data + UI substrate instead of co-developing both. The guardrail UX (ScopePanel, mapped tag, cost tag, CostCapCard, OutOfScopeCard) is the last thing built and the thing protected from any time-pressure cuts — matching `const.md`: the differentiator ships on a proven foundation, not first.

---

## 4. Locked / Explicitly deferred

### Locked
- **Structure:** top tab bar (Statement · Budgets · Settings), no left sidebar. Assistant is a surface on the Statement + expanded Sheet — not a route.
- **Landing:** Statement at `/`; query-first affordance, ledger resting state.
- **Palette:** Ledger. Light = default (brand call, not system-auto); dark = accommodation. Full token sets for both, both re-anchored (§1.1).
- **Green usage rule:** `--accent` (forest) only for interactive chrome; `--ok` (green) only inside status readouts; never adjacent; status always icon + label.
- **Type:** IBM Plex Sans (UI) + IBM Plex Mono (all measured quantities, tabular), self-hosted via `next/font`.
- **Statement columns:** `Line item | Requests | p95 ms | Err % | Spend`; measure toggle emphasizes one column + swaps the hero; budget rule is Spend-only.
- **Charts:** one header sparkline (Recharts, single-series period spend) + budget rule. No per-row bars, no widget chart panels.
- **Threshold visual (§1.7):** budget-rule fill `<75%` ok / `75–90%` warn / `≥90%` danger; over-threshold group row = AlertTriangle + `N% of $X cap` mono pill + subtotal in warn/danger ink + tint wash on that row only + status `aria-label`. Same language reused in Budgets.
- **Answer routing (§1.8):** point → inline AnswerBlock; slice → re-scope statement + ViewingFilterChip; decided by backend `intent`.
- **Scope-always-visible:** Measure control + Grouping pill = the visible allow-list on the Statement; explicit ScopePanel in expanded assistant mode. No separate persistent scope rail on the compact Statement.
- **Cost guardrail:** per-query **$0.02** ceiling only. Ask-bar estimate (client, UX); per-answer `cost / cap` tag; CostCapCard on trigger (server-enforced). `mapped:` tag on every answer. Out-of-scope = warn-tint card + rephrase chips, `role="status"`.
- **Hourly throttle UI:** **not built** — no meter, no "queries left" banner.
- **Auth:** hand-rolled JWT (access + httpOnly refresh); signup creates the org/tenant (org-name field, helper text); no "remember me"; token handling server-side, invisible to UI.
- **Multi-tenancy legibility:** persistent OrgSwitcher with text name; statement caption restates org; org switch clears the query log, refetches, resets Budgets, announces via `aria-live`, moves focus to heading; alerts + scopes org-scoped; `orgId` from JWT, never in URL.
- **Stack:** Next.js (App Router) · Tailwind reads `var(--token)` · shadcn/ui (Radix) · lucide-react · Recharts · TanStack Query · Zod (allow-list = API DTO) · `next/font` Plex · Vercel + Lambda.
- **Detail tokens:** radii max 10; focus ring 2px `--accent` offset 2px; cards use border (shadow only on menus/popovers/sheets); theme persisted via `next-themes`.
- **A11y floor:** WCAG AA contrast; visible focus; reduced-motion honored; status via icon + label; full keyboard operability; `aria-live` on answers, budget preview, and org-switch.

### Explicitly deferred (documented, not built — legitimate interview answers)
- **Hourly query-count throttle** — designed-not-built (guardrail ADR). It's a volume control; the per-query ceiling already covers cost. Add at production scale.
- **Spend-anomaly detection** — out of MVP.
- **Multi-provider price normalization** — out of MVP.
- **Full alerting matrix** (multi-channel, severity tiers, multiple triggers) — MVP is a single email trigger.
- **Settings screen** — intentionally a chrome-only stub (org name, plan, members, masked API key, auth summary), not specced further and not built out. This is a deliberate scoping call per `portfolio-plan.md`, not an oversight; the tab exists only so it doesn't dead-end, and the three MVP surfaces remain the Statement, the assistant, and Budgets.
- **Team/project management UI** beyond the Settings stub — out of MVP for the same reason.
- **Compositional / multi-step NL queries** — raise round-trips and the cap; deferred.
- **Query-result caching** — deferred.
- **Categorical multi-series charts** — only if a grouped viz is added later; MVP is single-series.

> Ambiguity check: if a build question isn't answered by a "Locked" line above, it belongs in "Deferred" — nothing should require invention during the build.
