import { useTranslation } from 'react-i18next';
import { navigate } from '../router/router';
import './StaticPage.css';

/**
 * Privacy and data page.
 *
 * Describes what the application actually does. It deliberately does not claim
 * legal compliance: no assessment of the Malaysian Personal Data Protection Act
 * or any other regime has been carried out, and the closing note says so.
 */
export default function PrivacyPage() {
  const { t } = useTranslation();

  const sections = [
    { title: t('privacy.storedTitle'), text: t('privacy.storedText') },
    { title: t('privacy.accountTitle'), text: t('privacy.accountText') },
    { title: t('privacy.aiTitle'), text: t('privacy.aiText') },
    { title: t('privacy.notStoredTitle'), text: t('privacy.notStoredText') },
    { title: t('privacy.deletionTitle'), text: t('privacy.deletionText') },
  ];

  return (
    <div className="container static-page">
      <h1 className="section__title">{t('privacy.title')}</h1>
      <p className="section__subtitle">{t('privacy.subtitle')}</p>

      <div className="static-page__body surface">
        {sections.map((section) => (
          <section className="static-page__section" key={section.title}>
            <h2 className="static-page__section-title">{section.title}</h2>
            <p className="static-page__text">{section.text}</p>
          </section>
        ))}

        <p className="static-page__note">{t('privacy.complianceNote')}</p>
      </div>

      <button
        type="button"
        className="btn btn--secondary mt-lg"
        onClick={() => navigate({ name: 'home' })}
      >
        {t('errors.goHome')}
      </button>
    </div>
  );
}
