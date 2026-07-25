/**
 * spec §1.6: "The Statement's caption restates the org in the content
 * region so tenancy is legible to a screen reader from the content, not
 * only the chrome." This is a global-authenticated-screen requirement, not
 * conditional on data state — rendered once, outside the loading/empty/
 * error/success switch in StatementScreen, so it survives every state
 * rather than disappearing whenever StatementHeader itself doesn't render.
 */
export function StatementCaption({ orgName, periodLabel }: { orgName: string; periodLabel: string }) {
  return (
    <p className="text-secondary text-text-muted">
      {orgName} — statement · {periodLabel}
    </p>
  );
}
