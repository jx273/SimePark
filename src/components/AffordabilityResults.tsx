import {
  AffordabilityResult,
  AFFORDABILITY_ASSUMPTIONS,
} from '../types/affordability';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import './AffordabilityResults.css';

interface AffordabilityResultsProps {
  result: AffordabilityResult;
}

const LIMITING_FACTOR_TEXT: Record<string, string> = {
  repayment:
    'Your monthly repayment budget is the limit. Reducing existing debts or extending the loan tenure would raise it more than adding cash would.',
  downPayment:
    'Your available cash is the limit. Under the 10% down payment assumption, your cash would need to be higher to buy at the price your monthly budget could otherwise service.',
  none: '',
};

export default function AffordabilityResults({ result }: AffordabilityResultsProps) {
  const {
    hasViableBudget,
    limitingFactor,
    limitedReason,
    maxPropertyPriceByRepayment,
    maxPropertyPriceByCash,
  } = result;

  return (
    <section className="results section" id="results">
      <div className="container container--narrow">
        <h2 className="section__title text-center">Your Estimated Affordability</h2>
        <p className="section__subtitle" style={{ margin: '0 auto var(--space-2xl)' }}>
          Based on your inputs, here's an estimate of what you may be able to afford.
          This is a planning estimate, not a bank approval.
        </p>

        {!hasViableBudget && (
          <div className="results__notice" role="status">
            <p className="results__notice-title">We can't produce a meaningful estimate yet</p>
            <p className="results__notice-text">{limitedReason}</p>
          </div>
        )}

        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-card__label">Monthly Income</p>
            <p className="stat-card__value">{formatMYR(result.monthlyIncome)}</p>
            <p className="stat-card__note">Gross household income</p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Existing Debts</p>
            <p className="stat-card__value">{formatMYR(result.monthlyDebts)}</p>
            <p className="stat-card__note">Monthly commitments</p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Current DSR</p>
            <p className="stat-card__value">{formatPercentage(result.currentDSR)}</p>
            <p className="stat-card__note">Before adding mortgage</p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Estimated Mortgage Budget</p>
            <p className="stat-card__value stat-card__value--accent">
              {formatMYR(result.estimatedMortgageBudget)}
            </p>
            <p className="stat-card__note">Per month (estimated)</p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Est. Max Property Price</p>
            <p className="stat-card__value stat-card__value--accent">
              {hasViableBudget ? formatMYR(result.estimatedMaxPropertyPrice) : '—'}
            </p>
            <p className="stat-card__note">
              {hasViableBudget
                ? 'Lower of the two limits below'
                : 'Not available with these inputs'}
            </p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Your Available Cash</p>
            <p className="stat-card__value">{formatMYR(result.downPaymentAmount)}</p>
            <p className="stat-card__note">For the down payment</p>
          </div>
        </div>

        {hasViableBudget && (
          <div className="results__limits">
            <h4 className="results__assumptions-title">What Limits Your Estimate</h4>
            <ul className="results__limits-list">
              <li
                className={`results__limit ${
                  limitingFactor === 'repayment' ? 'results__limit--binding' : ''
                }`}
              >
                <span className="results__limit-label">
                  Limit from your monthly repayment
                  {limitingFactor === 'repayment' && ' — binding'}
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
                  Limit from your available cash (
                  {AFFORDABILITY_ASSUMPTIONS.downPaymentPercent}% down payment)
                  {limitingFactor === 'downPayment' && ' — binding'}
                </span>
                <span className="results__limit-value">
                  {formatMYR(maxPropertyPriceByCash)}
                </span>
              </li>
            </ul>
            <p className="results__limits-note">
              {LIMITING_FACTOR_TEXT[limitingFactor]} Your estimated maximum price is the
              lower of these two figures.
            </p>
          </div>
        )}

        <div className="results__assumptions">
          <h4 className="results__assumptions-title">Assumptions Used</h4>
          <ul className="results__assumptions-list">
            <li>
              <strong>Available cash:</strong> the down payment figure you entered is treated
              as cash you actually have. We do not assume you can cover the{' '}
              {AFFORDABILITY_ASSUMPTIONS.downPaymentPercent}% requirement regardless of what
              you entered.
            </li>
            <li>
              <strong>Illustrative DSR cap:</strong>{' '}
              {AFFORDABILITY_ASSUMPTIONS.dsrCapPercent}% of gross monthly income — planning
              assumption only. Banks commonly work in the{' '}
              {AFFORDABILITY_ASSUMPTIONS.bankDsrRangePercent} range and may use net income and
              different commitment definitions, so this assumption is deliberately more
              conservative than a typical bank.
            </li>
            <li>
              <strong>Down payment assumption:</strong>{' '}
              {AFFORDABILITY_ASSUMPTIONS.downPaymentPercent}% of the property price. Actual
              requirements vary by property and lender.
            </li>
            <li>
              <strong>Interest rate:</strong> {result.annualInterestRate}% per annum, treated as
              a {AFFORDABILITY_ASSUMPTIONS.interestRateModel}.
            </li>
            <li>
              <strong>Loan tenure:</strong> {result.loanTenureYears} years.
            </li>
            <li>
              <strong>Costs not included:</strong> {AFFORDABILITY_ASSUMPTIONS.excludedCosts}.
            </li>
          </ul>
        </div>

        <div className="disclaimer">
          <p className="disclaimer__title">⚠️ Important Disclaimer</p>
          <p className="disclaimer__text">
            These are <strong>illustrative estimates only</strong>. They are not a loan
            approval, a loan offer, an eligibility decision, or financial advice. Actual
            mortgage payments, loan eligibility, and DSR requirements depend on your chosen
            lender, credit profile, and specific loan terms. Other costs such as legal fees,
            stamp duty, insurance, valuation fees, and maintenance charges are not included.
            Please consult a licensed financial advisor or your bank for personalised guidance.
          </p>
        </div>
      </div>
    </section>
  );
}
