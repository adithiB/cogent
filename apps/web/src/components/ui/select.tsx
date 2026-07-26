import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A native `<select>`, styled to the Input token language — spec §2.4 calls
 * for "Select" controls (scope, notify channel) as real form fields, not
 * pills like the Statement's PillSelect (a compact current-value trigger).
 * No `@radix-ui/react-select` dependency exists in this workspace; a native
 * element gives correct keyboard/screen-reader/`<option>` semantics for free
 * and is the simpler choice for a form input (CLAUDE.md priority #1).
 */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-border bg-surface px-3 pr-8 text-body text-text outline-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-accent",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-faint"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
