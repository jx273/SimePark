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
import BankRateComparison from '../components/BankRateComparison';
import { useAuth } from '../auth/AuthProvider';
import { useSelection } from '../state/SelectionProvider';
import { createScenario } from '../lib/userRepository';
import { calculateAffordability } from '../utils/affordability';
import { enrichPropertiesWithCalculations, toUncalculatedProperties } from '../utils/propertyFilter';
import { MAX_COMPARISON } from '../state/SelectionProvider';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import type { Property, PropertyWithCalculations } from '../types/property';

interface HomePageProps {
  /** Catalogue loaded from Supabase or the supplied unconfigured-dev fixture. */
  properties: Property[];
  /** True while the catalogue is still loading on first paint. */
  isLoading: boolean;
  catalogError: string | null;
  unpricedCount: number;
  affordabilityInputs: AffordabilityInputs | null;
  affordabilityResult: AffordabilityResult | null;
  onSubmitAffordability: (inputs: AffordabilityInputs) => void;
  onResetAffordability: () => void;
  onNavigateSection: (section: string) => void;
  onOpenProperty: (property: PropertyWithCalculations) => void;
  importedRate: number | null;
  onImportRate: (rate: number | null) => void;
}

export default function HomePage({
  properties,
  isLoading,
  catalogError,
  unpricedCount,
  affordabilityInputs,
  affordabilityResult,
  onSubmitAffordability,
  onResetAffordability,
  onNavigateSection,
  onOpenProperty,
  importedRate,
  onImportRate,
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

  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const handleAffordabilitySubmit = useCallback(
    (inputs: AffordabilityInputs) => {
      onSubmitAffordability(inputs);
      window.setTimeout(() => onNavigateSection('results'), 120);
    },
    [onNavigateSection, onSubmitAffordability]
  );

  const explorerProperties: PropertyWithCalculations[] = useMemo(
    () =>
      affordabilityInputs && affordabilityResult
        ? enrichPropertiesWithCalculations(properties, affordabilityInputs, affordabilityResult)
        : toUncalculatedProperties(properties),
    [properties, affordabilityInputs, affordabilityResult]
  );

  const comparisonProperties = useMemo(
    () => explorerProperties.filter((property) => comparisonIds.includes(property.id)),
    [explorerProperties, comparisonIds]
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
        initialInputs={affordabilityInputs}
        onReset={onResetAffordability}
      />

      {affordabilityResult && <AffordabilityResults result={affordabilityResult} />}

      {/* Catalogue state: show error or empty state if encountered */}
      {(catalogError || (!isLoading && properties.length === 0)) && (
        <div className="container">
          <div className="notice notice--info" role="status">
            {isLoading && <p>{t('common.loading')}</p>}
            {catalogError && <p>{catalogError}</p>}
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
        preferences={affordabilityInputs}
        onViewDetails={onOpenProperty}
        isSaved={isSaved}
        isCompared={isCompared}
        onToggleSaved={toggleSaved}
        onToggleCompared={toggleCompared}
        comparisonFull={comparisonIds.length >= MAX_COMPARISON}
        hasPersonalisedEstimate={Boolean(affordabilityResult)}
        onGoToAffordability={() => onNavigateSection('affordability')}
      />

      <CompareTray
        properties={comparisonProperties}
        onRemove={toggleCompared}
        onClear={clearComparison}
      />

      <ScenarioSimulator
        baseInputs={affordabilityInputs}
        baseResult={affordabilityResult}
        importedRate={importedRate}
        onClearImportedRate={() => onImportRate(null)}
        onSaveScenario={handleSaveScenario}
        canSave={Boolean(user && isConfigured)}
      />

      <BankRateComparison
        baseInputs={affordabilityInputs}
        baseResult={affordabilityResult}
        onApplyRate={(rate) => {
          onImportRate(rate);
          onNavigateSection('simulator');
        }}
      />

      <AssistantChat
        userInputs={affordabilityInputs}
        affordabilityResult={affordabilityResult}
        properties={explorerProperties}
        selectedProperty={null}
        comparisonProperties={comparisonProperties}
        onNavigate={onNavigateSection}
      />

      <HowItWorks />

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
