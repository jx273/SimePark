import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import {
  EMPTY_ADJUSTMENTS,
  NEUTRAL_BASE,
  runScenario,
  type ScenarioAdjustments,
} from '../utils/simulator';
import { calculateMonthlyMortgage, formatMYR, formatPercentage } from '../utils/mortgage';
import { useAnimatedNumber, useScrollReveal } from '../hooks/interactions';
import './ScenarioSimulator.css';

interface ScenarioSimulatorProps {
  /** Inputs submitted in the main calculator, if any. */
  baseInputs: AffordabilityInputs | null;
  /** Result of the main calculator, used to label the starting point. */
  baseResult: AffordabilityResult | null;
  onSaveScenario?: (name: string, inputs: AffordabilityInputs) => void;
  canSave?: boolean;
  importedRate?: number | null;
  onClearImportedRate?: () => void;
}

/** Read a numeric field, treating an empty box as "no override". */
function readOverride(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ScenarioSimulator({
  baseInputs,
  baseResult,
  onSaveScenario,
  canSave = false,
  importedRate = null,
  onClearImportedRate,
}: ScenarioSimulatorProps) {
  const { t } = useTranslation();
  const reveal = useScrollReveal<HTMLElement>();

  const base = baseInputs ?? NEUTRAL_BASE;
  const scenarioBase =
    importedRate === null ? base : { ...base, annualInterestRate: importedRate };
  const usingSubmittedFigures = Boolean(baseInputs && baseResult);

  const [adjustments, setAdjustments] = useState<ScenarioAdjustments>(EMPTY_ADJUSTMENTS);
  const [scenarioName, setScenarioName] = useState('');
  const [comparisonRate, setComparisonRate] = useState<number | null>(null);
  const [comparisonName, setComparisonName] = useState('');
  const [comparisonSource, setComparisonSource] = useState('');
  const [comparisonRateType, setComparisonRateType] = useState('');
  const [comparisonVerifiedDate, setComparisonVerifiedDate] = useState('');

  useEffect(() => {
    if (importedRate !== null) {
      setAdjustments((current) =>
        current.annualInterestRate === null
          ? current
          : { ...current, annualInterestRate: null }
      );
    }
  }, [importedRate]);

  const outcome = useMemo(
    () => runScenario(scenarioBase, adjustments),
    [scenarioBase, adjustments]
  );

  const animatedMaxPrice = useAnimatedNumber(outcome.result.estimatedMaxPropertyPrice);
  const animatedBudget = useAnimatedNumber(outcome.result.estimatedMortgageBudget);

  const update = <K extends keyof ScenarioAdjustments>(key: K, value: ScenarioAdjustments[K]) => {
    setAdjustments((previous) => ({ ...previous, [key]: value }));
  };

  const reset = () => {
    setAdjustments(EMPTY_ADJUSTMENTS);
    setScenarioName('');
    onClearImportedRate?.();
  };

  const { result, priceFit } = outcome;
  const comparisonPrincipal =
    adjustments.targetPrice !== null && adjustments.targetPrice > 0
      ? Math.max(0, adjustments.targetPrice - Math.min(outcome.inputs.downPayment, adjustments.targetPrice))
      : baseResult?.estimatedMaxLoanPrincipal ?? 0;
  const baseComparisonPayment = calculateMonthlyMortgage(
    comparisonPrincipal,
    outcome.inputs.annualInterestRate,
    outcome.inputs.loanTenureYears
  );
  const manualComparisonPayment =
    comparisonRate === null
      ? null
      : calculateMonthlyMortgage(
          comparisonPrincipal,
          comparisonRate,
          outcome.inputs.loanTenureYears
        );
  const comparisonMonths = outcome.inputs.loanTenureYears * 12;
  const baseTotalInterest = Math.max(
    0,
    baseComparisonPayment * comparisonMonths - comparisonPrincipal
  );
  const manualTotalInterest =
    manualComparisonPayment === null
      ? null
      : Math.max(0, manualComparisonPayment * comparisonMonths - comparisonPrincipal);

  if (!usingSubmittedFigures) {
    return (
      <section className={`simulator section${reveal.isVisible ? ' is-visible' : ''}`} id="simulator" ref={reveal.ref}>
        <div className={`container ${reveal.className}`}>
          <h2 className="section__title text-center">{t('simulator.title')}</h2>
          <p className="section__subtitle section__subtitle--center">{t('simulator.subtitle')}</p>
          <div className="simulator__panel surface" role="status">
            <p>{t('simulator.noCalculation')}</p>
            <a className="btn btn--primary" href="#affordability">
              {t('affordability.sectionTitle')}
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`simulator section${reveal.isVisible ? ' is-visible' : ''}`} id="simulator" ref={reveal.ref}>
      <div className={`container ${reveal.className}`}>
        <h2 className="section__title text-center">{t('simulator.title')}</h2>
        <p className="section__subtitle section__subtitle--center">{t('simulator.subtitle')}</p>

        <div className="simulator__grid">
          {/* ---------------- Adjustments ---------------- */}
          <form className="simulator__panel surface" onSubmit={(event) => event.preventDefault()}>
            <h3 className="simulator__panel-title">{t('simulator.adjustments')}</h3>

            <p className="simulator__base-note">
              <strong>{t('simulator.base')}:</strong>{' '}
              {usingSubmittedFigures ? t('simulator.baseFromForm') : t('simulator.baseDefault')}
            </p>
            {importedRate !== null && (
              <p className="simulator__base-note" role="status">
              {t('simulator.importedRateNote')}
              </p>
            )}

            <div className="simulator__fields">
              <label className="form-group">
                <span className="form-label">{t('simulator.extraCash')}</span>
                <input
                  type="number"
                  className="form-input"
                  step="1000"
                  value={adjustments.extraCash === 0 ? '' : adjustments.extraCash}
                  placeholder="0"
                  onChange={(event) => update('extraCash', readOverride(event.target.value) ?? 0)}
                />
              </label>

              <label className="form-group">
                <span className="form-label">{t('simulator.priceChange')}</span>
                <input
                  type="number"
                  className="form-input"
                  step="10000"
                  min="0"
                  value={adjustments.targetPrice ?? ''}
                  placeholder={t('simulator.pricePlaceholder')}
                  onChange={(event) => update('targetPrice', readOverride(event.target.value))}
                />
              </label>

              <label className="form-group">
                <span className="form-label">{t('simulator.incomeChange')}</span>
                <input
                  type="number"
                  className="form-input"
                  step="100"
                  min="0"
                  value={adjustments.monthlyIncome ?? ''}
                  placeholder={String(base.monthlyIncome)}
                  onChange={(event) => update('monthlyIncome', readOverride(event.target.value))}
                />
              </label>

              <label className="form-group">
                <span className="form-label">{t('simulator.debtsChange')}</span>
                <input
                  type="number"
                  className="form-input"
                  step="100"
                  min="0"
                  value={adjustments.monthlyDebts ?? ''}
                  placeholder={String(base.monthlyDebts)}
                  onChange={(event) => update('monthlyDebts', readOverride(event.target.value))}
                />
              </label>

              <label className="form-group">
                <span className="form-label">{t('simulator.tenureChange')}</span>
                <input
                  type="number"
                  className="form-input"
                  step="1"
                  min="1"
                  max="40"
                  value={adjustments.loanTenureYears ?? ''}
                  placeholder={String(base.loanTenureYears)}
                  onChange={(event) => update('loanTenureYears', readOverride(event.target.value))}
                />
              </label>

              <label className="form-group">
                <span className="form-label">{t('simulator.rateChange')}</span>
                <input
                  type="number"
                  className="form-input"
                  step="0.1"
                  min="0"
                  max="20"
                  value={adjustments.annualInterestRate ?? (importedRate ?? '')}
                  placeholder={String(base.annualInterestRate)}
                  onChange={(event) => update('annualInterestRate', readOverride(event.target.value))}
                />
              </label>
            </div>

            <div className="simulator__actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={reset}>
                {t('simulator.reset')}
              </button>
              {canSave && onSaveScenario && (
                <div className="simulator__save">
                  <label className="sr-only" htmlFor="simulator-scenario-name">
                    {t('dashboard.scenarioName')}
                  </label>
                  <input
                    id="simulator-scenario-name"
                    type="text"
                    className="form-input form-input--sm"
                    value={scenarioName}
                    maxLength={80}
                    placeholder={t('dashboard.scenarioNamePlaceholder')}
                    onChange={(event) => setScenarioName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={scenarioName.trim().length === 0}
                    onClick={() => {
                      onSaveScenario(scenarioName.trim(), outcome.inputs);
                      setScenarioName('');
                    }}
                  >
                    {t('dashboard.saveScenario')}
                  </button>
                </div>
              )}
            </div>
          </form>

          {/* ---------------- Outcome ---------------- */}
          <div className="simulator__panel simulator__panel--outcome surface">
            <h3 className="simulator__panel-title">{t('simulator.outcome')}</h3>

            <div className="simulator__figures">
              <div className="simulator__figure">
                <span className="simulator__figure-label">{t('simulator.maxPrice')}</span>
                <span className="simulator__figure-value value-updated" key={Math.round(animatedMaxPrice)}>
                  {result.hasViableBudget ? formatMYR(animatedMaxPrice) : '—'}
                </span>
              </div>
              <div className="simulator__figure">
                <span className="simulator__figure-label">{t('simulator.mortgageBudget')}</span>
                <span className="simulator__figure-value value-updated" key={Math.round(animatedBudget)}>
                  {formatMYR(animatedBudget)}
                </span>
              </div>
              <div className="simulator__figure">
                <span className="simulator__figure-label">{t('simulator.bindingLabel')}</span>
                <span className="simulator__figure-value">
                  {t(`binding.${result.bindingConstraint}`)}
                </span>
              </div>
            </div>

            {/* The binding constraint is a database-free, deterministic value, so
                it is labelled directly rather than interpreted. */}
            {priceFit && (
              <div className={`simulator__fit simulator__fit--${priceFit.status}`}>
                <h4 className="simulator__fit-title">
                  {t('detail.price')}: {formatMYR(priceFit.price)}
                </h4>

                <dl className="simulator__fit-list">
                  <div>
                    <dt>{t('simulator.requiredCash')}</dt>
                    <dd>{formatMYR(priceFit.requiredDownPayment)}</dd>
                  </div>
                  <div>
                    <dt>{t('detail.availableCash')}</dt>
                    <dd>{formatMYR(priceFit.availableCash)}</dd>
                  </div>
                  <div>
                    <dt>{t('detail.loanPrincipal')}</dt>
                    <dd>{formatMYR(priceFit.loanPrincipal)}</dd>
                  </div>
                  <div>
                    <dt>{t('card.estMonthly')}</dt>
                    <dd>{formatMYR(priceFit.estimatedMonthlyRepayment)}</dd>
                  </div>
                  <div>
                    <dt>{t('results.mortgageBudget')}</dt>
                    <dd>{formatMYR(priceFit.monthlyBudget)}</dd>
                  </div>
                </dl>

                <ul className="simulator__fit-verdicts">
                  <li className={priceFit.fitsMonthlyBudget ? 'is-ok' : 'is-warn'}>
                    <span aria-hidden="true">{priceFit.fitsMonthlyBudget ? '✓' : '!'}</span>{' '}
                    {priceFit.fitsMonthlyBudget
                      ? t('simulator.fitsBudget')
                      : t('simulator.overBudget', {
                          amount: formatMYR(Math.abs(priceFit.monthlyDifference)),
                        })}
                  </li>
                  <li className={priceFit.cashCoversDownPayment ? 'is-ok' : 'is-warn'}>
                    <span aria-hidden="true">{priceFit.cashCoversDownPayment ? '✓' : '!'}</span>{' '}
                    {priceFit.cashCoversDownPayment
                      ? t('simulator.cashEnough')
                      : t('simulator.cashNotEnough', { amount: formatMYR(priceFit.cashGap) })}
                  </li>
                </ul>
              </div>
            )}

            <p className="simulator__note">
              {t('simulator.estimateNote')} {t('results.currentDsr')}:{' '}
              {formatPercentage(result.currentDSR)}.
            </p>

            <section className="simulator__bank-rates" aria-labelledby="bank-rate-title">
              <h3 id="bank-rate-title">{t('simulator.bankComparison')}</h3>
              <p>{t('simulator.noSuppliedRates')}</p>
              <div className="simulator__bank-fields">
                <label className="form-group">
                  <span className="form-label">{t('simulator.bankName')}</span>
                  <input
                    className="form-input"
                    value={comparisonName}
                    maxLength={100}
                    onChange={(event) => setComparisonName(event.target.value)}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('simulator.manualRate')}</span>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    max="20"
                    step="0.01"
                    value={comparisonRate ?? ''}
                    onChange={(event) => setComparisonRate(readOverride(event.target.value))}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('simulator.rateType')}</span>
                  <input
                    className="form-input"
                    value={comparisonRateType}
                    maxLength={80}
                    onChange={(event) => setComparisonRateType(event.target.value)}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('simulator.rateSource')}</span>
                  <input
                    className="form-input"
                    type="url"
                    value={comparisonSource}
                    onChange={(event) => setComparisonSource(event.target.value)}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">{t('simulator.rateVerifiedDate')}</span>
                  <input
                    className="form-input"
                    type="date"
                    value={comparisonVerifiedDate}
                    onChange={(event) => setComparisonVerifiedDate(event.target.value)}
                  />
                </label>
              </div>
              <p className="simulator__note">{t('simulator.manualRateWarning')}</p>
              {comparisonRate !== null && comparisonPrincipal > 0 && (
                <>
                  <p className="simulator__note">
                    {t('simulator.sameLoanAssumptions', {
                      principal: formatMYR(comparisonPrincipal),
                      years: outcome.inputs.loanTenureYears,
                    })}
                  </p>
                  <div className="simulator__rate-results">
                    <div>
                      <h4>{t('simulator.currentScenario')}</h4>
                      <p>{formatPercentage(outcome.inputs.annualInterestRate)} — {formatMYR(baseComparisonPayment)} / {t('simulator.month')}</p>
                      <p>{t('simulator.totalInterest')}: {formatMYR(baseTotalInterest)}</p>
                    </div>
                    <div>
                      <h4>{comparisonName.trim() || t('simulator.manualScenario')}</h4>
                      <p>{formatPercentage(comparisonRate)} — {formatMYR(manualComparisonPayment)} / {t('simulator.month')}</p>
                      <p>{t('simulator.totalInterest')}: {formatMYR(manualTotalInterest)}</p>
                      {comparisonRateType.trim() && <p>{t('simulator.rateType')}: {comparisonRateType}</p>}
                      {comparisonSource.trim() && /^https:\/\//i.test(comparisonSource) && (
                        <a href={comparisonSource} target="_blank" rel="noopener noreferrer">
                          {t('simulator.rateSource')}
                        </a>
                      )}
                      {comparisonVerifiedDate && <p>{t('simulator.rateVerifiedDate')}: {comparisonVerifiedDate}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => update('annualInterestRate', comparisonRate)}
                  >
                    {t('simulator.applyManualRate')}
                  </button>
                </>
              )}
              {comparisonRate !== null && comparisonPrincipal <= 0 && (
                <p role="status">{t('simulator.noLoanAmount')}</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
