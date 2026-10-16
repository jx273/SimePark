import { useTranslation } from 'react-i18next';
import { navigate } from '../router/router';
import { LanguageSwitcher, ThemeSwitcher } from './Switchers';
import './Footer.css';

interface FooterProps {
  onNavigateSection: (section: string) => void;
}

export default function Footer({ onNavigateSection }: FooterProps) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const links = [
    { id: 'hero', key: 'nav.home' },
    { id: 'affordability', key: 'nav.affordability' },
    { id: 'properties', key: 'nav.properties' },
    { id: 'simulator', key: 'nav.simulator' },
    { id: 'assistant', key: 'nav.assistant' },
    { id: 'about', key: 'nav.howItWorks' },
  ];

  return (
    <footer className="footer" id="footer">
      <div className="brand-rule" aria-hidden="true" />
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <div className="footer__logo">
              <span className="footer__mark" aria-hidden="true">
                SP
              </span>
              <span className="footer__wordmark">
                Sime<span className="footer__wordmark-accent">Park</span>
              </span>
            </div>
            <p className="footer__tagline">{t('common.tagline')}</p>

            <div className="footer__switchers">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          </div>

          <nav className="footer__links" aria-label={t('footer.navigate')}>
            <h2 className="footer__links-title">{t('footer.navigate')}</h2>
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                className="footer__link"
                onClick={() => onNavigateSection(link.id)}
              >
                {t(link.key)}
              </button>
            ))}
            <button
              type="button"
              className="footer__link"
              onClick={() => navigate({ name: 'privacy' })}
            >
              {t('footer.privacyLink')}
            </button>
          </nav>

          <div className="footer__disclaimer-section">
            <h2 className="footer__links-title">{t('footer.notice')}</h2>
            <p className="footer__disclaimer-text">{t('footer.disclaimer')}</p>
            <p className="footer__disclaimer-text footer__disclaimer-text--notice">
              {t('footer.privacy')}
            </p>
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">{t('footer.copyright', { year })}</p>
        </div>
      </div>
    </footer>
  );
}
