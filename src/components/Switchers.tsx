/**
 * Language and theme switchers.
 *
 * Both are rendered as a labelled group of buttons rather than a `<select>`,
 * because there are only two or three fixed options and a segmented control is
 * faster to operate and easier to read in the header. Each option is a real
 * button with `aria-pressed`, so the state is announced and keyboard-operable.
 *
 * The current value is always shown as text, never by colour alone.
 */

import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, normalizeLanguage, persistLanguage, applyHtmlLang, type SupportedLanguage } from '../i18n';
import { useTheme, type ThemePreference } from '../theme/ThemeProvider';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const active = normalizeLanguage(i18n.language) ?? 'en';

  const change = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
    persistLanguage(language);
    applyHtmlLang(language);
  };

  return (
    <div className={`switcher${compact ? ' switcher--compact' : ''}`}>
      <span className="switcher__label" id="language-switcher-label">
        {t('controls.language')}
      </span>
      <div
        className="switcher__options"
        role="group"
        aria-labelledby="language-switcher-label"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <button
            key={language}
            type="button"
            className={`switcher__option${language === active ? ' is-active' : ''}`}
            aria-pressed={language === active}
            onClick={() => change(language)}
            lang={language === 'zh' ? 'zh-Hans' : language}
          >
            {compact ? language.toUpperCase() : LANGUAGE_LABELS[language]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  const options: Array<{ value: ThemePreference; label: string; glyph: string }> = [
    { value: 'light', label: t('controls.themeLight'), glyph: '☀' },
    { value: 'dark', label: t('controls.themeDark'), glyph: '☾' },
    { value: 'system', label: t('controls.themeSystem'), glyph: '⌾' },
  ];

  return (
    <div className={`switcher${compact ? ' switcher--compact' : ''}`}>
      <span className="switcher__label" id="theme-switcher-label">
        {t('controls.theme')}
      </span>
      <div className="switcher__options" role="group" aria-labelledby="theme-switcher-label">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`switcher__option${preference === option.value ? ' is-active' : ''}`}
            aria-pressed={preference === option.value}
            onClick={() => setPreference(option.value)}
            title={option.label}
          >
            {/* The glyph is decorative; the accessible name is the label text. */}
            <span aria-hidden="true">{option.glyph}</span>
            <span className={compact ? 'sr-only' : ''}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
