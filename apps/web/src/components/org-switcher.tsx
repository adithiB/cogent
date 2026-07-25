"use client";

import { ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/hooks/use-session";
import { cn } from "@/lib/utils";

/**
 * spec §1.6: always present, current org name as text (never icon-only).
 * ADR-0001's schema note (`memberships(user_id, org_id, role)`) is why this
 * is a real dropdown trigger and not a plain label — the model supports a
 * user belonging to more than one org. MVP signup produces exactly one
 * membership per user, so the menu lists that single org, checked, and
 * offers no second option yet: the *interaction* (switching) is deferred,
 * not the schema or the trigger's semantics (`aria-haspopup`/`aria-expanded`,
 * both supplied by Radix's DropdownMenuTrigger automatically).
 */
export function OrgSwitcher() {
  const { data, isPending, isError } = useSession();

  if (isPending) {
    return <div className="h-5 w-24 animate-pulse motion-reduce:animate-none rounded-sm bg-inset" aria-hidden />;
  }

  if (isError || !data) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-body text-text outline-none hover:bg-inset focus-visible:bg-inset",
        )}
      >
        <span className="max-w-[160px] truncate">{data.org.name}</span>
        <ChevronsUpDown size={14} className="text-text-faint" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Organization</DropdownMenuLabel>
        <DropdownMenuItem checked disabled className="data-[disabled]:opacity-100">
          {data.org.name}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
