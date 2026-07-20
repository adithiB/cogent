"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Light is a deliberate brand call (spec §0.3), not a fallback — no
 * enableSystem, no prefers-color-scheme auto-switch. attribute="data-theme"
 * matches the [data-theme="dark"] selector tokens.css defines.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
