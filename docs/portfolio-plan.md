# Portfolio Plan — Atlas, Cogent-AI, Portfolio Site

**Deadline:** 40 days, hard limit. ~32 of those overlap with full-time work at Samsung (last day Aug 3).
**Governs:** builds under `const.md`.
**Context:** Networking is already active in parallel — mutual connections in Australian IT, a warm-contact internship fallback (~AU$50-70k), and an expectation that in-person presence in Australia raises job-search odds significantly. This portfolio's job is not to get noticed cold; it's to hold up under real conversation once those introductions happen. Depth and explainability matter more than feature count.

---

## Why These Two Projects, and Why This Version of Them

Both projects map 1:1 onto real Samsung experience (Module Federation, MLOps dashboards, Kubernetes), which is the actual differentiator — you can go deep under questioning without the "did you actually build this or did an AI agent build it" risk that hits generic clones hardest in 2026.

The one change from earlier drafts: **AI integration is core scope in both, not a stretch feature cut when time runs short.** The 2026 Australian tech market's highest-demand categories are cybersecurity, cloud infrastructure, data/AI, and platform engineering — and engineers are explicitly expected to be AI-literate, not just aware AI exists. A portfolio with two solid-but-conventional CRUD platforms sits in the crowded middle of that market. A portfolio where AI integration shows up three separate times, in three different real contexts, does not.

---

## Project 1: Atlas — Polyglot Micro-Frontend Platform & Internal Developer Console

### What it is
An internal developer platform demonstrating independently-owned, independently-deployed frontend modules written in different frameworks, composed at runtime into one shell — the pattern real platform-infra teams at scale-ups (50+ engineers) use to stop one team's bug from blocking every other team's release.

### What value it adds to your candidacy
- **Direct extension of real experience, not a simulation of it.** Your actual Samsung work is Module Federation at Samsung Electro-Mechanics on the PADO Model Store platform — Atlas is that same architectural pattern taken further, so any interviewer's "walk me through how this actually works" question lands on ground you've genuinely stood on before.
- **Platform engineering is a named top-demand category** in the current market, and it's one of the least crowded — most candidates show frontend *or* backend depth, rarely the infrastructure layer connecting them. Atlas proves you can reason about the seam between them: version compatibility, independent deployability, runtime composition.
- **Proves range, not just depth.** Angular host + React remote in the same system signals you're not a single-framework specialist, without diluting your Angular depth (the host is still Angular, still your strongest language).
- **The AI-assistant remote adds the current market's premium skill without diluting the platform-engineering story** — it's delivered *as* a federated module, so it doubles as proof the architecture pattern generalizes to new module types, not just a bolted-on feature.

### Core MVP (must ship)
1. Angular host app with Module Federation config
2. Angular "Resource Monitoring" remote — real local K8s metrics in dev (mirrors your actual dashboard work)
3. React (Vite) "Team Admin" remote
4. Shared design-system package, framework-agnostic tokens with thin Angular/React wrappers
5. Cognito auth + route guards gating which remotes load, by role
6. NestJS backend: auth, module registry, metrics endpoint
7. Postgres schema: users, roles, modules, deploy_history
8. **AI-assistant remote** — third federated module, NestJS endpoint calling an LLM to summarize a module's latest deploy from its commit log
9. Platform Health page (live version/build hash/last-deploy per module)
10. Per-module CI/CD pipelines + one integration smoke-test pipeline
11. kind cluster + Helm chart + ArgoCD "app of apps," recorded as a demo video (no live cluster left running — cost without benefit for a portfolio demo)

### Deferred (documented via ADR if time runs short — cut here first, not from the AI feature)
Runtime feature flags, live module-registry add-without-redeploy, full a11y audit, contract tests between host/remote versions.

### Resume bullets
- "Designed and built a polyglot micro-frontend platform (Angular host + React remote) using Module Federation, including an AI-powered deploy-summary module, with independent CI/CD pipelines per module and zero-redeploy module registration."
- "Implemented federated-module version pinning and role-gated remote loading, addressing security concerns specific to micro-frontend architectures."

### Interview questions to rehearse
- Walk me through what happens, step by step, when the host loads a remote at runtime.
- How do you prevent shared-dependency version mismatches from breaking production?
- When would you *not* recommend micro-frontends to a team?
- Walk me through the AI feature end-to-end — what happens if the model returns something unexpected?

---

## Project 2: Cogent-AI — Multi-Tenant LLM Cost & Observability Platform

### What it is
A platform giving engineering leads visibility into per-team/per-feature LLM API spend, latency, and failure rates — the same category as funded products like Helicone, Langfuse, and PromptLayer — with a natural-language interface for querying that usage data.

### What value it adds to your candidacy
- **Directly targets the "data and AI" demand category**, one of the four named highest-demand areas in the current market, and does so as a real product category with existing commercial comparables — proof you understand a market, not just a tech stack.
- **The NL-query assistant, built early as core rather than cut under pressure, is the actual differentiator.** Without it, this is a well-executed but generic dashboard — the same shape as hundreds of other bootcamp/portfolio projects. With it, it's a working demonstration of LLM function-calling against a guarded, allow-listed data layer, with a hard cost cap — which is simultaneously an AI-skills proof point and a security/cost-awareness proof point (a cost-monitoring tool that doesn't monitor its own AI feature's cost is an obvious interview gotcha, and having already thought about it is a strong "second-order effects" story).
- **The two-database design (Postgres + DynamoDB) and the auth contrast with Atlas** (Cognito there vs. hand-rolled JWT here) both demonstrate range and judgment — knowing when to use a managed service and when to build one by hand is itself a senior-level signal.
- **NestJS again**, reinforcing the same backend pattern from Atlas — you're not learning a new backend framework per project, you're deepening one, which is a more defensible growth story than shallow breadth.

### Core MVP (must ship, in this build order — NL-query is not last)
1. Hand-rolled JWT auth (access token + httpOnly refresh) + org-scoped RBAC enforced at the query layer
2. Ingestion endpoint as a single Lambda, direct DynamoDB write (no SQS/EventBridge for MVP — and you say why out loud: at demo data volume one path suffices, at the scale this product targets you'd add the queue)
3. Minimal dashboard: usage breakdown by team/project/model (Recharts, TanStack Query)
4. **NL-query assistant** — allow-listed query types, hard cost cap, LLM function-calling against a read-only parametrised layer
5. One budget-threshold alert (single trigger path, not the full alerting matrix)
6. Postgres (orgs/users/projects/budgets) + one DynamoDB table (raw usage events)

### Deferred (cut here before touching the NL-query feature)
Spend-anomaly detection, multi-provider price normalization, full EventBridge aggregation pipeline, CDK/Lambda live deploy (document the deploy design via ADR if it comes to this), full a11y audit, contract tests.

### Resume bullets
- "Built a full-stack multi-tenant LLM observability platform (Next.js, NestJS, AWS Lambda) with polyglot persistence (Postgres + DynamoDB) and a cost-capped, allow-listed natural-language query assistant over usage data."
- "Designed org-scoped RBAC enforced at the data-access layer and hand-rolled JWT auth, with defense-in-depth tenant isolation."

### Interview questions to rehearse
- Why two databases? Defend that decision.
- How do you stop the AI query feature from generating runaway cost or a bad query?
- What happens if 10,000 requests hit your ingestion endpoint in one second?
- How is tenant data isolated — what stops org A from ever seeing org B's data?

---

## Project 3: Portfolio Site — with a Live AI Feature, Not Just a Description of One

### What it is
A Next.js site presenting both projects as case studies, with an embedded **"ask about my work" chat widget** grounded on your resume and project docs, using an LLM API with function-calling to answer specific questions and link back to the relevant case-study section.

### What value it adds to your candidacy
- This is the one piece of work every recruiter or referral contact will actually touch. A static site describing your AI skills is a claim; a chat widget that demonstrates them live, in the same 60 seconds someone spends deciding whether to keep reading, is proof.
- Reuses the same cost-guardrail story as Cogent-AI's NL-query feature (rate limit + token cap), reinforcing a single consistent narrative across all three pieces of work rather than three disconnected projects.
- Removes friction immediately: leads with the MATES visa / full work-rights status so no one has to ask.

### Scope (keep this deliberately small — days, not weeks)
- Home: name, one-line positioning, work-rights callout
- Atlas case study: problem → architecture diagram → key decisions (linked ADRs) → demo GIF → resume-bullet summary
- Cogent-AI case study: same structure, "why two databases" / "why cost-capped AI feature" front and center
- Skills section organized by demand category (platform engineering, cloud/AWS, AI integration, modern frontend, security-by-design), not a flat tag list
- Resume (view + download), contact
- The chat widget, available site-wide

**Stack:** Next.js + Tailwind, Vercel. Single small repo — this is not where extra scope should go.

---

## Skills-to-Market Mapping (for resume, cover letter, LinkedIn)

| Demand category | Where it's demonstrated |
|---|---|
| Platform engineering | Atlas — Module Federation, K8s/kind, ArgoCD, per-module CI/CD |
| Cloud infrastructure (AWS) | Cognito, Lambda, S3/CloudFront (Atlas); Lambda, DynamoDB (Cogent-AI) |
| AI integration / AI-literacy | Atlas's AI-assistant remote, Cogent-AI's NL-query assistant, portfolio site's chat widget — three separate implementations |
| Modern frontend (React + TypeScript) | Both projects pair React alongside Angular, signaling range without diluting Angular depth |
| Security-by-design | Woven through both projects' ADRs — SRI/version pinning, least-privilege IAM, RBAC at the query layer, JWT design |

A dedicated third project purely for security or data engineering isn't realistic alongside the above in 40 days — folding that narrative into Atlas and Cogent-AI's documentation captures most of the resume value without extra build time.

---

## 40-Day Schedule

### Track A — Build

| Days | Focus |
|---|---|
| 1-2 | Repo setup, CI skeletons, `const.md` in both repos |
| 3-17 | Atlas MVP, including the AI-assistant remote |
| 18-31 | Cogent-AI MVP, NL-query assistant built early |
| 32-35 | Portfolio site + AI chat widget |
| 36-40 | Polish, README/ADR pass, buffer |

### Track B — Job search (continues alongside existing networking, runs from Day 1)

| Days | Focus |
|---|---|
| 1-5 | LinkedIn headline/summary rewrite; keep existing mutual/referral conversations moving |
| 6-17 | Atlas demoable by ~Day 17 — start referencing it in ongoing conversations even before Cogent-AI is finished |
| 18-31 | Continue outreach; a work-in-progress Cogent-AI is fine to reference — don't wait for 100% completion given long decision timelines |
| 32-40 | Portfolio site live, resume/cover letter finalized against real project artifacts |

### Track C — LinkedIn presence (small, fixed time budget: 15-20 min, 2-3x/week)

Tie every post to something real you just did — don't post to stay "active." The decision behind a feature is better content than the feature itself.

| Build phase | Post ideas |
|---|---|
| Atlas: host + remotes | Why Module Federation over an iframe/single-SPA approach; what "independent deployability" actually looks like in practice |
| Atlas: AI-assistant remote | Delivering an AI feature as a federated module — what that proves about the architecture pattern |
| Cogent-AI: two-database design | The Postgres vs. DynamoDB trade-off, said out loud — this is genuinely good LinkedIn content, it's the same "senior-level answer" line from the interview-prep section |
| Cogent-AI: NL-query assistant | Cost-capping an AI feature — the second-order-effects story |
| Portfolio site | Launch post once live, linking both case studies |

Spend at least as much time commenting thoughtfully on others' posts (AU recruiters, engineers, hiring managers) as posting your own — it's cheaper visibility per minute than original posting alone.

**Git commit cadence:** commit in small, logically-scoped increments as each feature progresses — not one large commit at the end of a feature. Small commits are easier to explain individually in an interview, easier to review for correctness, and read as genuine incremental engineering practice rather than a single AI-generated dump.

**On the internship fallback:** treat it as a genuine floor, not a decision to make now. Set an explicit checkpoint roughly 3-4 weeks after landing in Australia — if nothing stronger has materialized by then through networking or applications, taking it is a reasonable move, not a failure. Don't take it early out of relocation anxiety before the portfolio and in-person networking have had a real chance to work.

---

## Resume & Cover Letter Positioning

**Headline (LinkedIn + resume):** "Frontend / Platform Engineer — Module Federation, AI-Integrated Systems, AWS" — specific, not "frontend developer." Specificity is what current AU market guidance names as the actual differentiator, both for human recruiters and ATS keyword matching.

**Cover letter:** lead with MATES visa / full work-rights status in the first two sentences — genuine practical advantage, remove the friction point immediately. Tailor the rest per job description using its actual keywords rather than reusing one generic template.

---

## Portfolio-Level Interview Questions to Rehearse

- Why these two projects specifically?
- What would you do differently with 3 more months?
- Why three separate AI integrations instead of one shared service? (Honest answer: each is scoped to its own context — deploy summaries, data queries, resume Q&A — that's a legitimate architectural choice, not redundancy.)
- What's the single hardest engineering problem you solved across both projects?
