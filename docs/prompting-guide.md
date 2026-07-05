# Prompting & Usage Guide — Building the Portfolio on a One-Month Claude Pro Plan

Companion to `const.md` and `portfolio-plan.md`. This one is about *how* to work with Claude efficiently, not what to build.

---

## 1. One-Time Setup (before Day 1)

- **Subscribe to Claude Pro.** It includes both claude.ai (chat/Projects) and Claude Code (terminal + VS Code/JetBrains extension) on one account.
- **Avoid the API-billing trap:** if an `ANTHROPIC_API_KEY` environment variable is ever set on your machine, Claude Code silently bills the API instead of using your Pro plan allowance. Run `claude logout`, then `claude login` using only your Pro credentials — don't add Console/API credentials during login.
- **Split tools by purpose, not habit:**
  - **Claude Code** (terminal or IDE extension) — for anything that touches files: writing code, running commands, git commits. It reads your repo directly, so you never paste code into chat.
  - **claude.ai chat + a Project** — for planning, ADR drafting, resume/cover letter/LinkedIn writing, and reviewing strategy. No file access needed, so it's the lighter-weight surface.
- **Create one Claude Project** (in claude.ai) called something like "Portfolio," and upload `const.md` and `portfolio-plan.md` into its Project Knowledge. Projects use retrieval (RAG), so Claude only pulls in the relevant parts of these docs per question instead of you re-pasting them — this alone saves meaningful usage over a month.
- **Commit `const.md` as `CLAUDE.md` at the root of each repo** (Atlas, Cogent-AI, portfolio site). Claude Code auto-loads it every session, so you never have to re-explain your constraints, standards, or time-boxing rules.

---

## 2. Know Your Usage Pool

- Usage is shared across every surface — chat, Claude Code terminal, IDE, Desktop. Treat it as one budget for the day, not separate budgets per tool.
- Two limits apply: a rolling **5-hour session window** and a **weekly cap**, both on a fixed personal reset schedule. Check `/status` inside Claude Code, or Settings → Usage on claude.ai, before starting a heavy session so you're not surprised mid-feature.
- On Pro (not Max), the practical rule is: **one focused task per session, not a marathon.** A scoped prompt like "add auth guards to the host app" finishes fast and leaves headroom; "build the whole platform" burns a session exploring before it even writes code.

---

## 3. Model & Effort — the biggest lever for stretching a Pro plan

- **Default to Sonnet** for implementation work — it's the efficient, capable workhorse for day-to-day coding.
- **Reserve Opus** (if available on your plan) for the moments that actually need deeper reasoning: architecture planning at the start of a feature, ADR writing, and code review — not routine CRUD or styling.
- **Turn extended thinking off** for routine tasks and on for genuine debugging or design decisions.
- Switch deliberately with `/model` rather than leaving high-effort mode on by default for everything.

---

## 4. Session Structure

- **One feature per session/conversation.** Don't let one thread carry Atlas's auth work, Cogent-AI's ingestion, and a LinkedIn post all in the same conversation — unrelated context sitting in a long thread costs tokens on every message after it, even when irrelevant to the current question.
- **Start fresh when switching context.** Moving from coding to resume writing to LinkedIn drafting? New chat each time.
- **Let Claude Code read the repo instead of pasting files into chat.** It has file access — pasting whole files or folders into a conversation is one of the fastest ways to burn a session's budget on content Claude could have read directly.

---

## 5. Prompt Templates

**Starting a new feature:**
> "This is an [MVP / nice-to-have] feature per const.md's time-boxing. Before writing code, explain the approach, alternatives considered, and trade-offs in a few sentences. Then implement [specific feature] in [specific file/module]. Keep the change scoped to this feature only."

**Requesting an ADR:**
> "Generate an ADR for [decision] following const.md's format: context, decision, alternatives considered, trade-offs, consequences."

**Code review:**
> "Review [feature/file] for bugs, security, and whether I could explain this decision unscripted in an interview. Flag anything I should reconsider before moving on."

**Debugging:**
> "[Paste the error or describe the behavior]. Diagnose the specific cause — don't rewrite the whole file unless the fix genuinely requires it."

**End of session:**
> "Summarize what we built this session in a few bullet points, draft a commit message per const.md's commit-cadence rule (small, logically scoped), and flag anything worth turning into a LinkedIn post per portfolio-plan.md's Track C."

**Resume / cover letter / LinkedIn (use claude.ai chat, not Claude Code):**
> "Using portfolio-plan.md's resume bullets and skills-to-market mapping, draft [a cover letter for X role / a LinkedIn post about Y decision]. Keep it specific to what I actually built, not generic."

---

## 6. What Burns Usage Fastest — Avoid These

- Pasting entire files or folders into chat when Claude Code can read them directly
- Leaving web search or other connectors enabled during pure coding sessions
- Re-explaining the constitution or plan each message instead of relying on `CLAUDE.md` + Project Knowledge
- One long thread spanning many unrelated features over several days
- Asking for an entire project "build the whole thing" in a single prompt instead of the phased, feature-by-feature breakdown already in `portfolio-plan.md`

---

## 7. Weekly Rhythm (maps to portfolio-plan.md's Track A)

| Week | Primary surface | What to batch there |
|---|---|---|
| 1 | Claude Code | Repo setup, CI skeletons, Atlas host + first remote |
| 2 | Claude Code, light chat for ADRs | Atlas remaining remotes, auth, AI-assistant module |
| 3-4 | Claude Code | Cogent-AI MVP, NL-query assistant |
| 5 | Claude Code + chat | Portfolio site + AI chat widget |
| 6 | chat (light) | Polish, resume/cover letter, LinkedIn posts, buffer |

Keep chat-based planning sessions short and scoped to one decision at a time — save the bulk of the usage pool for Claude Code, since that's where the actual month of work has to get done.
