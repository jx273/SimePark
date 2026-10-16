import { useTranslation } from 'react-i18next';
import { AffordabilityResult, AFFORDABILITY_ASSUMPTIONS } from '../types/affordability';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import { useAnimatedNumber, useScrollReveal } from '../hooks/interactions';
import './AffordabilityResults.css';

interface AffordabilityResultsProps {
  result: AffordabilityResult;
}

/**
 * Affordability results.
 *
 * The headline figure animates towards its new value, and the animation is keyed
 * on the rounded value so it replays on a genuine change only. Both ceilings are
 * always shown, with the binding one called out, because "the lower of two
 * limits" is the core idea of the product.
 */
export default function AffordabilityResults({ result }: AffordabilityResultsProps) {
  const { t } = useTranslation();
  const reveal = useScrollReveal<HTMLElement>();

  const {
    hasViableBudget,
    limitingFactor,
    bindingConstraint,
    limitedReason,
    maxPropertyPriceByRepayment,
    maxPropertyPriceByCash,
  } = result;

  const animatedMaxPrice = useAnimatedNumber(result.estimatedMaxPropertyPrice);
  const animatedBudget = useAnimatedNumber(result.estimatedMortgageBudget);

  const bindingExplanation = t(`results.bindingExplanations.${bindingConstraint}`, {
    percent: AFFORDABILITY_ASSUMPTIONS.downPaymentPercent,
  });

  return (
    <section className="results section" id="results" ref={reveal.ref}>
      <div className={`container container--narrow ${reveal.className}`}>
        <h2 className="section__title text-center">{t('results.title')}</h2>
        <p className="section__subtitle section__subtitle--center">{t('results.subtitle')}</p>

        {!hasViableBudget && (
          <div className="results__notice" role="status">
            <p className="results__notice-title">{t('results.emptyTitle')}</p>
            <p className="results__notice-text">{limitedReason}</p>
          </div>
        )}

        <div className="stat-grid">
          <div className="stat-card surface">
            <p className="stat-card__label">{t('results.monthlyIncome')}</p>
            <p className="stat-card__value">{formatMYR(result.monthlyIncome)}</p>
            <p className="stat-card__note">{t('results.monthlyIncomeNote')}</p>
          </div>

          <div className="stat-card surface">
            <p className="stat-card__label">{t('results.existingDebts')}</p>
            <p className="stat-card__value">{formatMYR(result.monthlyDebts)}</p>
            <p className="stat-card__note">{t('results.existingDebtsNote')}</p>
          </div>

          <div className="stat-card surface">
            <p className="stat-card__label">{t('results.currentDsr')}</p>
            <p className="stat-card__value">{formatPercentage(result.currentDSR)}</p>
            <p className="stat-card__note">{t('results.currentDsrNote')}</p>
          </div>

          <div className="stat-card surface">
            <p className="stat-card__label">{t('results.mortgageBudget')}</p>
            <p className="stat-card__value stat-card__value--accent">
              {formatMYR(animatedBudget)}
            </p>
            <p className="stat-card__note">{t('results.mortgageBudgetNote')}</p>
          </div>

          <div className="stat-card stat-card--feature surface">
            <p className="stat-card__label">{t('results.maxPrice')}</p>
            <p
              className="stat-card__value stat-card__value--hero"
              key={Math.round(animatedMaxPrice)}
            >
              {hasViableBudget ? formatMYR(animatedMaxPrice) : '—'}
            </p>
            <p className="stat-card__note">
              {hasViableBudget ? t('results.maxPriceNote') : t('results.maxPriceUnavailable')}
            </p>
          </div>

          <div className="stat-card surface">
            <p className="stat-card__label">{t('results.availableCash')}</p>
            <p className="stat-card__value">{formatMYR(result.downPaymentAmount)}</p>
            <p className="stat-card__note">{t('results.availableCashNote')}</p>
          </div>
        </div>

        {hasViableBudget && (
          <div className="results__limits surface">
            <h3 className="results__assumptions-title">{t('results.limitsTitle')}</h3>
            <ul className="results__limits-list">
              <li
                className={`results__limit ${
                  limitingFactor === 'repayment' ? 'results__limit--binding' : ''
                }`}
              >
                <span className="results__limit-label">
                  {t('results.limitRepayment')}
                  {limitingFactor === 'repayment' && (
                    <span className="results__limit-badge">{t('results.binding')}</span>
                  )}
                </span>
                <span className="results__limit-value">
                  {formatMYR(maxPropertyPriceByRepayment)}
                </span>
              </li>
              <li
                className={`results__limit ${
                  limitingFactor === 'downPayment' ? 'results__limit--binding' : ''
                }`}
              >
                <span className="results__limit-label">
                  {t('results.limitCash', {
                    percent: AFFORDABILITY_ASSUMPTIONS.downPaymentPercent,
                  })}
                  {limitingFactor === 'downPayment' && (
                    <span className="results__limit-badge">{t('results.binding')}</span>
                  )}
                </span>
                <span className="results__limit-value">{formatMYR(maxPropertyPriceByCash)}</span>
              </li>
            </ul>
            <p className="results__limits-note">
              {bindingExplanation} {t('results.limitsNote')}
            </p>
          </div>
        )}

        <div className="results__assumptions surface">
          <h3 className="results__assumptions-title">{t('results.assumptionsTitle')}</h3>
          <ul className="results__assumptions-list">
            <li>
              <strong>{t('results.availableCash')}:</strong>{' '}
              {t('results.assumptionCash', {
                percent: AFFORDABILITY_ASSUMPTIONS.downPaymentPercent,
              })}
            </li>
            <li>
              <strong>{t('results.currentDsr')}:</strong>{' '}
              {t('results.assumptionDsr', {
                cap: AFFORDABILITY_ASSUMPTIONS.dsrCapPercent,
                range: AFFORDABILITY_ASSUMPTIONS.bankDsrRangePercent,
              })}
            </li>
            <li>
              <strong>{t('card.downPayment')}:</strong>{' '}
              {t('results.assumptionDownPayment', {
                percent: AFFORDABILITY_ASSUMPTIONS.downPaymentPercent,
              })}
            </li>
            <li>
              <strong>{t('affordability.interestRate')}:</strong>{' '}
              {t('results.assumptionRate', {
                rate: result.annualInterestRate,
                model: t('results.assumptionRateModel'),
              })}
            </li>
            <li>
              <strong>{t('affordability.loanTenure')}:</strong>{' '}
              {t('results.assumptionTenure', { years: result.loanTenureYears })}
            </li>
            <li>
              {t('results.assumptionExcluded', {
                costs: AFFORDABILITY_ASSUMPTIONS.excludedCosts,
              })}
            </li>
          </ul>
        </div>

        <div className="disclaimer">
          <p className="disclaimer__title">⚠️ {t('results.disclaimerTitle')}</p>
          <p className="disclaimer__text">{t('results.disclaimerText')}</p>
        </div>
      </div>
    </section>
  );
}
