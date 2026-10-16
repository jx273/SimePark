import { useTranslation } from 'react-i18next';
import { navigate } from '../router/router';
import './StaticPage.css';

/** 404 page. Keeps the user oriented rather than dead-ending. */
export default function NotFoundPage({ path }: { path?: string }) {
  const { t } = useTranslation();

  return (
    <div className="container static-page">
      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">
          🧭
        </div>
        <h1 className="empty-state__title">{t('errors.notFoundTitle')}</h1>
        <p className="empty-state__text">{t('errors.notFoundText')}</p>
        {path && <p className="static-page__path">{path}</p>}
        <button
          type="button"
          className="btn btn--primary mt-lg"
          onClick={() => navigate({ name: 'home' })}
        >
          {t('errors.goHome')}
        </button>
      </div>
    </div>
  );
}
