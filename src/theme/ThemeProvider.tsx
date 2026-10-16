/**
 * Theme (light / dark / system) handling.
 *
 * Deliberately dependency-free: it is a handful of localStorage writes plus one
 * attribute on <html>. A theming library would add weight without adding
 * capability here.
 *
 * The resolved theme is written to `document.documentElement[data-theme]`, which
 * is what the CSS token layers in `src/index.css` key off. Only the token layer
 * changes between themes, so no component needs theme-aware code.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const THEME_STORAGE_KEY = 'simepark.theme';

/** What the user chose. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually rendered once `system` is resolved. */
export type ResolvedTheme = 'light' | 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Read the stored preference. Defaults to `system` on a first visit. */
export function resolveThemePreference(stored: string | null | undefined): ThemePreference {
  return isThemePreference(stored) ? stored : 'system';
}

/** Resolve a preference against the OS setting. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/** True when the OS asks for a dark colour scheme. */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** True when the OS asks for reduced motion. */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Cycle light → dark → system, for a single-button switcher. */
  cycle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    return resolveThemePreference(
      typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null
    );
  } catch {
    // Storage can be unavailable in private browsing; fall back to system.
    return 'system';
  }
}

/** Apply a resolved theme to <html> and keep the meta colour-scheme in step. */
export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Tells the browser to render form controls and scrollbars to match.
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  // Follow the OS setting live, so `system` is not a one-time snapshot.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);

    // Safari below 14 only supports the deprecated addListener.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore: the choice simply will not persist.
    }
  }, []);

  const cycle = useCallback(() => {
    setPreferenceState((current) => {
      const next: ThemePreference =
        current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore.
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, cycle }),
    [preference, resolved, setPreference, cycle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Throws outside a provider so mistakes surface early. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return context;
}
