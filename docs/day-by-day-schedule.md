# Day-by-Day Schedule — Jul 5 to Aug 5, 2026 (30 Complex-Build Days + 2 Docs Days)

Companion to `const.md`, `portfolio-plan.md`, `prompting-guide.md`. **Rebuilt to fit the Claude Pro subscription window:** all code-heavy work is compressed into 30 days (Jul 5 – Aug 3), leaving Aug 4-5 for documentation, resume, and LinkedIn work only — no new complex builds after Day 30, since that's the safer side of the Pro plan ending Aug 5.

**This is tighter than the original 40-day version.** Atlas drops from 15 to 12 days, Cogent-AI from 14 to 11 — done by merging some adjacent small steps into single-day sessions (marked below). If a day runs long, cut from CI polish, dashboard styling, or a11y/contract-test items first — never from the AI-assistant remote or the NL-query assistant. Those two are still the actual differentiators and are the last things to compress.

**Capacity legend:** 🟡 Weekday, employed · 🟢 Weekend, employed · 🔵 Post-employment (Aug 4 onward) — docs only, no complex builds

---

## Model Guide (read this once, refer back as needed)

Usage is one shared pool across chat and Claude Code — spend the heavier model deliberately, not by default.

- **Sonnet** — default for almost everything: implementation, routine coding, styling, CI config, tests. Use it unless a day is flagged otherwise below.
- **Opus** — reserve for the specific days marked "Opus (plan) → Sonnet (build)": these are the moments with a real architectural decision behind them (Module Federation config, the AI-assistant remote, hand-rolled auth vs. Cognito, the two-database split, the NL-query cost-cap design, final code reviews). Use Opus just for the planning/explanation portion of that day's prompt, then switch to Sonnet (`/model sonnet`) for the actual implementation.
- **Extended thinking** — turn on for the NL-query implementation day and any debugging session that isn't resolving quickly; leave off for routine builds.

---

## Days 1-13 — Setup + Atlas MVP

| Day | Date | Cap | Task | Model |
|---|---|---|---|---|
| 1 | Sun Jul 5 | 🟢 | Scaffold **both** repos in one session: Nx monorepo for Atlas (shell, remote-monitoring, remote-admin, api, design-system), Turborepo for Cogent-AI (web, api, ui, sdk). CI skeletons for both. Provision Neon Postgres + AWS free tier. Commit `CLAUDE.md` + `/docs` to both. | Sonnet |
| 2 | Mon Jul 6 | 🟡 | Angular host app + Module Federation config, versioned shared singleton deps. | **Opus (plan) → Sonnet (build)** |
| 3 | Tue Jul 7 | 🟡 | Host: dynamic remote loading + route-guard stubs. | Sonnet |
| 4 | Wed Jul 8 | 🟡 | Resource Monitoring remote (Angular) — mock metrics, then wire to real local kind cluster metrics same day. | Sonnet |
| 5 | Thu Jul 9 | 🟡 | Team Admin remote (React/Vite) — scaffold + core admin UI, same day. | Sonnet |
| 6 | Fri Jul 10 | 🟡 | Shared design-system package (tokens + Angular/React wrappers). | Sonnet |
| 7 | Sat Jul 11 | 🟢 | NestJS backend core: auth module, module registry, metrics endpoint. | Sonnet |
| 8 | Sun Jul 12 | 🟢 | Postgres schema (users/roles/modules/deploy_history) + Cognito auth integration + route guards wired to roles, same day. | Sonnet |
| 9 | Mon Jul 13 | 🟡 | AI-assistant remote — federated module, LLM call summarizing deploy commit logs. | **Opus (plan) → Sonnet (build)** |
| 10 | Tue Jul 14 | 🟡 | Platform Health page (version/build hash/last-deploy). | Sonnet |
| 11 | Wed Jul 15 | 🟡 | Per-module CI/CD pipelines + integration smoke-test pipeline. | Sonnet |
| 12 | Thu Jul 16 | 🟡 | kind cluster + Helm chart + ArgoCD "app of apps" manifests. | Sonnet |
| 13 | Fri Jul 17 | 🟡 | Demo video, Atlas README (architecture diagram, deploy-independence story, "why/when not micro-frontends"), end-of-phase review. | **Sonnet, or Opus for the review pass** |

---

## Days 14-24 — Cogent-AI MVP

| Day | Date | Cap | Task | Model |
|---|---|---|---|---|
| 14 | Sat Jul 18 | 🟢 | Hand-rolled JWT auth + org-scoped RBAC at the query layer, same day. Explain the Cognito-vs-hand-rolled contrast with Atlas before coding. | **Opus (plan) → Sonnet (build)** |
| 15 | Sun Jul 19 | 🟢 | Ingestion Lambda (direct DynamoDB write) + Postgres/DynamoDB schema, same day. Explain the two-database split before implementing. | **Opus (plan) → Sonnet (build)** |
| 16 | Mon Jul 20 | 🟡 | Dashboard scaffold (Next.js/Tailwind/TanStack Query) + usage-by-team/project/model charts, same day. | Sonnet |
| 17 | Tue Jul 21 | 🟡 | Dashboard polish — loading/empty states, responsive layout. Keep light, this is nice-to-have tier. | Sonnet |
| 18 | Wed Jul 22 | 🟡 | NL-query assistant — design the allow-listed query schema and hard cost cap. This is the centerpiece; don't rush the design. | **Opus** |
| 19 | Thu Jul 23 | 🟡 | NL-query assistant — implement LLM function-calling against the schema. | **Sonnet, extended thinking on** |
| 20 | Fri Jul 24 | 🟡 | NL-query assistant — chat UI + end-to-end wiring, verify the cost cap actually triggers. | Sonnet |
| 21 | Sat Jul 25 | 🟢 | Budget-threshold alert (single path) + unit tests on auth/RBAC/cost-cap logic, same day. | Sonnet |
| 22 | Sun Jul 26 | 🟢 | Deploy (Vercel + Lambda). If this threatens to eat the day, stop and write the ADR documenting the intended deploy instead. | Sonnet |
| 23 | Mon Jul 27 | 🟡 | Buffer / catch-up day for anything from Days 14-22 that slipped. | Sonnet |
| 24 | Tue Jul 28 | 🟡 | Cogent-AI README ("why two databases," demo GIF) + end-of-phase review. | **Sonnet, or Opus for the review pass** |

---

## Days 25-30 — Portfolio Site + AI Chat Widget + Buffer

| Day | Date | Cap | Task | Model |
|---|---|---|---|---|
| 25 | Wed Jul 29 | 🟡 | Portfolio site scaffold (Next.js/Tailwind/Vercel), home page with work-rights callout. | Sonnet |
| 26 | Thu Jul 30 | 🟡 | Atlas + Cogent-AI case study pages — problem, architecture diagram, linked ADRs, resume-bullet summaries. | Sonnet |
| 27 | Fri Jul 31 | 🟡 | AI chat widget — ground on resume/READMEs, function-calling to link case-study sections, rate limit + cost cap (mirror the Cogent-AI guardrail story). | **Opus (plan) → Sonnet (build)** |
| 28 | Sat Aug 1 | 🟢 | Skills section (mapped to demand categories), deploy live. | Sonnet |
| 29 | Sun Aug 2 | 🟢 | Buffer — fix anything broken across all three repos, confirm the live site actually works end to end. | Sonnet |
| 30 | Mon Aug 3 (last day at Samsung) | 🟡 | Final buffer / catch-up day for any complex task still open. This is the last day for new build work — nothing complex starts after this. | Sonnet |

---

## Days 31-32 — Documentation Only (Pro plan winding down)

No new builds. This is deliberate: don't start anything here that needs real iteration room.

| Day | Date | Cap | Task | Model |
|---|---|---|---|---|
| 31 | Tue Aug 4 | 🔵 | Full README/ADR audit across all three repos. Draft resume + cover letter using real metrics from the finished projects (use claude.ai chat, not Claude Code). | Sonnet |
| 32 | Wed Aug 5 (last day of Pro plan) | 🔵 | LinkedIn headline/About rewrite finalized against real project artifacts. Run the interview-prep quiz from `portfolio-plan.md` for both projects — this is worth spending your last hours of Pro access on, since it's the highest-value use of remaining budget. | Sonnet |

**After Aug 5:** no more Claude Pro access assumed. Anything remaining — final polish, re-reading your own docs, rehearsing answers out loud — doesn't need AI help at that point anyway.

---

## LinkedIn Cadence (unchanged in spirit, dates shifted)

Post 2-3x/week tied to real progress: Day 2-3 (Module Federation reasoning), Day 6 (design system), Day 9 (AI-assistant remote), Day 15 (two-database decision), Day 18-19 (NL-query design), Day 28 (portfolio launch). Content ideas live in `portfolio-plan.md`'s Track C — pull from there, don't improvise new ones here.
