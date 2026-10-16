/**
 * Shared test helpers.
 *
 * `createTestI18n` builds a real i18next instance with the production English
 * resources but without touching localStorage, `navigator`, or `document.lang`.
 * Using the real resources (rather than stub strings) means a component test
 * fails if a key is renamed or missing, which is the point.
 */

import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/locales/en';
import ms from '../i18n/locales/ms';
import zh from '../i18n/locales/zh';

export async function createTestI18n(
  language: 'en' | 'ms' | 'zh' = 'en'
): Promise<I18nInstance> {
  const instance = createInstance();

  await instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ms: { translation: ms },
      zh: { translation: zh },
    },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  return instance;
}
