"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Shared shape behind GroupingPill and PeriodPill (spec §2.2) — a single
 * current-value trigger plus a menu of the finite option set, rather than a
 * segmented row, because "pill" (singular) is a compact select, not an
 * always-visible enumeration like MeasureSegmented. */
export function PillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-secondary font-medium text-text outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="text-text-faint">{label}:</span>
        {current?.label ?? value}
        <ChevronDown size={13} className="text-text-faint" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.id} checked={o.id === value} onSelect={() => onChange(o.id)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
