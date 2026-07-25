import type { TimeWindow } from "@/lib/api-client";

/**
 * spec §2.2 locks the Period pill's *existence* ("Period pill: time
 * window") but not its exact option set — unlike Measure/Grouping, which
 * are the visible allow-list (§0 item 6) and therefore fixed. These three
 * presets are an implementation default, not a design axis: "This month"
 * defaults first to match the statement metaphor (a monthly bill).
 */
export const PERIOD_OPTIONS = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
] as const;

export type PeriodId = (typeof PERIOD_OPTIONS)[number]["id"];

export const DEFAULT_PERIOD: PeriodId = "month";

/** `to` is exclusive-tomorrow so "today" is fully included — matches the
 * single-day-window convention ADR-0004's amendment §2 fixed in the
 * assistant's own worked examples. */
export function periodToWindow(period: PeriodId, now: Date = new Date()): TimeWindow {
  const to = new Date(now);
  to.setHours(24, 0, 0, 0);

  const from = new Date(to);
  switch (period) {
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "month":
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
  }
  return { from, to };
}
