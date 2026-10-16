/**
 * @vitest-environment happy-dom
 *
 * Theme resolution touches document and localStorage, so these run under a DOM.
 */
/// <reference types="vitest" />
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  isThemePreference,
  resolveTheme,
  resolveThemePreference,
} from '../ThemeProvider';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('theme preference parsing', () => {
  it('accepts only the three supported preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  it('defaults to following the system on a first visit', () => {
    expect(resolveThemePreference(null)).toBe('system');
    expect(resolveThemePreference(undefined)).toBe('system');
    expect(resolveThemePreference('nonsense')).toBe('system');
  });

  it('honours a stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(resolveThemePreference(localStorage.getItem(THEME_STORAGE_KEY))).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('follows the OS setting when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  // An explicit choice must win over the OS, otherwise the switcher looks broken.
  it('lets an explicit choice override the OS setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyResolvedTheme', () => {
  it('writes the theme to the document element', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    // Also tells the browser to render form controls and scrollbars to match.
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyResolvedTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
