'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * ThemeProvider — owns the data-theme attribute on <html>.
 *
 * Two themes only (industrial-design-system §8):
 *   "dark"  — control room (default).
 *   "light" — field tablet, client portal.
 *
 * Components NEVER read the theme value; they reference semantic tokens
 * (e.g. `bg-surface`) and let the CSS variables resolve themselves. The
 * theme is therefore set in exactly one place — here — by writing to
 * <html data-theme>.
 */
export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  /** Initial theme — usually decided by route group (console=dark, portal=light). */
  initial: Theme;
  children: ReactNode;
}

export const ThemeProvider = ({ initial, children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return ctx;
};
