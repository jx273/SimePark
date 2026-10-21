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
            <h3>{t('bankRates.results')}</h3>
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
                <div className="bank-rates__table-wrap">
                  <table className="bank-rates__table">
                    <thead>
                      <tr>
                        <th>{t('bankRates.scenario')}</th>
                        <th>{t('affordability.interestRate')}</th>
                        <th>{t('simulator.rateType')}</th>
                        <th>{t('card.estMonthly')}</th>
                        <th>{t('bankRates.diffVsBaseline')}</th>
                        <th>{t('simulator.totalInterest')}</th>
                        <th>{t('bankRates.origin')}</th>
                        <th>{t('common.apply')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compared.map((row) => {
                        const baseline = compared.find((r) => r.origin === 'calculator') ?? compared[0];
                        const diff = row.monthlyPayment - (baseline ? baseline.monthlyPayment : row.monthlyPayment);
                        return (
                          <tr key={row.id}>
                            <td>{row.label}</td>
                            <td>{formatPercentage(row.annualRate)}</td>
                            <td>{row.rateType ?? t('common.unknown')}</td>
                            <td>{formatMYR(row.monthlyPayment)}</td>
                            <td>
                              {diff === 0 ? (
                                <span style={{ color: 'var(--color-text-muted)' }}>Baseline</span>
                              ) : diff < 0 ? (
                                <span style={{ color: '#2E7D32', fontWeight: 600 }}>Save {formatMYR(Math.abs(diff))}/mo</span>
                              ) : (
                                <span style={{ color: 'var(--brand-red)', fontWeight: 600 }}>+{formatMYR(diff)}/mo</span>
                              )}
                            </td>
                            <td>{formatMYR(row.totalInterest)}</td>
                            <td>{originLabel(row.origin)}</td>
                            <td>
                              {onApplyRate && (
                                <button
                                  type="button"
                                  className="btn btn--secondary btn--sm"
                                  onClick={() => onApplyRate(row.annualRate)}
                                >
                                  {t('simulator.applyManualRate')}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="form-helper" style={{ marginTop: 'var(--space-md)' }}>
                  * Repayments use identical loan principal and tenure assumptions, calculated mathematically using standard monthly amortisation consistent with the affordability calculator.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
