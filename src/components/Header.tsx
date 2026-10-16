import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { navigate, type Route } from '../router/router';
import { LanguageSwitcher, ThemeSwitcher } from './Switchers';
import './Header.css';

interface HeaderProps {
  route: Route;
  /** Scroll to a section on the home page, navigating home first if needed. */
  onNavigateSection: (section: string) => void;
}

const SECTION_LINKS = [
  { id: 'affordability', key: 'nav.affordability' },
  { id: 'properties', key: 'nav.properties' },
  { id: 'simulator', key: 'nav.simulator' },
  { id: 'assistant', key: 'nav.assistant' },
  { id: 'about', key: 'nav.howItWorks' },
] as const;

export default function Header({ route, onNavigateSection }: HeaderProps) {
  const { t } = useTranslation();
  const { user, isAdmin, signOut, isConfigured } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuId = useId();

  // Tighten the bar once the page has scrolled, for a sense of depth.
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

  // Close transient menus whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [route]);

  // Escape closes the mobile menu, as expected of a disclosure.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const goHomeSection = (section: string) => {
    setMenuOpen(false);
    if (route.name === 'home') {
      onNavigateSection(section);
    } else {
      navigate({ name: 'home' });
      // Wait for the home page to mount before scrolling to its section.
      window.setTimeout(() => onNavigateSection(section), 140);
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
          }}
        >
          <span className="site-header__mark" aria-hidden="true">
            SP
          </span>
          <span className="site-header__wordmark">
            Sime<span className="site-header__wordmark-accent">Park</span>
          </span>
        </a>

        <nav className="site-header__nav" aria-label={t('nav.menu')}>
          <button
            type="button"
            className="site-header__link"
            onClick={() => navigate({ name: 'home' })}
            aria-current={route.name === 'home' ? 'page' : undefined}
          >
            {t('nav.home')}
          </button>
          {SECTION_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="site-header__link"
              onClick={() => goHomeSection(link.id)}
            >
              {t(link.key)}
            </button>
          ))}
          {user && (
            <button
              type="button"
              className="site-header__link"
              onClick={() => navigate({ name: 'dashboard' })}
              aria-current={route.name === 'dashboard' ? 'page' : undefined}
            >
              {t('nav.dashboard')}
            </button>
          )}
          {user && isAdmin && (
            <button
              type="button"
              className="site-header__link"
              onClick={() => navigate({ name: 'admin' })}
              aria-current={route.name === 'admin' ? 'page' : undefined}
            >
              {t('nav.admin')}
            </button>
          )}
        </nav>

        <div className="site-header__actions">
          {/* Switchers stay inline on desktop; on mobile they move into the menu
              so the bar cannot overflow on a narrow screen. */}
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
                    onClick={() => {
                      void signOut();
                      navigate({ name: 'home' });
                    }}
                  >
                    {t('nav.signOut')}
                  </button>
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
            aria-controls={menuId}
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="site-header__mobile" id={menuId}>
          <div className="container site-header__mobile-inner">
            <button
              type="button"
              className="site-header__mobile-link"
              onClick={() => navigate({ name: 'home' })}
            >
              {t('nav.home')}
            </button>
            {SECTION_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                className="site-header__mobile-link"
                onClick={() => goHomeSection(link.id)}
              >
                {t(link.key)}
              </button>
            ))}
            {user && (
              <button
                type="button"
                className="site-header__mobile-link"
                onClick={() => navigate({ name: 'dashboard' })}
              >
                {t('nav.dashboard')}
              </button>
            )}
            {user && isAdmin && (
              <button
                type="button"
                className="site-header__mobile-link"
                onClick={() => navigate({ name: 'admin' })}
              >
                {t('nav.admin')}
              </button>
            )}
            {!user && (
              <div className="site-header__mobile-auth">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => navigate({ name: 'auth', mode: 'signin' })}
                >
                  {t('nav.signIn')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate({ name: 'auth', mode: 'signup' })}
                >
                  {t('nav.signUp')}
                </button>
              </div>
            )}
            {!isConfigured && (
              <p className="site-header__mobile-note">{t('auth.errors.notConfigured')}</p>
            )}
            <div className="site-header__mobile-switchers">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
