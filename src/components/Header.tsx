import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { navigate, type Route } from '../router/router';
import { classifyAuthError } from '../lib/authErrors';
import { LanguageSwitcher, ThemeSwitcher } from './Switchers';
import './Header.css';

interface HeaderProps {
  route: Route;
  menuOpen: boolean;
  onToggleMenu: () => void;
}

export default function Header({ route, menuOpen, onToggleMenu }: HeaderProps) {
  const { t } = useTranslation();
  const { user, signOut, isConfigured } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ticking = false;
    const update = () => {
      ticking = false;
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setAccountOpen(false);
    setSignOutError(null);
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggleMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, onToggleMenu]);

  const handleSignOut = async () => {
    try {
      const error = await signOut();
      if (error) {
        setSignOutError(t(`auth.errors.${error}`));
        return;
      }
      navigate({ name: 'home' });
    } catch (cause) {
      const key =
        cause instanceof Error
          ? classifyAuthError({ message: cause.message })
          : 'generic';
      setSignOutError(t(`auth.errors.${key}`));
    }
  };

  return (
    <header className={`site-header glass${scrolled ? ' site-header--scrolled' : ''}`}>
      <div className="container site-header__inner">
        <a
          className="site-header__brand"
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            navigate({ name: 'home' });
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
            });
          }}
        >
          <span className="site-header__mark" aria-hidden="true">
            SP
          </span>
          <span className="site-header__wordmark">
            Sime<span className="site-header__wordmark-accent">Park</span>
          </span>
        </a>

        <div className="site-header__actions">
          <div className="site-header__switchers">
            <LanguageSwitcher compact />
            <ThemeSwitcher compact />
          </div>

          {user ? (
            <div className="site-header__account">
              <button
                type="button"
                className="site-header__account-button"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((open) => !open)}
              >
                <span className="site-header__avatar" aria-hidden="true">
                  {(user.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="site-header__account-email">{user.email}</span>
              </button>
              {accountOpen && (
                <div className="site-header__menu surface" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="site-header__menu-item"
                    onClick={() => navigate({ name: 'dashboard' })}
                  >
                    {t('nav.dashboard')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="site-header__menu-item"
                    onClick={() => void handleSignOut()}
                  >
                    {t('nav.signOut')}
                  </button>
                  {signOutError && (
                    <p className="site-header__menu-error" role="alert">
                      {signOutError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="site-header__auth">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => navigate({ name: 'auth', mode: 'signin' })}
              >
                {t('nav.signIn')}
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => navigate({ name: 'auth', mode: 'signup' })}
              >
                {t('nav.signUp')}
              </button>
            </div>
          )}

          <button
            type="button"
            className="site-header__burger"
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={onToggleMenu}
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>
      {!isConfigured && (
        <p className="sr-only">{t('auth.errors.notConfigured')}</p>
      )}
    </header>
  );
}
