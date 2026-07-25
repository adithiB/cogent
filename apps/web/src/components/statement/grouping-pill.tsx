"use client";

import { PillSelect } from "./pill-select";
import type { GroupingDimension } from "@/lib/api-client";

const GROUPING_OPTIONS: { id: GroupingDimension; label: string }[] = [
  { id: "project", label: "Project" },
  { id: "team", label: "Team" },
  { id: "model", label: "Model" },
];

/** spec §2.2: "by project (default) / team / model" — the second half of
 * the visible allow-list alongside MeasureSegmented (§0 item 6). */
export function GroupingPill({
  value,
  onChange,
}: {
  value: GroupingDimension;
  onChange: (grouping: GroupingDimension) => void;
}) {
  return <PillSelect label="Group by" value={value} options={GROUPING_OPTIONS} onChange={onChange} />;
}
