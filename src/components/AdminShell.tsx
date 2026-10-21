import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { navigate } from '../router/router';
import { LanguageSwitcher, ThemeSwitcher } from './Switchers';
import './AdminShell.css';

interface AdminShellProps {
  children: ReactNode;
}

export default function AdminShell({ children }: AdminShellProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [signOutError, setSignOutError] = useState(false);

  const handleSignOut = async () => {
    try {
      const error = await signOut();
      if (error) {
        setSignOutError(true);
        return;
      }
      setSignOutError(false);
      navigate({ name: 'home' });
    } catch {
      setSignOutError(true);
    }
  };

  return (
    <div className="admin-workspace">
      <header className="admin-workspace__header">
        <div className="admin-workspace__identity">
          <span className="admin-workspace__mark" aria-hidden="true">SP</span>
          <div>
            <p className="admin-workspace__eyebrow">SimePark</p>
            <h1>{t('admin.workspaceLabel')}</h1>
          </div>
        </div>
        <div className="admin-workspace__tools">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => navigate({ name: 'home' })}
            title={t('nav.home')}
          >
            ← {t('nav.home')}
          </button>
          <LanguageSwitcher compact />
          <ThemeSwitcher compact />
          {user && (
            <>
              <span className="admin-workspace__email">{user.email}</span>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleSignOut()}>
                {t('nav.signOut')}
              </button>
            </>
          )}
        </div>
        {signOutError && <p className="admin-workspace__error" role="alert">{t('auth.errors.generic')}</p>}
      </header>

      <main className="admin-workspace__main" id="main">
        {children}
      </main>
    </div>
  );
}
