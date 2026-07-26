"use client";

import { useBudgetAlertsWithStatus, useRemoveBudgetAlert } from "@/lib/hooks/use-budget-alerts";
import { AlertItem, scopeLabel } from "./alert-item";

/** spec §2.4's "Active alerts" card: AlertItem list or the empty state. */
export function ActiveAlerts({ onRemoved }: { onRemoved: (scopeText: string) => void }) {
  const alerts = useBudgetAlertsWithStatus();
  const removeAlert = useRemoveBudgetAlert();

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-card-title text-text">Active alerts</h2>
      <div className="mt-4">
        {alerts.isPending ? (
          <p className="text-secondary text-text-muted">Loading…</p>
        ) : alerts.data && alerts.data.length > 0 ? (
          <ul className="space-y-3">
            {alerts.data.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                removing={removeAlert.isPending && removeAlert.variables === alert.id}
                onRemove={async () => {
                  const label = scopeLabel(alert.scope);
                  await removeAlert.mutateAsync(alert.id);
                  onRemoved(label);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-secondary text-text-muted">No alerts yet. Create one on the left.</p>
        )}
      </div>
    </div>
  );
}
