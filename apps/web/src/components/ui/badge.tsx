import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Tint-only status surface (spec §0 item 2: `--accent` is chrome, `--ok` is
 * status-only, never adjacent). Every consumer pairs this with an icon or
 * text label — color never carries meaning alone (§1.9).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-secondary font-mono",
  {
    variants: {
      variant: {
        neutral: "border border-border bg-inset text-text-muted font-sans",
        accent: "bg-accent-tint text-accent-ink font-sans",
        ok: "bg-accent-tint text-ok",
        warn: "bg-warn-tint text-warn-ink",
        danger: "bg-danger-tint text-danger-ink",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
