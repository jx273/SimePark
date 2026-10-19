import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useSelection } from '../state/SelectionProvider';
import {
  deleteAllMyData,
  deleteScenario,
  getPreferences,
  listActivity,
  listScenarios,
  upsertPreferences,
  type ActivityEntry,
} from '../lib/userRepository';
import { navigate } from '../router/router';
import PropertyCard from '../components/PropertyCard';
import CompareTray from '../components/CompareTray';
import { formatMYR } from '../utils/mortgage';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import type { SavedScenarioRow } from '../lib/database.types';
import type { AffordabilityInputs } from '../types/affordability';
import type { Property, PropertyWithCalculations } from '../types/property';
import { calculateAffordability } from '../utils/affordability';
import { enrichPropertiesWithCalculations, toUncalculatedProperties } from '../utils/propertyFilter';
import { NEUTRAL_BASE } from '../utils/simulator';
import './DashboardPage.css';

type Tab = 'saved' | 'compare' | 'scenarios' | 'preferences' | 'activity' | 'account';

interface DashboardPageProps {
  /** Full catalogue, so saved items can be resolved to real records. */
  properties: Property[];
  onOpenProperty: (property: PropertyWithCalculations) => void;
  affordabilityInputs: AffordabilityInputs | null;
  /** Load a saved scenario back into the home-page calculator. */
  onLoadScenario: (inputs: AffordabilityInputs) => void;
}

export default function DashboardPage({
  properties,
  onOpenProperty,
  affordabilityInputs,
  onLoadScenario,
}: DashboardPageProps) {
  const { t, i18n } = useTranslation();
  const { user, isConfigured, isAdmin, signOut } = useAuth();
  const { savedIds, comparisonIds, isSaved, isCompared, toggleSaved, toggleCompared, clearComparison, comparisonFull } =
    useSelection();
  const { resolved } = useTheme();

  const [tab, setTab] = useState<Tab>('saved');
  const [scenarios, setScenarios] = useState<SavedScenarioRow[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [scenarioInputs, setScenarioInputs] = useState<AffordabilityInputs>(NEUTRAL_BASE);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enriched = useMemo(
    () =>
      affordabilityInputs
        ? enrichPropertiesWithCalculations(
            properties,
            affordabilityInputs,
            calculateAffordability(affordabilityInputs)
          )
        : toUncalculatedProperties(properties),
    [properties, affordabilityInputs]
  );

  const savedProperties = useMemo(
    () => enriched.filter((property) => savedIds.includes(property.id)),
    [enriched, savedIds]
  );

  const comparisonProperties = useMemo(
    () => enriched.filter((property) => comparisonIds.includes(property.id)),
    [enriched, comparisonIds]
  );

  const load = useCallback(async () => {
    if (!user || !isConfigured) return;

    const [scenarioResult, activityResult, preferenceResult] = await Promise.all([
      listScenarios(user.id),
      listActivity(user.id, 25),
      getPreferences(user.id),
    ]);

    if (scenarioResult.data) setScenarios(scenarioResult.data);
    if (activityResult.data) setActivity(activityResult.data);

    // Pre-fill the re-pricing baseline from stored preferences when available.
    if (preferenceResult.data) {
      const prefs = preferenceResult.data;
      setScenarioInputs({
        monthlyIncome: prefs.default_income ?? NEUTRAL_BASE.monthlyIncome,
        monthlyDebts: prefs.default_debts ?? NEUTRAL_BASE.monthlyDebts,
        downPayment: prefs.default_down_payment ?? NEUTRAL_BASE.downPayment,
        annualInterestRate: prefs.default_interest_rate ?? NEUTRAL_BASE.annualInterestRate,
        loanTenureYears: prefs.default_loan_tenure_years ?? NEUTRAL_BASE.loanTenureYears,
        preferredMaxMonthlyPayment: prefs.preferred_max_monthly ?? undefined,
        preferredLocation: prefs.preferred_location ?? undefined,
        minBedrooms: prefs.min_bedrooms ?? undefined,
      });
    }
  }, [user, isConfigured]);

  useEffect(() => {
    void load();
  }, [load]);

  const propertiesById = useMemo(() => {
    const map = new Map<string, Property>();
    for (const property of properties) map.set(property.id, property);
    return map;
  }, [properties]);

  if (!isConfigured) {
    return (
      <div className="container dashboard">
        <h1 className="section__title">{t('dashboard.title')}</h1>
        <div className="notice notice--warning" role="status">
          {t('auth.errors.notConfigured')}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container dashboard">
        <h1 className="section__title">{t('dashboard.title')}</h1>
        <div className="dashboard__gate surface">
          <p>{t('auth.signInSubtitle')}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate({ name: 'auth', mode: 'signin' })}
          >
            {t('auth.signIn')}
          </button>
        </div>
      </div>
    );
  }

  const persistPreferences = async () => {
    setBusy(true);
    const result = await upsertPreferences(user.id, {
      preferred_location: scenarioInputs.preferredLocation ?? null,
      min_bedrooms: scenarioInputs.minBedrooms ?? null,
      preferred_max_monthly: scenarioInputs.preferredMaxMonthlyPayment ?? null,
      default_income: scenarioInputs.monthlyIncome,
      default_debts: scenarioInputs.monthlyDebts,
      default_down_payment: scenarioInputs.downPayment,
      default_interest_rate: scenarioInputs.annualInterestRate,
      default_loan_tenure_years: scenarioInputs.loanTenureYears,
    });
    setBusy(false);
    setStatus(result.error ?? t('dashboard.accountSaved'));
    window.setTimeout(() => setStatus(null), 3500);
  };

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'saved', label: t('dashboard.tabs.saved'), count: savedProperties.length },
    { id: 'compare', label: t('dashboard.tabs.compare'), count: comparisonProperties.length },
    { id: 'scenarios', label: t('dashboard.tabs.scenarios'), count: scenarios.length },
    { id: 'preferences', label: t('dashboard.tabs.preferences') },
    { id: 'activity', label: t('dashboard.tabs.activity') },
    { id: 'account', label: t('dashboard.tabs.account') },
  ];

  return (
    <div className="container dashboard">
      <header className="dashboard__header">
        <div>
          <h1 className="section__title">{t('dashboard.title')}</h1>
          <p className="dashboard__welcome">
            {t('dashboard.welcome', {
              name: user.user_metadata?.display_name ?? user.email ?? '',
            })}
          </p>
          <p className="section__subtitle">{t('dashboard.subtitle')}</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => navigate({ name: 'admin' })}
          >
            {t('nav.admin')}
          </button>
        )}
      </header>

      {status && (
        <div className="notice notice--info" role="status">
          {status}
        </div>
      )}

      <div className="dashboard__tabs" role="tablist" aria-label={t('dashboard.title')}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            className={`dashboard__tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.count !== undefined && <span className="dashboard__tab-count">{entry.count}</span>}
          </button>
        ))}
      </div>

      <div className="dashboard__panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'saved' && (
          <>
            {savedProperties.length === 0 ? (
              <div className="empty-state">
                <h2 className="empty-state__title">{t('dashboard.savedEmpty')}</h2>
                <p className="empty-state__text">{t('dashboard.savedEmptyHint')}</p>
                <button
                  type="button"
                  className="btn btn--primary mt-lg"
                  onClick={() => navigate({ name: 'home' })}
                >
                  {t('explorer.title')}
                </button>
              </div>
            ) : (
              <div className="dashboard__grid">
                {savedProperties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onViewDetails={onOpenProperty}
                    isSaved={isSaved(property.id)}
                    isCompared={isCompared(property.id)}
                    onToggleSaved={toggleSaved}
                    onToggleCompared={toggleCompared}
                    comparisonFull={comparisonFull}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'compare' && (
          <CompareTray
            properties={comparisonProperties}
            onRemove={toggleCompared}
            onClear={clearComparison}
          />
        )}

        {tab === 'scenarios' && (
          <>
            {scenarios.length === 0 ? (
              <div className="empty-state">
                <h2 className="empty-state__title">{t('dashboard.scenariosEmpty')}</h2>
                <p className="empty-state__text">{t('dashboard.scenariosEmptyHint')}</p>
              </div>
            ) : (
              <ul className="dashboard__scenarios">
                {scenarios.map((scenario) => {
                  const inputs: AffordabilityInputs = {
                    monthlyIncome: Number(scenario.monthly_income),
                    monthlyDebts: Number(scenario.monthly_debts),
                    downPayment: Number(scenario.down_payment),
                    annualInterestRate: Number(scenario.interest_rate),
                    loanTenureYears: Number(scenario.loan_tenure_years),
                    preferredMaxMonthlyPayment: scenario.preferred_max_monthly
                      ? Number(scenario.preferred_max_monthly)
                      : undefined,
                  };
                  const estimate = calculateAffordability(inputs);

                  return (
                    <li className="dashboard__scenario surface" key={scenario.id}>
                      <div>
                        <h3 className="dashboard__scenario-name">{scenario.name}</h3>
                        <p className="dashboard__scenario-meta">
                          {t('dashboard.createdAt', {
                            date: new Date(scenario.created_at).toLocaleDateString(),
                          })}
                        </p>
                        <p className="dashboard__scenario-figures">
                          {t('simulator.maxPrice')}: {formatMYR(estimate.estimatedMaxPropertyPrice)} ·{' '}
                          {t('results.mortgageBudget')}: {formatMYR(estimate.estimatedMortgageBudget)}
                        </p>
                      </div>
                      <div className="dashboard__scenario-actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => {
                            onLoadScenario(inputs);
                            navigate({ name: 'home' });
                          }}
                        >
                          {t('dashboard.loadScenario')}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={async () => {
                            if (!window.confirm(t('dashboard.confirmDeleteScenario'))) return;
                            const result = await deleteScenario(user.id, scenario.id);
                            if (!result.error) {
                              setScenarios((previous) =>
                                previous.filter((entry) => entry.id !== scenario.id)
                              );
                            }
                          }}
                        >
                          {t('dashboard.deleteScenario')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'preferences' && (
          <form
            className="dashboard__form surface"
            onSubmit={(event) => {
              event.preventDefault();
              void persistPreferences();
            }}
          >
            <h2 className="dashboard__form-title">{t('dashboard.preferencesTitle')}</h2>
            <p className="form-helper">{t('dashboard.preferencesHelp')}</p>

            <div className="dashboard__form-grid">
              <label className="form-group">
                <span className="form-label">{t('affordability.monthlyIncome')}</span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={scenarioInputs.monthlyIncome}
                  onChange={(event) =>
                    setScenarioInputs((previous) => ({
                      ...previous,
                      monthlyIncome: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span className="form-label">{t('affordability.monthlyDebts')}</span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={scenarioInputs.monthlyDebts}
                  onChange={(event) =>
                    setScenarioInputs((previous) => ({
                      ...previous,
                      monthlyDebts: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span className="form-label">{t('affordability.downPayment')}</span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={scenarioInputs.downPayment}
                  onChange={(event) =>
                    setScenarioInputs((previous) => ({
                      ...previous,
                      downPayment: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span className="form-label">{t('affordability.interestRate')}</span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  step="0.1"
                  value={scenarioInputs.annualInterestRate}
                  onChange={(event) =>
                    setScenarioInputs((previous) => ({
                      ...previous,
                      annualInterestRate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span className="form-label">{t('affordability.loanTenure')}</span>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max="40"
                  value={scenarioInputs.loanTenureYears}
                  onChange={(event) =>
                    setScenarioInputs((previous) => ({
                      ...previous,
                      loanTenureYears: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="form-group">
                <span className="form-label">{t('affordability.preferredMonthlyPayment')}</span>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={scenarioInputs.preferredMaxMonthlyPayment ?? ''}
                  onChange={(event) =>
                    setScenarioInputs((previous) => ({
                      ...previous,
                      preferredMaxMonthlyPayment:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? t('common.saving') : t('dashboard.accountSave')}
            </button>
          </form>
        )}

        {tab === 'activity' && (
          <>
            {activity.length === 0 ? (
              <p className="dashboard__empty-text">{t('dashboard.activityEmpty')}</p>
            ) : (
              <ul className="dashboard__activity">
                {activity.map((entry) => {
                  const propertyName = entry.propertyId
                    ? propertiesById.get(entry.propertyId)?.propertyName ?? entry.propertyId
                    : '';
                  const label =
                    entry.action === 'saved'
                      ? t('dashboard.activitySaved', { name: propertyName })
                      : entry.action === 'compared'
                        ? t('dashboard.activityCompared', { name: propertyName })
                        : entry.action === 'scenario_saved'
                          ? t('dashboard.saveScenario')
                          : t('dashboard.activityViewed', { name: propertyName });

                  return (
                    <li className="dashboard__activity-item" key={entry.id}>
                      <span>{label}</span>
                      <time dateTime={entry.createdAt}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'account' && (
          <div className="dashboard__form surface">
            <h2 className="dashboard__form-title">{t('dashboard.accountTitle')}</h2>

            <dl className="dashboard__account">
              <div>
                <dt>{t('dashboard.accountEmail')}</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>{t('dashboard.accountLanguage')}</dt>
                <dd>{i18n.language}</dd>
              </div>
              <div>
                <dt>{t('dashboard.accountTheme')}</dt>
                <dd>{resolved}</dd>
              </div>
            </dl>

            <div className="dashboard__danger">
              <h3 className="dashboard__danger-title">{t('dashboard.dangerZone')}</h3>
              <p className="form-helper">{t('dashboard.dangerZoneHelp')}</p>
              <div className="dashboard__danger-actions">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    void signOut();
                    navigate({ name: 'home' });
                  }}
                >
                  {t('dashboard.signOutEverywhere')}
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(t('dashboard.confirmDeleteData'))) return;
                    setBusy(true);
                    const result = await deleteAllMyData(user.id);
                    setBusy(false);
                    if (result.error) setStatus(result.error);
                    else {
                      setScenarios([]);
                      setActivity([]);
                      window.location.reload();
                    }
                  }}
                >
                  {t('dashboard.deleteData')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The theme and language controls live in the header; this reassures the
          user that the values shown here are their live settings. */}
      <p className="dashboard__footnote">
        {t('controls.theme')}: {t(`controls.theme${resolved === 'dark' ? 'Dark' : 'Light'}`)} ·{' '}
        {t('controls.language')}: {SUPPORTED_LANGUAGES.includes(i18n.language as never) ? i18n.language : 'en'}
      </p>
    </div>
  );
}
