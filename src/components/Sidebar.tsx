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
  activeSection: string;
  onClose: () => void;
  onNavigateSection: (section: string) => void;
}

const SECTION_ITEMS: Array<{ id: AppSection; key: string; homeSection?: string }> = [
  { id: 'home', key: 'nav.home' },
  { id: 'affordability', key: 'nav.affordability', homeSection: 'affordability' },
  { id: 'properties', key: 'nav.properties', homeSection: 'properties' },
  { id: 'compare', key: 'nav.compare', homeSection: 'compare' },
  { id: 'simulator', key: 'nav.simulator', homeSection: 'simulator' },
  { id: 'bank-rates', key: 'nav.bankRates', homeSection: 'bank-rates' },
  { id: 'assistant', key: 'nav.assistant', homeSection: 'assistant' },
];

export default function Sidebar({
  route,
  open,
  activeSection,
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
    if (item.id === 'home') return route.name === 'home' && activeSection === 'home';
    return route.name === 'home' && activeSection === (item.homeSection ?? item.id);
  };

  return (
    <>
      {open && <button type="button" className="app-sidebar__backdrop" aria-label={t('nav.closeMenu')} onClick={onClose} />}
      <aside id="app-sidebar" className={`app-sidebar${open ? ' is-open' : ''}`} aria-label={t('nav.menu')}>
        <nav className="app-sidebar__nav">
          {SECTION_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="app-sidebar__link"
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
              {t(item.key)}
            </button>
          ))}
          {user ? (
            <button
              type="button"
              className="app-sidebar__link"
              aria-current={route.name === 'dashboard' ? 'page' : undefined}
              onClick={() => {
                onClose();
                navigate({ name: 'dashboard' });
              }}
            >
              {t('nav.saved')}
            </button>
          ) : (
            <button
              type="button"
              className="app-sidebar__link"
              onClick={() => {
                onClose();
                navigate({ name: 'auth', mode: 'signin' });
              }}
            >
              {t('nav.saved')}
            </button>
          )}
          {user && isAdmin && (
            <button
              type="button"
              className="app-sidebar__link"
              aria-current={route.name === 'admin' ? 'page' : undefined}
              onClick={() => {
                onClose();
                navigate({ name: 'admin' });
              }}
            >
              {t('nav.admin')}
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
