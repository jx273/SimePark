import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  normalizeLanguage,
  resolveInitialLanguage,
  LANGUAGE_HTML_LANG,
  LANGUAGE_LABELS,
} from '../index';
import en from '../locales/en';
import ms from '../locales/ms';
import zh from '../locales/zh';

/** Flatten a nested resource object into dotted key paths. */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

const enKeys = flattenKeys(en).sort();

describe('translation completeness', () => {
  it('ships all three supported languages', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['en', 'ms', 'zh']);
  });

  // This is the guard that stops a partially translated interface: if a key is
  // added to English and not translated, the build fails here rather than
  // silently showing English inside the Chinese or Malay UI.
  it.each([
    ['ms', ms],
    ['zh', zh],
  ])('%s has exactly the same keys as English', (_language, resource) => {
    const keys = flattenKeys(resource).sort();

    const missing = enKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !enKeys.includes(key));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  /**
   * `results.bindingExplanations.none` is intentionally empty: when nothing is
   * binding there is no sentence to show, and the UI renders nothing. It is
   * allow-listed explicitly rather than relaxing the rule for everything.
   */
  const INTENTIONALLY_EMPTY = new Set(['results.bindingExplanations.none']);

  it.each([
    ['ms', ms],
    ['zh', zh],
  ])('%s has no unintended empty strings', (_language, resource) => {
    const empties: string[] = [];

    const walk = (value: unknown, prefix = '') => {
      if (typeof value === 'string') {
        if (value.trim() === '' && !INTENTIONALLY_EMPTY.has(prefix)) empties.push(prefix);
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          walk(child, prefix ? `${prefix}.${key}` : key);
        }
      }
    };

    walk(resource);
    expect(empties).toEqual([]);
  });

  it('translates the interface rather than copying English', () => {
    // Spot-check a handful of high-traffic strings. If a translator had pasted
    // the English values wholesale these would be identical.
    expect(zh.nav.properties).not.toBe(en.nav.properties);
    expect(ms.nav.properties).not.toBe(en.nav.properties);
    expect(zh.affordability.submit).not.toBe(en.affordability.submit);
    expect(ms.affordability.submit).not.toBe(en.affordability.submit);
    expect(zh.status.withinBudget).not.toBe(en.status.withinBudget);
    expect(ms.status.withinBudget).not.toBe(en.status.withinBudget);
  });

  it('provides localized bank-rate comparison labels', () => {
    expect(en.bankRates.title).not.toBe('bankRates.title');
    expect(ms.bankRates.title).not.toBe(en.bankRates.title);
    expect(zh.bankRates.title).not.toBe(en.bankRates.title);
  });

  it('keeps interpolation placeholders intact in every language', () => {
    // A dropped {{count}} or {{amount}} would render a broken sentence.
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

    const compare = (a: unknown, b: unknown, path = '') => {
      if (typeof a === 'string' && typeof b === 'string') {
        expect({ path, placeholders: placeholders(b) }).toEqual({
          path,
          placeholders: placeholders(a),
        });
        return;
      }
      if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
        for (const key of Object.keys(a)) {
          compare(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key],
            path ? `${path}.${key}` : key
          );
        }
      }
    };

    compare(en, ms);
    compare(en, zh);
  });
});

describe('language normalisation', () => {
  it('maps regional tags to a supported language', () => {
    expect(normalizeLanguage('ms-MY')).toBe('ms');
    expect(normalizeLanguage('ms')).toBe('ms');
    expect(normalizeLanguage('zh-Hans-MY')).toBe('zh');
    expect(normalizeLanguage('zh-CN')).toBe('zh');
    expect(normalizeLanguage('en-GB')).toBe('en');
    expect(normalizeLanguage('en-MY')).toBe('en');
  });

  it('returns null for unsupported languages', () => {
    expect(normalizeLanguage('fr-FR')).toBeNull();
    expect(normalizeLanguage('ta')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });

  it('picks the first supported language from the browser list', () => {
    expect(detectBrowserLanguage(['fr-FR', 'ms-MY', 'en'])).toBe('ms');
    expect(detectBrowserLanguage(['zh-CN'])).toBe('zh');
    expect(detectBrowserLanguage(['en-US'])).toBe('en');
  });

  it('falls back to English when nothing matches', () => {
    expect(detectBrowserLanguage(['fr-FR', 'de-DE'])).toBe('en');
    expect(detectBrowserLanguage([])).toBe('en');
    expect(detectBrowserLanguage(undefined)).toBe('en');
  });
});

describe('initial language resolution', () => {
  it('resolves to a supported language without a stored preference', () => {
    expect(SUPPORTED_LANGUAGES).toContain(resolveInitialLanguage());
  });

  it('provides an html lang and a label for every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_HTML_LANG[language]).toBeTruthy();
      expect(LANGUAGE_LABELS[language]).toBeTruthy();
    }
    // Chinese must be tagged as Simplified so font fallback picks the right face.
    expect(LANGUAGE_HTML_LANG.zh).toContain('Hans');
  });
});
