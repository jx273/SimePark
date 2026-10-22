import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import {
  compareLoanRates,
  isUsableLoanAmount,
  type RateOrigin,
  type RateScenarioInput,
} from '../utils/bankRates';
import './BankRateComparison.css';

interface BankRateComparisonProps {
  baseInputs: AffordabilityInputs | null;
  baseResult: AffordabilityResult | null;
  onApplyRate?: (annualRate: number) => void;
}

interface DraftRate {
  label: string;
  annualRate: string;
  rateType: string;
  source: string;
  verifiedDate: string;
}

const EMPTY_DRAFT: DraftRate = {
  label: '',
  annualRate: '',
  rateType: '',
  source: '',
  verifiedDate: '',
};

export default function BankRateComparison({
  baseInputs,
  baseResult,
  onApplyRate,
}: BankRateComparisonProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DraftRate>(EMPTY_DRAFT);
  const [userRates, setUserRates] = useState<RateScenarioInput[]>([]);
  const [manualPrincipal, setManualPrincipal] = useState('');
  const [manualTenure, setManualTenure] = useState('');

  const calculatorPrincipal = baseResult?.estimatedMaxLoanPrincipal ?? 0;
  const calculatorTenure = baseInputs?.loanTenureYears ?? 0;
  const parsedPrincipal = Number(manualPrincipal);
  const parsedTenure = Number(manualTenure);
  const principal = isUsableLoanAmount(parsedPrincipal, parsedTenure || calculatorTenure)
    ? parsedPrincipal
    : calculatorPrincipal;
  const tenureYears = Number.isFinite(parsedTenure) && parsedTenure > 0 ? parsedTenure : calculatorTenure;

  const scenarios = useMemo(() => {
    const rows: RateScenarioInput[] = [];
    if (baseInputs) {
      rows.push({
        id: 'calculator',
        label: t('bankRates.calculatorRate'),
        annualRate: baseInputs.annualInterestRate,
        origin: 'calculator',
        rateType: null,
        source: t('bankRates.illustrativeAssumption'),
        verifiedDate: null,
      });
    }
    return [...rows, ...userRates];
  }, [baseInputs, userRates, t]);

  const compared = compareLoanRates(principal, tenureYears, scenarios);
  const ready = isUsableLoanAmount(principal, tenureYears);

  const addRate = (event: React.FormEvent) => {
    event.preventDefault();
    const annualRate = Number(draft.annualRate);
    if (!Number.isFinite(annualRate) || annualRate < 0) return;
    const next: RateScenarioInput = {
      id: `user-${Date.now()}`,
      label: draft.label.trim() || t('simulator.manualScenario'),
      annualRate,
      origin: 'user',
      rateType: draft.rateType.trim() || null,
      source: draft.source.trim() || null,
      verifiedDate: draft.verifiedDate.trim() || null,
    };
    setUserRates((current) => [...current, next]);
    setDraft(EMPTY_DRAFT);
  };

  const originLabel = (origin: RateOrigin) =>
    origin === 'calculator' ? t('bankRates.originCalculator') : t('bankRates.originUser');

  return (
    <section className="bank-rates section section--alt" id="bank-rates">
      <div className="container">
        <h2 className="section__title">{t('bankRates.title')}</h2>
        <p className="section__subtitle">{t('bankRates.subtitle')}</p>
        <p className="bank-rates__notice" role="note">
          {t('bankRates.noSuppliedRates')}
        </p>

        <div className="bank-rates__grid">
          <form className="bank-rates__panel surface" onSubmit={addRate}>
            <h3>{t('bankRates.loanAssumptions')}</h3>
            <label className="form-group">
              <span className="form-label">{t('bankRates.principal')}</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="1000"
                value={manualPrincipal}
                placeholder={calculatorPrincipal > 0 ? String(Math.round(calculatorPrincipal)) : ''}
                onChange={(event) => setManualPrincipal(event.target.value)}
              />
            </label>
            <label className="form-group">
              <span className="form-label">{t('simulator.tenureChange')}</span>
              <input
                className="form-input"
                type="number"
                min="1"
                max="40"
                value={manualTenure}
                placeholder={calculatorTenure > 0 ? String(calculatorTenure) : ''}
                onChange={(event) => setManualTenure(event.target.value)}
              />
            </label>
            <p className="form-helper">{t('bankRates.assumptionHelp')}</p>

            <h3>{t('bankRates.addRate')}</h3>
            <label className="form-group">
              <span className="form-label">{t('simulator.bankName')}</span>
              <input
                className="form-input"
                value={draft.label}
                maxLength={100}
                onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label className="form-group">
              <span className="form-label">
                {t('simulator.manualRate')} <span className="form-optional">({t('common.required')})</span>
              </span>
              <input
                className="form-input"
                type="number"
                min="0"
                max="20"
                step="0.01"
                required
                value={draft.annualRate}
                onChange={(event) => setDraft((current) => ({ ...current, annualRate: event.target.value }))}
              />
            </label>
            <label className="form-group">
              <span className="form-label">
                {t('simulator.rateType')} <span className="form-optional">({t('common.optional')})</span>
              </span>
              <input
                className="form-input"
                value={draft.rateType}
                maxLength={80}
                onChange={(event) => setDraft((current) => ({ ...current, rateType: event.target.value }))}
              />
            </label>
            <label className="form-group">
              <span className="form-label">
                {t('simulator.rateSource')} <span className="form-optional">({t('common.optional')})</span>
              </span>
              <input
                className="form-input"
                type="url"
                value={draft.source}
                onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
              />
            </label>
            <label className="form-group">
              <span className="form-label">
                {t('simulator.rateVerifiedDate')} <span className="form-optional">({t('common.optional')})</span>
              </span>
              <input
                className="form-input"
                type="date"
                value={draft.verifiedDate}
                onChange={(event) => setDraft((current) => ({ ...current, verifiedDate: event.target.value }))}
              />
            </label>
            <button type="submit" className="btn btn--primary">
              {t('bankRates.addRate')}
            </button>
            <p className="form-helper">{t('simulator.manualRateWarning')}</p>
          </form>

          <div className="bank-rates__panel surface">
            <div className="bank-rates__panel-header">
              <h3>{t('bankRates.results')}</h3>
            </div>
            {!ready ? (
              <p role="status">{t('bankRates.needLoanAmount')}</p>
            ) : compared.length === 0 ? (
              <p role="status">{t('bankRates.empty')}</p>
            ) : (
              <>
                <p className="form-helper">
                  {t('simulator.sameLoanAssumptions', {
                    principal: formatMYR(principal),
                    years: tenureYears,
                  })}
                </p>

                <div className="bank-rates__cards">
                  {compared.map((row) => {
                    const baseline = compared.find((r) => r.origin === 'calculator') ?? compared[0];
                    const diff = row.monthlyPayment - (baseline ? baseline.monthlyPayment : row.monthlyPayment);
                    return (
                      <div key={row.id} className="bank-rates__card">
                        <div className="bank-rates__card-header">
                          <div>
                            <h4 className="bank-rates__card-title">{row.label}</h4>
                            <span className="badge badge--type">{originLabel(row.origin)}</span>
                          </div>
                          <div className="bank-rates__card-rate">
                            <span className="bank-rates__rate-val">{formatPercentage(row.annualRate)}</span>
                            <span className="bank-rates__rate-lbl">{t('affordability.interestRate')}</span>
                          </div>
                        </div>

                        <div className="bank-rates__card-metrics">
                          <div className="bank-rates__metric">
                            <span className="bank-rates__metric-label">{t('card.estMonthly')}</span>
                            <span className="bank-rates__metric-value">{formatMYR(row.monthlyPayment)}</span>
                          </div>
                          <div className="bank-rates__metric">
                            <span className="bank-rates__metric-label">{t('bankRates.diffVsBaseline')}</span>
                            <span className="bank-rates__metric-value">
                              {diff === 0 ? (
                                <span className="bank-rates__diff-baseline">{t('bankRates.baseline')}</span>
                              ) : diff < 0 ? (
                                <span className="bank-rates__diff-save">
                                  {t('bankRates.savePerMonth', { amount: formatMYR(Math.abs(diff)) })}
                                </span>
                              ) : (
                                <span className="bank-rates__diff-more">
                                  {t('bankRates.morePerMonth', { amount: formatMYR(diff) })}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="bank-rates__metric">
                            <span className="bank-rates__metric-label">{t('simulator.totalInterest')}</span>
                            <span className="bank-rates__metric-value">{formatMYR(row.totalInterest)}</span>
                          </div>
                          <div className="bank-rates__metric">
                            <span className="bank-rates__metric-label">{t('simulator.rateType')}</span>
                            <span className="bank-rates__metric-value">{row.rateType ?? t('common.unknown')}</span>
                          </div>
                        </div>

                        {onApplyRate && (
                          <div className="bank-rates__card-actions">
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => onApplyRate(row.annualRate)}
                            >
                              {t('simulator.applyManualRate')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="form-helper" style={{ marginTop: 'var(--space-md)' }}>
                  {t('bankRates.repaymentNote')}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
