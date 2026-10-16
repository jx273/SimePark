import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { SelectionProvider } from './state/SelectionProvider';
import { useRoute, useScrollToTopOnRouteChange, navigate } from './router/router';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import PrivacyPage from './pages/PrivacyPage';
import NotFoundPage from './pages/NotFoundPage';
import { fetchCatalog, bundledCatalog } from './lib/propertyRepository';
import { enrichPropertiesWithCalculations } from './utils/propertyFilter';
import { calculateAffordability } from './utils/affordability';
import { NEUTRAL_BASE } from './utils/simulator';
import type { Property, PropertyWithCalculations } from './types/property';
import type { AffordabilityInputs } from './types/affordability';

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
  useScrollToTopOnRouteChange(route);

  const [catalog, setCatalog] = useState<Property[]>(() => bundledCatalog().properties);
  const [catalogSource, setCatalogSource] = useState<'supabase' | 'bundled-demo'>('bundled-demo');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [unpricedCount, setUnpricedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [userInputs, setUserInputs] = useState<AffordabilityInputs | null>(null);

  // Load the catalogue once. A failure falls back to the bundled records rather
  // than leaving the page empty.
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
    const element = document.getElementById(section);
    if (!element) return;

    const headerHeight = 72;
    const top = element.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  // The explorer's baseline enrichment. Uses the submitted inputs when they
  // exist, and a neutral assumption otherwise.
  const catalogWithCalculations: PropertyWithCalculations[] = useMemo(() => {
    const baseline = userInputs ?? NEUTRAL_BASE;
    return enrichPropertiesWithCalculations(catalog, baseline, calculateAffordability(baseline));
  }, [catalog, userInputs]);

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
            onNavigateSection={scrollToSection}
            onOpenProperty={openProperty}
          />
        );

      case 'property':
        return (
          <PropertyDetailPage
            propertyId={route.id}
            property={findEnriched(route.id)}
            rawProperty={findRaw(route.id)}
            isLoading={isLoading}
          />
        );

      case 'dashboard':
        return (
          <DashboardPage
            properties={catalog}
            onOpenProperty={openProperty}
            onLoadScenario={handleLoadScenario}
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

  return (
    <div className="app">
      {/* Announce route changes to assistive technology. */}
      <p className="sr-only" role="status" aria-live="polite">
        {isLoading ? t('common.loading') : ''}
      </p>

      <Header route={route} onNavigateSection={scrollToSection} />

      <main id="main">{renderRoute()}</main>

      <Footer onNavigateSection={scrollToSection} />

      {/* Guests are told which catalogue they are seeing. This is the honest way
          to present bundled demonstration data. */}
      {catalogSource === 'bundled-demo' && !isLoading && (
        <p className="sr-only">{t('card.demoBanner')}</p>
      )}
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
