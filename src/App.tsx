import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { SelectionProvider, useSelection } from './state/SelectionProvider';
import { useRoute, useScrollToTopOnRouteChange, navigate } from './router/router';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import AdminShell from './components/AdminShell';
import FloatingCompareBar from './components/FloatingCompareBar';
import AuthPage from './pages/AuthPage';
import PrivacyPage from './pages/PrivacyPage';
import NotFoundPage from './pages/NotFoundPage';
import { fetchCatalog } from './lib/propertyRepository';
import { enrichPropertiesWithCalculations } from './utils/propertyFilter';
import { toUncalculatedProperties } from './utils/propertyFilter';
import { calculateAffordability } from './utils/affordability';
import type { Property, PropertyWithCalculations } from './types/property';
import type { AffordabilityInputs } from './types/affordability';

const FINANCIAL_INPUTS_KEY = 'simepark.affordabilityInputs';

function readFinancialInputs(): AffordabilityInputs | null {
  try {
    const raw = localStorage.getItem(FINANCIAL_INPUTS_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const inputs = value as Partial<AffordabilityInputs>;
    const numeric = [
      inputs.monthlyIncome,
      inputs.monthlyDebts,
      inputs.downPayment,
      inputs.annualInterestRate,
      inputs.loanTenureYears,
    ];
    if (!numeric.every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
    return inputs as AffordabilityInputs;
  } catch {
    return null;
  }
}

/**
 * Application shell.
 *
 * Responsibilities kept here, and only here:
 *  - providers (theme, auth, selection);
 *  - route dispatch;
 *  - loading the property catalogue once;
 *  - owning the submitted affordability inputs so they survive navigation and are
 *    the single source of truth for the explorer, simulator, and assistant.
 *
 * The catalogue is enriched with a neutral baseline before the user submits the
 * form, so guests can browse real prices, repayments and down-payment
 * requirements without an estimate being implied. The explorer labels that state
 * explicitly and invites them to personalise it.
 */
function AppShell() {
  const { t } = useTranslation();
  const route = useRoute();
  const { comparisonIds } = useSelection();
  useScrollToTopOnRouteChange(route);

  const [catalog, setCatalog] = useState<Property[]>([]);
  const [catalogSource, setCatalogSource] = useState<'supabase' | 'bundled-source'>('supabase');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [unpricedCount, setUnpricedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [userInputs, setUserInputs] = useState<AffordabilityInputs | null>(readFinancialInputs);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const [importedRate, setImportedRate] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (userInputs) localStorage.setItem(FINANCIAL_INPUTS_KEY, JSON.stringify(userInputs));
      else localStorage.removeItem(FINANCIAL_INPUTS_KEY);
    } catch {
      // The live in-memory values still work when browser storage is unavailable.
    }
  }, [userInputs]);

  const affordabilityResult = useMemo(
    () => (userInputs ? calculateAffordability(userInputs) : null),
    [userInputs]
  );

  // Load the catalogue once. The repository uses the bundled source fixture only
  // when Supabase is unconfigured; a live database error stays visible.
  useEffect(() => {
    let active = true;

    void fetchCatalog().then((result) => {
      if (!active) return;
      setCatalog(result.properties);
      setCatalogSource(result.source);
      setUnpricedCount(result.unpriced);
      setCatalogError(result.error ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const scrollToSection = useCallback((section: string) => {
    setActiveSection(section === 'hero' ? 'home' : section);
    const element = document.getElementById(section);
    if (!element) {
      if (section === 'hero') {
        const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
      }
      return;
    }

    const headerHeight = 72;
    const top = element.getBoundingClientRect().top + window.scrollY - headerHeight;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    if (route.name !== 'home') return;

    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sections = [
          ['hero', 'home'],
          ['affordability', 'affordability'],
          ['properties', 'properties'],
          ['compare', 'compare'],
          ['simulator', 'simulator'],
          ['bank-rates', 'bank-rates'],
          ['assistant', 'assistant'],
        ] as const;
        const active = sections
          .filter(([id]) => {
            const element = document.getElementById(id);
            return element !== null && element.getBoundingClientRect().top <= 128;
          });
        const lastActive = active[active.length - 1];
        setActiveSection(lastActive?.[1] ?? 'home');
      });
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateActiveSection);
    };
  }, [route.name]);

  const catalogWithCalculations: PropertyWithCalculations[] = useMemo(
    () =>
      userInputs && affordabilityResult
        ? enrichPropertiesWithCalculations(catalog, userInputs, affordabilityResult)
        : toUncalculatedProperties(catalog),
    [catalog, userInputs, affordabilityResult]
  );

  /** Find an enriched record by id, or null when it is not in the catalogue. */
  const findEnriched = useCallback(
    (id: string): PropertyWithCalculations | null =>
      catalogWithCalculations.find((property) => property.id === id) ?? null,
    [catalogWithCalculations]
  );

  const findRaw = useCallback(
    (id: string): Property | null => catalog.find((property) => property.id === id) ?? null,
    [catalog]
  );

  const comparisonWithCalculations = useMemo(
    () => catalogWithCalculations.filter((property) => comparisonIds.includes(property.id)),
    [catalogWithCalculations, comparisonIds]
  );

  const openProperty = useCallback((property: PropertyWithCalculations) => {
    navigate({ name: 'property', id: property.id });
  }, []);

  const handleLoadScenario = useCallback((inputs: AffordabilityInputs) => {
    setUserInputs(inputs);
  }, []);

  const renderRoute = () => {
    switch (route.name) {
      case 'home':
        return (
          <HomePage
            properties={catalog}
            isLoading={isLoading}
            catalogError={catalogError}
            unpricedCount={unpricedCount}
            affordabilityInputs={userInputs}
            affordabilityResult={affordabilityResult}
            onSubmitAffordability={setUserInputs}
            onResetAffordability={() => {
              setUserInputs(null);
              setImportedRate(null);
            }}
            onNavigateSection={scrollToSection}
            onOpenProperty={openProperty}
            importedRate={importedRate}
            onImportRate={setImportedRate}
          />
        );

      case 'property':
        return (
          <PropertyDetailPage
            propertyId={route.id}
            property={findEnriched(route.id)}
            rawProperty={findRaw(route.id)}
            isLoading={isLoading}
            affordabilityInputs={userInputs}
            affordabilityResult={affordabilityResult}
            properties={catalogWithCalculations}
            comparisonProperties={comparisonWithCalculations}
          />
        );

      case 'dashboard':
        return (
          <DashboardPage
            properties={catalog}
            onOpenProperty={openProperty}
            onLoadScenario={handleLoadScenario}
            affordabilityInputs={userInputs}
          />
        );

      case 'admin':
        return <AdminPage />;

      case 'auth':
        return <AuthPage mode={route.mode} />;

      case 'privacy':
        return <PrivacyPage />;

      case 'notFound':
      default:
        return <NotFoundPage path={route.name === 'notFound' ? route.path : undefined} />;
    }
  };

  if (route.name === 'admin') {
    return (
      <AdminShell>
        <AdminPage />
      </AdminShell>
    );
  }

  return (
    <div className={`app${sidebarCollapsed ? ' app--sidebar-collapsed' : ''}`}>
      <p className="sr-only" role="status" aria-live="polite">
        {isLoading ? t('common.loading') : ''}
      </p>

      <Header
        route={route}
        menuOpen={navOpen}
        onToggleMenu={() => setNavOpen((open) => !open)}
      />

      <div className="app__body">
        <Sidebar
          route={route}
          open={navOpen}
          activeSection={activeSection}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
          onClose={() => setNavOpen(false)}
          onNavigateSection={scrollToSection}
        />
        <div className="app__content">
          <main id="main">{renderRoute()}</main>
          <Footer onNavigateSection={scrollToSection} />
        </div>
      </div>

      <FloatingCompareBar catalog={catalog} />

      {catalogSource === 'bundled-source' && !isLoading && <p className="sr-only">{t('common.localOnly')}</p>}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SelectionProvider>
          <AppShell />
        </SelectionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
