"use client";

import { useQuery } from "@tanstack/react-query";
import { getStatement, type GroupingDimension, type MetricFilter, type TimeWindow } from "@/lib/api-client";

export interface StatementQueryArgs {
  window: TimeWindow;
  groupBy: GroupingDimension;
  filter?: MetricFilter;
}

export function statementQueryKey(args: StatementQueryArgs) {
  return [
    "statement",
    args.window.from.toISOString(),
    args.window.to.toISOString(),
    args.groupBy,
    args.filter?.dimension,
    args.filter?.value,
  ] as const;
}

/** Backs both the StatementTable and the StatementHeader hero/total figure —
 * one call serves both (ADR-0002 §3b: `getStatement`'s `totals` field is the
 * aggregate across the whole window regardless of grouping). */
export function useStatement(args: StatementQueryArgs) {
  return useQuery({
    queryKey: statementQueryKey(args),
    queryFn: () => getStatement(args),
  });
}
