import { AffordabilityResult, ILLUSTRATIVE_DSR_CAP, DEFAULT_DOWN_PAYMENT_PERCENTAGE } from '../types/affordability';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import './AffordabilityResults.css';

interface AffordabilityResultsProps {
  result: AffordabilityResult;
}

export default function AffordabilityResults({ result }: AffordabilityResultsProps) {
  return (
    <section className="results section" id="results">
      <div className="container container--narrow">
        <h2 className="section__title text-center">Your Estimated Affordability</h2>
        <p className="section__subtitle" style={{ margin: '0 auto var(--space-2xl)' }}>
          Based on your inputs, here's an estimate of what you may be able to afford.
        </p>

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
              {formatMYR(result.estimatedMaxPropertyPrice)}
            </p>
            <p className="stat-card__note">Including your down payment</p>
          </div>

          <div className="stat-card">
            <p className="stat-card__label">Your Down Payment</p>
            <p className="stat-card__value">{formatMYR(result.downPaymentAmount)}</p>
            <p className="stat-card__note">Available funds</p>
          </div>
        </div>

        <div className="results__assumptions">
          <h4 className="results__assumptions-title">Assumptions Used</h4>
          <ul className="results__assumptions-list">
            <li>
              <strong>Illustrative DSR cap:</strong> {ILLUSTRATIVE_DSR_CAP}% — This is a planning
              assumption only. Different banks use different DSR thresholds (typically 60–70% of
              net income). We use {ILLUSTRATIVE_DSR_CAP}% of gross income as a conservative estimate.
            </li>
            <li>
              <strong>Interest rate:</strong> {result.annualInterestRate}% per annum (fixed-rate assumption).
            </li>
            <li>
              <strong>Loan tenure:</strong> {result.loanTenureYears} years.
            </li>
            <li>
              <strong>Down payment assumption:</strong> {DEFAULT_DOWN_PAYMENT_PERCENTAGE}% of property
              price or your provided amount, whichever is greater.
            </li>
          </ul>
        </div>

        <div className="disclaimer">
          <p className="disclaimer__title">⚠️ Important Disclaimer</p>
          <p className="disclaimer__text">
            These are <strong>illustrative estimates only</strong>, not a loan approval or financial
            advice. Actual mortgage payments, loan eligibility, and DSR requirements depend on your
            chosen lender, credit profile, and specific loan terms. Other costs such as legal fees,
            stamp duty, insurance, valuation fees, and maintenance charges are not included.
            Please consult a licensed financial advisor or your bank for personalised guidance.
          </p>
        </div>
      </div>
    </section>
  );
}
