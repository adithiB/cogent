"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/hooks/use-session";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Statement" },
  { href: "/budgets", label: "Budgets" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * Top bar per spec §1.5. Grid layout (not flex justify-between) so the
 * center nav stays visually centered once Avatar lands next to ThemeToggle —
 * omitted here, it needs user identity data (`session` currently returns
 * only org + role) that this session doesn't add.
 *
 * Auth gate lives here, not per-page: every screen behind this layout
 * (Statement, Budgets, Settings) requires a session, and OrgSwitcher already
 * silently no-ops on `isError` — that was masking the real gap (found live,
 * deploy session 2026-07-27): nothing anywhere redirected an unauthenticated
 * visitor to `/login`, so an anonymous visit rendered the full shell with a
 * generic `StatementErrorState` instead of the milestone's "correct
 * empty/redirect state." One check here, not one per page, for the same
 * reason ADR-0001 keeps org-scope enforcement to a single seam.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.isError) {
      router.replace("/login");
    }
  }, [session.isError, router]);

  if (session.isPending || session.isError) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto h-14 max-w-[1000px] px-4" />
        </header>
        <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 px-4 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto grid h-14 max-w-[1000px] grid-cols-[1fr_auto_1fr] items-center px-4">
          <div className="flex items-center gap-3 justify-self-start">
            <span className="text-card-title text-text">Cogent-AI</span>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <OrgSwitcher />
          </div>

          <nav aria-label="Primary" className="justify-self-center">
            <ul className="flex items-center gap-6">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block border-b-2 py-4 text-body font-medium transition-colors",
                        active
                          ? "border-accent text-text"
                          : "border-transparent text-text-muted hover:text-text",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="justify-self-end">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
