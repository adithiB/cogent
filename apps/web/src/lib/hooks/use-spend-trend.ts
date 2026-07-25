"use client";

import { useQuery } from "@tanstack/react-query";
import { getSpendMetric, type TimeWindow } from "@/lib/api-client";

/** HeaderSparkline's data source — always spend, grouped by time, regardless
 * of the selected Measure (spec §0 item 8: "single-series period spend"). */
export function useSpendTrend(window: TimeWindow) {
  return useQuery({
    queryKey: ["spend-trend", window.from.toISOString(), window.to.toISOString()],
    queryFn: () => getSpendMetric({ window, groupBy: "time" }),
  });
}
