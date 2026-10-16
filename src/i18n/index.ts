/**
 * i18n setup for SimePark.
 *
 * Design choices:
 *  - Resources are imported statically rather than lazy-loaded. The interface
 *    must render immediately in the stored language; a dynamic import would make
 *    the first paint wait on a network round trip, and the translation payload
 *    for three languages is small.
 *  - The selected language is persisted in `localStorage` under a single key that
 *    the theme module also uses for its own key, so both preferences survive a
 *    reload independently.
 *  - `fallbackLng` is English, but `src/i18n/__tests__` asserts that `ms` and
 *    `zh` are complete, so a missing key is a test failure rather than a silent
 *    English string in the Chinese interface.
 *  - Language detection reads `navigator.languages` so a Malaysian Chinese or
 *    Malay browser gets a sensible default on first visit.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ms from './locales/ms';
import zh from './locales/zh';

export const SUPPORTED_LANGUAGES = ['en', 'ms', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** localStorage key holding the user's language choice. */
export const LANGUAGE_STORAGE_KEY = 'simepark.language';

/** Map an arbitrary tag ('ms-MY', 'zh-Hans', 'en-GB') to a supported language. */
export function normalizeLanguage(tag: string | undefined | null): SupportedLanguage | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith('ms')) return 'ms';
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('en')) return 'en';
  return null;
}

/** First supported language implied by the browser, or English. */
export function detectBrowserLanguage(
  languages: readonly string[] | undefined
): SupportedLanguage {
  for (const tag of languages ?? []) {
    const match = normalizeLanguage(tag);
    if (match) return match;
  }
  return 'en';
}

/** Read the stored choice, falling back to the browser, then English. */
export function resolveInitialLanguage(): SupportedLanguage {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;
  } catch {
    // Private browsing or a blocked storage API: fall through to detection.
    stored = null;
  }

  const fromStore = normalizeLanguage(stored);
  if (fromStore) return fromStore;

  const nav =
    typeof navigator !== 'undefined'
      ? (navigator.languages ?? [navigator.language])
      : undefined;
  return detectBrowserLanguage(nav);
}

/** Persist the choice. Never throws if storage is unavailable. */
export function persistLanguage(language: SupportedLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore: the preference simply will not survive a reload.
  }
}

/** Human-readable language names, shown in their own script in the switcher. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  ms: 'Bahasa Melayu',
  zh: '简体中文',
};

/** HTML `lang` attribute per language, for correct font and hyphenation rules. */
export const LANGUAGE_HTML_LANG: Record<SupportedLanguage, string> = {
  en: 'en-MY',
  ms: 'ms-MY',
  zh: 'zh-Hans-MY',
};

/** Update <html lang> so screen readers and font selection follow the choice. */
export function applyHtmlLang(language: SupportedLanguage): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANGUAGE_HTML_LANG[language];
  }
}

const initialLanguage = resolveInitialLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ms: { translation: ms },
    zh: { translation: zh },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    // React already escapes rendered values.
    escapeValue: false,
  },
  returnNull: false,
});

applyHtmlLang(initialLanguage);

/**
 * The AI assistant replies in the UI language, so the resolved language is
 * exposed as a plain value for request payloads.
 */
export function currentLanguage(): SupportedLanguage {
  return normalizeLanguage(i18n.language) ?? 'en';
}

export default i18n;
