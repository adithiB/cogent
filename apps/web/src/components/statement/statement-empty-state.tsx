/**
 * spec §2.2: exact copy, a real reachable state for any brand-new org
 * (zero `usage_events` rows) — not hypothetical. Triggered by the current
 * window's totals having zero requests; see StatementScreen for why that's
 * the practical proxy for "no usage recorded yet" rather than an unbounded
 * all-time query.
 */
export function StatementEmptyState() {
  return (
    <div className="space-y-4 border-b border-border pb-6">
      <p className="text-body text-text-muted">
        No usage recorded yet. Once your services send events, your statement builds here.
      </p>
      <div className="rounded-md border border-dashed border-border px-3 py-2 opacity-60">
        <div className="flex items-center justify-between text-body text-text-faint">
          <span>checkout-service</span>
          <span className="font-mono">— · — ms · —% · $—.—</span>
        </div>
      </div>
    </div>
  );
}
