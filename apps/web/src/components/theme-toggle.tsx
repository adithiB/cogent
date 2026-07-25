"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const subscribeNever = () => () => {};

/**
 * `resolvedTheme` is undefined until after hydration. The previous version
 * rendered a `<div>` placeholder pre-mount and swapped to a `<button>` on
 * mount — a real element-type change React can't reconcile, which produced
 * a genuine hydration-mismatch error on every page load (found during this
 * session's live verification, not something the Statement work itself
 * touches). The fix: render the same `<button>` both passes and only swap
 * the icon/label after mount. `useSyncExternalStore` (server snapshot
 * `false`, client snapshot `true`) gets the "true only after hydration"
 * value without a `setState`-in-`useEffect` render cascade, which this
 * repo's `react-hooks/set-state-in-effect` lint rule rejects.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"}
      aria-pressed={mounted ? isDark : undefined}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} className={mounted ? undefined : "opacity-0"} />}
    </Button>
  );
}
