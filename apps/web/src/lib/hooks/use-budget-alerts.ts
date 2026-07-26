"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBudgetAlert,
  getBudgetScopeOptions,
  getSpendMetric,
  listBudgetAlerts,
  removeBudgetAlert,
  type BudgetAlert,
  type BudgetScope,
  type CreateBudgetAlertInput,
} from "@/lib/api-client";
import { capMicrosFor, currentCalendarMonthWindow, statusForPct, type ThresholdReading } from "@/lib/threshold";

export const BUDGET_ALERTS_QUERY_KEY = ["budget-alerts"] as const;
export const BUDGET_SCOPE_OPTIONS_QUERY_KEY = ["budget-scope-options"] as const;

export function useBudgetAlerts() {
  return useQuery({ queryKey: BUDGET_ALERTS_QUERY_KEY, queryFn: listBudgetAlerts });
}

export function useBudgetScopeOptions() {
  return useQuery({ queryKey: BUDGET_SCOPE_OPTIONS_QUERY_KEY, queryFn: getBudgetScopeOptions });
}

/** Current scoped spend for the given calendar-month window, via the
 * existing `getSpend` route (ADR-0002 §3b) — the read this build prompt
 * required reusing rather than a parallel aggregation path. */
async function scopedSpendMicros(scope: BudgetScope): Promise<number> {
  const result = await getSpendMetric({
    window: currentCalendarMonthWindow(),
    filter: scope.dimension === "total" ? undefined : { dimension: scope.dimension, value: scope.value! },
  });
  return result.intent === "point" ? Math.round(result.value * 1e6) : 0;
}

export interface BudgetAlertWithStatus extends BudgetAlert {
  currentSpendMicros: number;
  reading: ThresholdReading;
}

/**
 * Alerts + their live status in one derived query. MVP ships at most a
 * handful of alerts ("MVP ships one alert, so at most one scope is ever
 * marked" — spec §1.7), so one `getSpend` call per alert is cheap; this is
 * the seam ActiveAlerts and the Statement's BudgetRule/row-marking both key
 * off, so the 75/90 breakpoints are computed in exactly one place per render.
 */
export function useBudgetAlertsWithStatus() {
  const alerts = useBudgetAlerts();
  const ids = alerts.data?.map((a) => a.id).join(",") ?? "";

  return useQuery({
    queryKey: [...BUDGET_ALERTS_QUERY_KEY, "with-status", ids],
    queryFn: async (): Promise<BudgetAlertWithStatus[]> => {
      const list = alerts.data ?? [];
      return Promise.all(
        list.map(async (alert) => {
          const currentSpendMicros = await scopedSpendMicros(alert.scope);
          const capMicros = capMicrosFor(alert);
          const consumedPct = capMicros > 0 ? (currentSpendMicros / capMicros) * 100 : 0;
          return { ...alert, currentSpendMicros, reading: statusForPct(consumedPct) };
        }),
      );
    },
    enabled: alerts.isSuccess,
  });
}

/** The AlertForm's live SitsIndicator, before an alert exists to look up —
 * current spend for whatever scope is currently selected in the form. */
export function useScopedSpendPreview(scope: BudgetScope | undefined) {
  return useQuery({
    queryKey: ["budget-scope-spend-preview", scope?.dimension, scope?.value],
    queryFn: () => scopedSpendMicros(scope!),
    enabled: !!scope,
  });
}

export function useCreateBudgetAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetAlertInput) => createBudgetAlert(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUDGET_ALERTS_QUERY_KEY });
    },
  });
}

export function useRemoveBudgetAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeBudgetAlert(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUDGET_ALERTS_QUERY_KEY });
    },
  });
}
