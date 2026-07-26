# Cogent-AI — Known Issues

Running list of flagged debt, kept open until each is closed for real — same discipline Atlas keeps for `RemoteIdentity`, `useTeamRecords`, and the SRI mismatch. An item moves to Closed only when it's actually fixed, not when it stops being annoying.

## Open

- **NL-query assistant: 3 e2e tests fail with 401 on cookie-authenticated requests.** `apps/api/test/tenant-isolation.e2e-spec.ts`, the "Tenant isolation — NL-query assistant (ADR-0004)" describe block (`org E's session sees org E's total spend`, the org F equivalent, and the out-of-scope `orgId` case). Confirmed pre-existing during the Budgets session (2026-07-26): reproduces identically against the unmodified pre-Budgets file, so it isn't something that session introduced. Likely the same gap as the missing silent-refresh path flagged during the Statement session — the assistant's cookie handling doesn't yet cover whatever case these three tests exercise. Blocks full confidence in the assistant's cookie/session path until root-caused; don't assume it's "just flaky."
- **e2e default test timeout raised to 150s.** `apps/api/test/jest-e2e.json`, changed 2026-07-26 (Budgets session). Every describe block in `tenant-isolation.e2e-spec.ts` bootstraps its own full Nest app, including a real `OllamaAssistantClient.onModuleInit()` warm-up call — a cold local-model load can exceed Jest's default 5s hook timeout, which was failing every block's `beforeAll` before this change. The trade: a genuinely hung or slow-regressed test now takes up to 150s to report failure instead of 5s, which will quietly slow the feedback loop on this suite. If a future session hits a slow-to-fail e2e run, this is why — check whether it's a real regression before assuming it's just Ollama cold-start.

## Closed

(none yet)
