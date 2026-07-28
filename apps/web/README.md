# `web` — Cogent-AI frontend

Next.js (App Router), Tailwind, TanStack Query, Radix primitives.

See the [root README](../../README.md) for architecture and setup, and [`docs/demo-walkthrough.md`](../../docs/demo-walkthrough.md) for what the screens actually do.

```
src/
  app/
    (auth)/      /login and /signup — outside the shell, no session required
    (shell)/     Statement (/), Budgets, Settings — behind the AppShell auth gate
  components/
    statement/   The ledger, the ask bar, the answer log and its result cards
    budgets/     Alert form and active-alert list
    ui/          Hand-authored Radix-backed primitives on the project's own tokens
  lib/           API client, hooks, period helpers, assistant types
```

Runs on **port 3001** (`npm run dev`) — the API takes 3000.

Two conventions worth knowing before editing:

- **The API client never reads or sets a token.** Every call is `credentials: "include"` against httpOnly cookies; the browser can't see the session, by design ([ADR-0001](../../docs/adr/0001-hand-rolled-jwt-and-org-scoped-rbac.md)). `NEXT_PUBLIC_API_URL` must include the `/api` prefix — omitting it is a real bug this project shipped once and caught on the live deploy.
- **UI primitives are hand-authored, not `shadcn init`'d.** The CLI's init step writes its own CSS variables, which would collide with the locked design tokens the UI spec defines. Same components, no CLI fight.
