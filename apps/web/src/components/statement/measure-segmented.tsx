"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { Metric } from "@/lib/api-client";

const MEASURES: { id: Metric; label: string }[] = [
  { id: "spend", label: "Spend" },
  { id: "latency", label: "Latency" },
  { id: "requests", label: "Requests" },
  { id: "errors", label: "Errors" },
];

/**
 * spec §0 item 6 / §2.2: this control (plus GroupingPill) IS the visible
 * allow-list — it enumerates exactly the metrics the assistant may query.
 * Radix RadioGroup gives the required arrow-key-navigable radiogroup
 * semantics (§2.2 A11y) for free; no custom keyboard handling needed.
 */
export function MeasureSegmented({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (measure: Metric) => void;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as Metric)}
      aria-label="Measure"
      className="inline-flex gap-0.5 rounded-md border border-border bg-inset p-0.5"
    >
      {MEASURES.map((m) => (
        <RadioGroupItem
          key={m.id}
          value={m.id}
          className={cn(
            "cursor-pointer rounded-sm px-3 py-1.5 text-body text-text-muted outline-none transition-colors",
            "hover:text-text",
            "data-[state=checked]:bg-surface data-[state=checked]:font-medium data-[state=checked]:text-text",
            m.id === "spend" && "data-[state=checked]:text-accent",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
          )}
        >
          {m.label}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
