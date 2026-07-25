"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
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
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
