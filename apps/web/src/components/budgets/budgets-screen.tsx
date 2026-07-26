"use client";

import { useState } from "react";

import { AlertForm } from "./alert-form";
import { ActiveAlerts } from "./active-alerts";

/**
 * cogent-ui-implementation-spec.md §2.4: Grid2 (AlertForm + ActiveAlerts),
 * stacked below 720px, form first. One `aria-live` region shared by both
 * cards' outcomes (create/remove) — spec's "saved (item appears + brief
 * aria-live announce)" state.
 */
export function BudgetsScreen() {
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="text-page-title text-text">Budgets</h1>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="grid grid-cols-1 gap-6 min-[720px]:grid-cols-2">
        <AlertForm onCreated={(scopeText) => setAnnouncement(`Alert created for ${scopeText}.`)} />
        <ActiveAlerts onRemoved={(scopeText) => setAnnouncement(`Alert removed for ${scopeText}.`)} />
      </div>
    </div>
  );
}
