import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import {
  EMPTY_ADJUSTMENTS,
  NEUTRAL_BASE,
  runScenario,
  type ScenarioAdjustments,
} from '../utils/simulator';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import { useAnimatedNumber, useScrollReveal } from '../hooks/interactions';
import './ScenarioSimulator.css';

interface ScenarioSimulatorProps {
  /** Inputs submitted in the main calculator, if any. */
  baseInputs: AffordabilityInputs | null;
  /** Result of the main calculator, used to label the starting point. */
  baseResult: AffordabilityResult | null;
  onSaveScenario?: (name: string, inputs: AffordabilityInputs) => void;
  canSave?: boolean;
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
}: ScenarioSimulatorProps) {
  const { t } = useTranslation();
  const reveal = useScrollReveal<HTMLElement>();

  const base = baseInputs ?? NEUTRAL_BASE;
  const usingSubmittedFigures = Boolean(baseInputs && baseResult);

  const [adjustments, setAdjustments] = useState<ScenarioAdjustments>(EMPTY_ADJUSTMENTS);
  const [scenarioName, setScenarioName] = useState('');

  const outcome = useMemo(() => runScenario(base, adjustments), [base, adjustments]);

  const animatedMaxPrice = useAnimatedNumber(outcome.result.estimatedMaxPropertyPrice);
  const animatedBudget = useAnimatedNumber(outcome.result.estimatedMortgageBudget);

  const update = <K extends keyof ScenarioAdjustments>(key: K, value: ScenarioAdjustments[K]) => {
    setAdjustments((previous) => ({ ...previous, [key]: value }));
  };

  const reset = () => {
    setAdjustments(EMPTY_ADJUSTMENTS);
    setScenarioName('');
  };

  const { result, priceFit } = outcome;

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
                  value={adjustments.annualInterestRate ?? ''}
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
          </div>
        </div>
      </div>
    </section>
  );
}
