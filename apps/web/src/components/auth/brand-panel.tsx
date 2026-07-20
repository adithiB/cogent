/**
 * cogent-ui-implementation-spec.md §2.1 BrandPanel. Collapses from a full
 * left column (≥900px) to a wordmark + lede block above the card (<900px);
 * the ledger motif itself is hidden entirely <640px.
 */
export function BrandPanel() {
  return (
    <div className="flex flex-col justify-between bg-inset px-8 py-10 min-[900px]:h-full min-[900px]:px-12 min-[900px]:py-16">
      <div>
        <div className="text-page-title font-medium text-text">Cogent</div>
        <p className="mt-4 max-w-xs text-body text-text-muted">
          A clear, defensible account of what your models cost.
        </p>
      </div>

      <div className="mt-10 hidden min-[640px]:block">
        <LedgerMotif />
      </div>

      <p className="mt-10 text-meta text-text-faint min-[900px]:mt-0">
        Hand-rolled JWT · org-scoped at the query layer.
      </p>
    </div>
  );
}

function LedgerMotif() {
  const rows = [
    { label: "checkout-service", value: "$412.30" },
    { label: "recs-worker", value: "$188.05" },
    { label: "billing-api", value: "$96.40" },
  ];

  return (
    <div
      aria-hidden="true"
      className="w-full max-w-xs rounded-lg border border-border bg-surface px-4 py-4"
    >
      <div className="text-eyebrow uppercase tracking-wide text-text-faint">
        July statement
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between">
            <span className="text-secondary text-text-muted">{row.label}</span>
            <span className="font-mono text-secondary tabular-nums text-text">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-body font-medium text-text">Total</span>
        <span className="font-mono text-card-title tabular-nums text-text">$696.75</span>
      </div>
    </div>
  );
}
