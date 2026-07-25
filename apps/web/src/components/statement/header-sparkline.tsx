"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

import type { MetricResult } from "@/lib/api-client";

/**
 * spec §0 item 8 / §1.8: exactly one chart on the whole screen, single-
 * series period spend, always — not swapped by Measure. Animation is off
 * outright rather than conditioned on `prefers-reduced-motion`: a sparkline
 * has no informational content in its entrance animation, so there's
 * nothing reduced-motion needs to preserve by keeping it.
 */
export function HeaderSparkline({ trend }: { trend: MetricResult | undefined }) {
  if (!trend || trend.intent !== "slice" || trend.rows.length < 2) {
    return null;
  }

  const data = trend.rows.map((row) => ({ key: row.key, value: row.value }));

  return (
    <div className="h-10 w-32" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={1.5}
            fill="url(#sparkline-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
