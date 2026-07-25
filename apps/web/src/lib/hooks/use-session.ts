"use client";

import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/lib/api-client";

export const SESSION_QUERY_KEY = ["session"] as const;

/** Backs OrgSwitcher (spec §1.6) and the Statement caption's org restatement.
 * `staleTime` is generous — org identity doesn't change mid-session outside
 * of an explicit org switch, which isn't a reachable interaction yet (MVP
 * signup produces exactly one membership per user). */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
