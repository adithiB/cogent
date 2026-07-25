"use client";

import { PillSelect } from "./pill-select";
import { PERIOD_OPTIONS, type PeriodId } from "@/lib/period";

/** spec §2.2 locks the Period pill's existence, not its option set — see
 * `lib/period.ts` for why these three presets are an implementation
 * default rather than a resolved design axis. */
export function PeriodPill({
  value,
  onChange,
}: {
  value: PeriodId;
  onChange: (period: PeriodId) => void;
}) {
  return <PillSelect label="Period" value={value} options={PERIOD_OPTIONS} onChange={onChange} />;
}
