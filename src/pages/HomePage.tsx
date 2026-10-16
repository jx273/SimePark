import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Hero from '../components/Hero';
import AffordabilityForm from '../components/AffordabilityForm';
import AffordabilityResults from '../components/AffordabilityResults';
import PropertyExplorer from '../components/PropertyExplorer';
import ScenarioSimulator from '../components/ScenarioSimulator';
import AssistantChat from '../components/AssistantChat';
import HowItWorks from '../components/HowItWorks';
import CompareTray from '../components/CompareTray';
import { useAuth } from '../auth/AuthProvider';
import { useSelection } from '../state/SelectionProvider';
import { createScenario } from '../lib/userRepository';
import { calculateAffordability } from '../utils/affordability';
import { enrichPropertiesWithCalculations } from '../utils/propertyFilter';
import { NEUTRAL_BASE } from '../utils/simulator';
import { MAX_COMPARISON } from '../state/SelectionProvider';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import type { Property, PropertyWithCalculations } from '../types/property';

interface HomePageProps {
  /** Catalogue loaded from Supabase or the bundled demo dataset. */
  properties: Property[];
  /** True while the catalogue is still loading on first paint. */
  isLoading: boolean;
  catalogError: string | null;
  unpricedCount: number;
  onNavigateSection: (section: string) => void;
  onOpenProperty: (property: PropertyWithCalculations) => void;
}

export default function HomePage({
  properties,
  isLoading,
  catalogError,
  unpricedCount,
  onNavigateSection,
  onOpenProperty,
}: HomePageProps) {
  const { t } = useTranslation();
  const { user, isConfigured } = useAuth();
  const {
    savedIds,
    comparisonIds,
    isSaved,
    isCompared,
    toggleSaved,
    toggleCompared,
    clearComparison,
  } = useSelection();

  const [userInputs, setUserInputs] = useState<AffordabilityInputs | null>(null);
  const [affordabilityResult, setAffordabilityResult] = useState<AffordabilityResult | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const handleAffordabilitySubmit = useCallback(
    (inputs: AffordabilityInputs) => {
      setUserInputs(inputs);
      setAffordabilityResult(calculateAffordability(inputs));
      window.setTimeout(() => onNavigateSection('results'), 120);
    },
    [onNavigateSection]
  );

  const enrichedProperties: PropertyWithCalculations[] = useMemo(
    () =>
      userInputs && affordabilityResult
        ? enrichPropertiesWithCalculations(properties, userInputs, affordabilityResult)
        : [],
    [properties, userInputs, affordabilityResult]
  );

  /**
   * What the explorer lists. Before a personalised estimate exists the catalogue
   * is enriched against a neutral baseline, so guests see real prices, estimated
   * repayments and down-payment requirements while the explorer states plainly
   * that the budget status is not yet personalised.
   */
  const explorerProperties = useMemo(() => {
    if (enrichedProperties.length > 0) return enrichedProperties;
    return enrichPropertiesWithCalculations(
      properties,
      NEUTRAL_BASE,
      calculateAffordability(NEUTRAL_BASE)
    );
  }, [enrichedProperties, properties]);

  const comparisonProperties = useMemo(
    () => enrichedProperties.filter((property) => comparisonIds.includes(property.id)),
    [enrichedProperties, comparisonIds]
  );

  const handleSaveScenario = useCallback(
    async (name: string, inputs: AffordabilityInputs) => {
      if (!user || !isConfigured) return;

      const result = await createScenario({
        user_id: user.id,
        name,
        monthly_income: inputs.monthlyIncome,
        monthly_debts: inputs.monthlyDebts,
        down_payment: inputs.downPayment,
        interest_rate: inputs.annualInterestRate,
        loan_tenure_years: inputs.loanTenureYears,
        preferred_max_monthly: inputs.preferredMaxMonthlyPayment ?? null,
        // A snapshot so a saved scenario keeps the figures the user actually saw.
        result_snapshot: calculateAffordability(inputs) as unknown as Record<string, never>,
      });

      setSaveNotice(result.error ?? t('dashboard.accountSaved'));
      window.setTimeout(() => setSaveNotice(null), 4000);
    },
    [user, isConfigured, t]
  );

  return (
    <>
      <Hero
        onFindHome={() => onNavigateSection('affordability')}
        onExplore={() => onNavigateSection('properties')}
      />

      <AffordabilityForm
        onSubmit={handleAffordabilitySubmit}
        initialInputs={userInputs}
      />

      {affordabilityResult && <AffordabilityResults result={affordabilityResult} />}

      {/* Catalogue state is stated plainly: the user should know whether they are
          looking at the live database or the bundled demonstration records. */}
      {(catalogError || unpricedCount > 0 || (!isLoading && properties.length === 0)) && (
        <div className="container">
          <div className="notice notice--info" role="status">
            {isLoading && <p>{t('common.loading')}</p>}
            {catalogError && <p>{catalogError}</p>}
            {unpricedCount > 0 && (
              <p>
                {t('admin.missingField', { field: t('admin.fields.priceMYR') })}: {unpricedCount}
              </p>
            )}
            {!isLoading && properties.length === 0 && !catalogError && (
              <p>{t('explorer.emptyTitle')}</p>
            )}
          </div>
        </div>
      )}

      <PropertyExplorer
        // Enriched with the user's figures when they exist, and with the neutral
        // baseline otherwise, so guests can still browse real prices.
        properties={explorerProperties}
        totalCount={properties.length}
        preferences={userInputs}
        onViewDetails={onOpenProperty}
        isSaved={isSaved}
        isCompared={isCompared}
        onToggleSaved={toggleSaved}
        onToggleCompared={toggleCompared}
        comparisonFull={comparisonIds.length >= MAX_COMPARISON}
        hasPersonalisedEstimate={Boolean(affordabilityResult)}
        onGoToAffordability={() => onNavigateSection('affordability')}
      />

      <ScenarioSimulator
        baseInputs={userInputs}
        baseResult={affordabilityResult}
        onSaveScenario={handleSaveScenario}
        canSave={Boolean(user && isConfigured)}
      />

      <AssistantChat
        userInputs={userInputs}
        affordabilityResult={affordabilityResult}
        properties={enrichedProperties}
        selectedProperty={null}
        comparisonProperties={comparisonProperties}
        onNavigate={onNavigateSection}
      />

      <HowItWorks />

      <CompareTray
        properties={comparisonProperties}
        onRemove={toggleCompared}
        onClear={clearComparison}
      />

      {saveNotice && (
        <div className="toast" role="status">
          {saveNotice}
        </div>
      )}

      {/* Keeps the saved count visible for guests, who have no dashboard yet. */}
      {savedIds.length > 0 && !user && (
        <div className="toast toast--subtle" role="status">
          {t('dashboard.tabs.saved')}: {savedIds.length} · {t('common.localOnly')}
        </div>
      )}
    </>
  );
}
