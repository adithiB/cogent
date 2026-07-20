# Schedule v2 — Jul 9 to Aug 5, 2026

Replaces `day-by-day-schedule.md`. Companion to `const.md`, `portfolio-plan.md`, `prompting-guide.md`, and the two UI specs.

**What changed and why.** Day numbers are gone. They decoupled from the calendar the moment you started rolling tasks forward, and "I'm on Day 6" stopped being a progress measure. The calendar is the only fixed thing: Aug 3 is your last day at Samsung, and your build capacity from today is roughly **95–105 focused hours** (≈2.5h × 18 weekdays, ≈6.5h × 8 weekend days). The old plan was scoped at 3–4× that. This one is scoped to fit, which means the cuts in §1 are **applied, not deferred**. They are not contingency. They have already happened.

The other change: the old schedule contained no day on which the React remote gets federated into the Angular host — the single claim the word *polyglot* rests on. That work now leads.

**Capacity legend:** 🟡 weekday, employed (~2.5h) · 🟢 weekend (~6.5h) · 🔵 post-employment (docs only)

---

## 0. Three milestones. Measure against these, nothing else.

| Date | Milestone | Definition of done |
|---|---|---|
| **Sun Jul 19** | Atlas demoable | A stranger can open a public URL, log in, see three remotes load — one of them React — and nothing 404s on hard refresh. |
| **Fri Jul 31** | Cogent-AI core working | NL-query answers a real question end-to-end against live usage data, and you have watched the $0.02 cost cap actually trigger. |
| **Mon Aug 3** | Site live | Both case studies published, ADR index linked, résumé downloadable. |

If a milestone is going to slip, cut from §1's "first to go" list the same evening. Do not absorb slippage silently — that is how four days disappeared without anyone recording it.

---

## 1. Cuts — applied

These are removed from the build. Each gets a short ADR instead. Per `const.md`, "designed, not built" is a legitimate interview answer; a rushed implementation is not.

| Cut | Replaced by | Reclaims |
|---|---|---|
| Cognito | Dev IdP stub + ADR. The interesting part is **role-gated remote loading**, which needs no real IdP. | ~1 day |
| kind + Helm + ArgoCD | ADR: "why I didn't run a cluster for a portfolio demo." Keep Docker Compose. | ~1.5 days |
| Design system: 8 components → 6 | Button, Card, Badge, StatusDot, Skeleton, Icon. Drop MetricTile, Select/SearchInput wrappers — use native. | ~0.5 day |
| `CommandPalette` | ADR (already flagged deferrable in the spec). | ~0.5 day |
| `<768px` mobile polish | Desktop-first, as the spec already permits. | ~1 day |
| DynamoDB | **Conditional — see the test below.** | ~1.5 days |
| Portfolio chat widget | **Conditional — see §5.** | ~1 day |

**The DynamoDB test.** Right now, without notes: state your partition key, and say what happens when one tenant is 90% of writes. If you can't, cut DynamoDB. Ship Postgres with a partitioned events table and an ADR titled *"Why I did not reach for DynamoDB at this scale."* Choosing not to add a database is a stronger judgment signal than adding one, and `const.md` already tells you this: *don't reach for cloud services unless they meaningfully improve the project or the story.*

**First to go if a milestone is at risk,** in this order: Cogent's expanded assistant Sheet (compact ask bar is enough) → Budgets screen → dark theme on Cogent → Atlas Platform Health polish. **Never** the NL-query assistant, the cost cap, or the cross-boundary a11y infrastructure.

---

## 2. Atlas — Integration Block (Jul 9–13)

This block did not exist in the old plan. Everything Atlas claims is downstream of it. Nothing else starts until it closes.

| Date | Cap | Task | Model |
|---|---|---|---|
| **Thu Jul 9** | 🟡 | **Drift experiment.** Two worktrees, genuinely different installed Angular versions, `remote-monitoring` built and served from its own `node_modules`. Probe: does an `InjectionToken` survive `instanceof` across copies? Two `NgZone`s? Is `zone.js` patching globals twice? **Hard stop at 2h** — if inconclusive, the ADR says "predicted from source, not empirically verified" and you move on. | Sonnet, extended thinking |
| **Fri Jul 10** | 🟡 | **ADR-001: federation strategy.** Native Federation for Angular↔Angular (real singleton sharing); plain ESM `mount()` for the React boundary (nothing to share, so federation would buy only coupling). Include the corrected `strictVersion` finding — *the range fields are schema-only and never read at runtime* — marked verified or predicted. **Then write the mount contract type signature.** Not the implementation. The type. | **Opus (ADR) → Sonnet** |
| **Sat Jul 11** | 🟢 | **Wire `remote-admin`.** `mount(container, hostServices): Promise<{ unmount(), focusEntry }>`. Teardown via a thin Angular wrapper's `ngOnDestroy` — **not** `router-outlet (deactivate)`, which never fires for the embedded `AiDeploySummary`. Mount/unmount **20 cycles**, then count detached DOM nodes and listeners. `createRoot` leaks silently, exactly like `strictVersion` did. | Sonnet |
| **Sun Jul 12** | 🟢 | **Runtime-fetched module registry.** Schema `{ name, type: 'federation' \| 'esm', entryUrl, version, integrity }`, served as a static asset, not baked into the bundle. Origin allow-list + SRI. This is what makes "zero-redeploy module registration" true. **Then: the CI compatibility gate** — read each remote's emitted `remoteEntry.json`, extract the *resolved* `version`, fail the pipeline on incompatible drift. ~50 lines. This is what makes the version-pinning résumé bullet true. | **Opus (registry security) → Sonnet** |
| **Mon Jul 13** | 🟡 | **`useAnnounce()` + `FocusManager` across the React boundary.** By now nearly free: `hostServices` passed at mount, wrapped in React context; `focusEntry` returns the `data-remote-heading` node. §0.3's contract, satisfied by a function signature. Atlas's best idea, finally tested where it matters. | Sonnet |

**Gate:** production builds, three separate static origins, navigate to Team Admin, back, and again. One Angular instance. One React root. If this fails on Jul 13, stop and reassess scope — do not proceed to Jul 14.

---

## 3. Atlas — to demoable (Jul 14–20)

| Date | Cap | Task | Model |
|---|---|---|---|
| **Tue Jul 14** | 🟡 | Design system: `tokens.css` + the 6 components, Angular + React wrappers. Timeboxed — this is nice-to-have tier, say so out loud when you shortcut. | Sonnet |
| **Wed Jul 15** | 🟡 | NestJS core: dev-IdP auth stub, module-registry endpoint (it serves the §2 manifest — one source of truth), metrics endpoint. Postgres schema: users, roles, modules, deploy_history. | Sonnet |
| **Thu Jul 16** | 🟡 | **Role-gated remote loading.** Deciding at runtime which federated bundle a user is even permitted to *fetch*. This is the micro-frontend security story nobody else has. + **ADR-002: Cognito, designed not built.** | **Opus (plan) → Sonnet** |
| **Fri Jul 17** | 🟡 | Resource Monitoring: real local metrics, ECharts computed-style theme bridge + `MutationObserver`, `sr-only` per-series summaries (MVP, not the table toggle). | Sonnet |
| **Sat Jul 18** | 🟢 | Team Admin content: semantic `<table>`, sortable `aria-sort` headers, Radix slide-over, `useAnnounce("{n} teams")` after filter. Then the **AI-assistant remote**: one endpoint, one component, embedded per card. Keep it small — its value is architectural (a remote with no page of its own), and `StatusDot` is never driven by its text. | Sonnet |
| **Sun Jul 19** | 🟢 | Platform Health. Per-remote error boundaries (A.3). SPA-fallback rewrite. Docker Compose. **Deploy to a public URL.** ← **MILESTONE** | Sonnet |
| **Mon Jul 20** | 🟡 | Atlas closeout: README (architecture diagram, "why/when not micro-frontends"), demo GIF, ADR index. Publish `atlas-ui-implementation-spec.md` alongside it. **Interview rep #1** (§6). | **Opus for the review pass** |

---

## 4. Cogent-AI (Jul 21–31)

**A contradiction in your own documents, resolved.** `portfolio-plan.md` says the NL-query is *"not last."* `cogent-ui-implementation-spec.md` §3 says it is *"correctly last."* Both are right about different halves. The **UI** must render into a stable Statement — build it last. The **risk** must be retired early — build the backend before Budgets. So the feature is split across Jul 25 and Jul 29–30.

| Date | Cap | Task | Model |
|---|---|---|---|
| **Tue Jul 21** | 🟡 | Foundation: both token themes, app shell, top tabs, routing, `next-themes`, TanStack `QueryClient`, Plex via `next/font`. Mechanical — good use of a low-energy weekday. | Sonnet |
| **Wed Jul 22** | 🟡 | Login/Signup + **hand-rolled JWT** (access + httpOnly refresh). Signup creates the org. Explain the Cognito contrast with Atlas before coding — that contrast is now an ADR-to-ADR comparison, which is cleaner than two half-built auth systems. | **Opus (plan) → Sonnet** |
| **Thu Jul 23** | 🟡 | Org-scoped RBAC enforced **at the query layer**. Postgres schema. Run the DynamoDB test (§1) and commit to the answer today. | **Opus (plan) → Sonnet** |
| **Fri Jul 24** | 🟡 | Ingestion endpoint + the read-only usage-aggregation layer — i.e. the allow-listed query functions' data layer. ADR for the Lambda/queue design you're not building. | Sonnet |
| **Sat Jul 25** | 🟢 | **NL-query backend.** Zod allow-list schema (= the API DTO), LLM function-calling against it, server-side token accounting, per-query $0.02 ceiling, the `intent: 'point' \| 'slice'` contract. The single highest-value day on this calendar. Do not let it slide. | **Opus (design) → Sonnet, extended thinking** |
| **Sun Jul 26** | 🟢 | Statement screen: table, Measure/Grouping controls (they *are* the visible allow-list), header sparkline, budget rule, loading/empty/error, org legibility per §1.6. | Sonnet |
| **Mon Jul 27** | 🟡 | Threshold visual language §1.7, applied once, reused twice. **Interview rep #2.** | Sonnet |
| **Tue Jul 28** | 🟡 | Budgets screen. Single trigger path. First to be cut if Jul 25–26 overran. | Sonnet |
| **Wed Jul 29** | 🟡 | NL-query UI: AskBar, AnswerLog, `mapped:` tag, cost tag, `CostCapCard`, `OutOfScopeCard` (`role="status"`, not `alert`). | Sonnet |
| **Thu Jul 30** | 🟡 | Expanded thread (cut first if needed) + **watch the cost cap actually trigger**. Not "the code path exists." Watch it fire. **Interview rep #3.** | Sonnet |
| **Fri Jul 31** | 🟡 | Deploy (Vercel). README: "why two databases" — or "why one." ← **MILESTONE** | **Opus for the review pass** |

**No buffer exists in this phase.** That is deliberate and it is the plan's biggest weakness. If Jul 25 slips, Budgets dies. If it slips two days, the expanded Sheet and dark mode die too. Decide that in the moment, in writing, not by drifting.

---

## 5. Portfolio site (Aug 1–3)

| Date | Cap | Task |
|---|---|---|
| **Sat Aug 1** | 🟢 | Scaffold, home (work-rights callout in the first screenful), both case studies. Link the two UI spec documents and the ADR index directly — **they may be more differentiating than the repos they describe.** Almost no 2-YOE candidate can produce a document that closes its own open questions with reasoning. |
| **Sun Aug 2** | 🟢 | Skills section by demand category. Deploy. **The chat widget only if you build the defenses:** strict output schema, refusal outside the corpus, per-IP rate limit, every query logged. Otherwise ship a curated Q&A and an ADR explaining why — *"I didn't put an unguarded LLM on my own résumé"* is a better answer than the widget. |
| **Mon Aug 3** | 🟡 | Last day at Samsung. **Buffer. Nothing new starts.** |

---

## 6. Interview readiness — runs from Jul 20, not Aug 5

The old plan put all interview prep on its final day. That is backwards. Recruiter reporting from Sydney this year says the same job attracts plenty of applicants while only a handful are actually interview-ready, and technical screens have gone back to drilling fundamentals — data structures, system design, cloud-native architecture, observability, security. Meanwhile permanent-role decisions take longer than they used to. **Your network's introductions will land while you are still building.** Being sharp in week three beats being finished in week five.

**Three evenings a week from Jul 20, 45 minutes, non-negotiable.** Rotate:

1. **DSA / fundamentals.** Unglamorous. Screens still test it.
2. **System design out loud.** Start with your own two systems, then unfamiliar ones.
3. **Record yourself explaining Atlas for 20 unscripted minutes. Then watch it.** This is the actual success criterion in `const.md`. That tape will tell you whether the portfolio is working more reliably than any commit graph.

Rule: **if you cannot explain a feature on tape, it is not done**, regardless of whether it's merged.

---

## 7. Aug 4–5 🔵 — documentation only

| Date | Task |
|---|---|
| **Tue Aug 4** | Full README/ADR audit across all repos. Draft résumé + cover letter against real artifacts (claude.ai chat, not Claude Code). |
| **Wed Aug 5** | LinkedIn headline/About. Run the interview quiz from `portfolio-plan.md` for both projects. |

**Renew Claude Pro.** Reorganising a 30-day engineering schedule around a $20 billing date is the tail wagging the dog. And if you hit the weekly cap twice with real work waiting, one month of Max is cheaper than a slipped milestone.

---

## 8. Usage strategy

Pro gives you a rolling 5-hour session window **plus** a weekly cap, and usage pools across claude.ai, Claude Code, and Desktop — one budget, not several. Claude Code is an agent: a single instruction fans out into dozens of file reads, edits, and tool calls. You have ~97 hours of build planned across 26 consecutive days. **You will hit the weekly cap, and it will happen mid-feature.**

- **One scoped task per session.** Clear between tasks. This is the whole game on Pro.
- **Sonnet by default.** Opus only on the days marked above: ADR-001, the registry security model, role-gated loading, JWT design, the NL-query allow-list, and the two review passes. Six moments in four weeks.
- **Extended thinking** on for the drift experiment and the NL-query design. Off otherwise.
- **Don't roll straight into the next task** when one finishes early. That's how you arrive at the hard task with an exhausted session window. Instead: write the ADR while it's warm, record the hours you banked in a file, and deploy whatever exists.
- Verify no `ANTHROPIC_API_KEY` is set — Claude Code will silently bill the API instead of your plan.

---

## 9. LinkedIn — tie every post to something that actually happened

Two to three a week, 15–20 minutes each. Your best material is already written:

- **"`strictVersion` doesn't do what you think."** You read `@softarc/native-federation-runtime`'s resolution code and found the dedup key is built from the resolved `version`, never the declared range — no semver comparison exists at runtime. Then you moved the gate into CI. Post this. Nobody else has it, because nobody else read the source.
- Federation for Angular↔Angular, plain ESM for the React boundary — *different problems, different tools*.
- A runtime module registry trades deployment independence for a code-execution surface. Here's the constraint.
- Cost-capping an AI feature inside a cost-monitoring product. The second-order-effects story.
- Why I didn't put an unguarded LLM on my own résumé site.
- Launch post, Aug 3.

Spend at least as long commenting thoughtfully on AU engineers' and hiring managers' posts as writing your own.

---

## 10. Trip-wires

Check these on the date. If the condition is true, take the action — that evening, not "soon."

| Date | If… | Then |
|---|---|---|
| Jul 9, +2h | Drift experiment inconclusive | Write "predicted, not verified" in ADR-001. Move on. |
| **Jul 13** | React remote does not mount, unmount, and remount cleanly in a production build | **Stop.** Do not start Jul 14. Reassess whether Atlas ships at all, or ships as an Angular-only platform with an honest ADR. |
| Jul 19 | No public URL | Cut Platform Health polish and the AI-summary remote. Deploy what exists, ugly. |
| Jul 23 | Can't state your partition key cold | Cut DynamoDB. Write the ADR. |
| Jul 25 EOD | NL-query backend not answering a hardcoded question | Cut Budgets. |
| Jul 27 | Two milestones behind | Cogent ships as Statement + NL-query only. Nothing else. |
| Aug 1 | Cogent not deployed | Site links a demo video instead of a live URL. Ship the site anyway. |
| Any week | Weekly usage cap hit twice with work waiting | Upgrade to Max for one month. |

---

## What this plan is optimising for

Not surface area. In one hour of adversarial testing you produced a better interview answer than five days of building did: *I discovered my version-pinning safety net silently no-ops, that my monorepo structure made the failure impossible to reproduce, and here's the ADR and the CI gate I wrote instead.*

Twenty-five days remain. Spend them generating more of **that**.
