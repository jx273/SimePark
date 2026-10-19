import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { navigate, type Route } from '../router/router';
import { LanguageSwitcher, ThemeSwitcher } from './Switchers';
import './Sidebar.css';

export type AppSection =
  | 'home'
  | 'affordability'
  | 'properties'
  | 'compare'
  | 'simulator'
  | 'bank-rates'
  | 'assistant'
  | 'dashboard'
  | 'admin';

interface SidebarProps {
  route: Route;
  open: boolean;
  collapsed: boolean;
  activeSection: string;
  onToggleCollapsed: () => void;
  onClose: () => void;
  onNavigateSection: (section: string) => void;
}

const SECTION_ITEMS: Array<{ id: AppSection; key: string; icon: string; homeSection?: string }> = [
  { id: 'home', key: 'nav.home', icon: '⌂' },
  { id: 'affordability', key: 'nav.affordability', icon: '◇', homeSection: 'affordability' },
  { id: 'properties', key: 'nav.properties', icon: '▦', homeSection: 'properties' },
  { id: 'compare', key: 'nav.compare', icon: '⇄', homeSection: 'compare' },
  { id: 'simulator', key: 'nav.simulator', icon: '◷', homeSection: 'simulator' },
  { id: 'bank-rates', key: 'nav.bankRates', icon: '%', homeSection: 'bank-rates' },
  { id: 'assistant', key: 'nav.assistant', icon: '✦', homeSection: 'assistant' },
];

export default function Sidebar({
  route,
  open,
  collapsed,
  activeSection,
  onToggleCollapsed,
  onClose,
  onNavigateSection,
}: SidebarProps) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();

  const goHomeSection = (section: string) => {
    onClose();
    if (route.name === 'home') {
      onNavigateSection(section);
      return;
    }
    navigate({ name: 'home' });
    window.setTimeout(() => onNavigateSection(section), 140);
  };

  const currentFor = (item: (typeof SECTION_ITEMS)[number]) => {
    if (route.name === 'dashboard' || route.name === 'admin') return false;
    if (item.id === 'home') {
      return route.name === 'property' || (route.name === 'home' && activeSection === 'home');
    }
    return route.name === 'home' && activeSection === (item.homeSection ?? item.id);
  };

  return (
    <>
      {open && <button type="button" className="app-sidebar__backdrop" aria-label={t('nav.closeMenu')} onClick={onClose} />}
      <aside
        id="app-sidebar"
        className={`app-sidebar${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
        aria-label={t('nav.menu')}
      >
        <button
          type="button"
          className="app-sidebar__collapse"
          aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          aria-expanded={!collapsed}
          title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          onClick={onToggleCollapsed}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
          <span className="app-sidebar__collapse-label">
            {collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          </span>
        </button>
        <nav className="app-sidebar__nav">
          {SECTION_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="app-sidebar__link"
              aria-label={t(item.key)}
              title={t(item.key)}
              aria-current={currentFor(item) ? 'page' : undefined}
              onClick={() => {
                if (item.id === 'home') {
                  onClose();
                  navigate({ name: 'home' });
                  onNavigateSection('hero');
                  return;
                }
                goHomeSection(item.homeSection ?? item.id);
              }}
            >
              <span className="app-sidebar__icon" aria-hidden="true">{item.icon}</span>
              <span className="app-sidebar__label">{t(item.key)}</span>
            </button>
          ))}
          {user ? (
            <button
              type="button"
              className="app-sidebar__link"
              aria-label={t('nav.saved')}
              title={t('nav.saved')}
              aria-current={route.name === 'dashboard' ? 'page' : undefined}
              onClick={() => {
                onClose();
                navigate({ name: 'dashboard' });
              }}
            >
              <span className="app-sidebar__icon" aria-hidden="true">♡</span>
              <span className="app-sidebar__label">{t('nav.saved')}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="app-sidebar__link"
                aria-label={t('nav.signIn')}
                title={t('nav.signIn')}
                aria-current={route.name === 'auth' && route.mode === 'signin' ? 'page' : undefined}
                onClick={() => {
                  onClose();
                  navigate({ name: 'auth', mode: 'signin' });
                }}
              >
                <span className="app-sidebar__icon" aria-hidden="true">↪</span>
                <span className="app-sidebar__label">{t('nav.signIn')}</span>
              </button>
              <button
                type="button"
                className="app-sidebar__link"
                aria-label={t('nav.signUp')}
                title={t('nav.signUp')}
                aria-current={route.name === 'auth' && route.mode === 'signup' ? 'page' : undefined}
                onClick={() => {
                  onClose();
                  navigate({ name: 'auth', mode: 'signup' });
                }}
              >
                <span className="app-sidebar__icon" aria-hidden="true">＋</span>
                <span className="app-sidebar__label">{t('nav.signUp')}</span>
              </button>
            </>
          )}
          {user && isAdmin && (
            <button
              type="button"
              className="app-sidebar__link"
              aria-label={t('nav.admin')}
              title={t('nav.admin')}
              aria-current={route.name === 'admin' ? 'page' : undefined}
              onClick={() => {
                onClose();
                navigate({ name: 'admin' });
              }}
            >
              <span className="app-sidebar__icon" aria-hidden="true">⚙</span>
              <span className="app-sidebar__label">{t('nav.admin')}</span>
            </button>
          )}
        </nav>
        <div className="app-sidebar__switchers">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </aside>
    </>
  );
}
