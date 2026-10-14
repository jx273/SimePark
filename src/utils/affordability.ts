/**
 * Affordability calculation — combines mortgage, DSR, and user inputs
 * to produce a complete affordability result.
 *
 * ============================ ASSUMPTIONS ============================
 * These are the ONLY assumptions behind the numbers shown in the app. They are
 * planning assumptions, and none of them is a lending rule.
 *
 * 1. Cash vs income. The "available down payment" input is treated as CASH THE
 *    USER ACTUALLY HAS. It is not assumed to be whatever the 10% rule requires.
 * 2. Repayment capacity. Total monthly debt commitments (existing debts plus
 *    the new mortgage) are capped at 40% of GROSS monthly household income.
 *    This is an illustrative cap. Banks commonly work in the 60–70% range and
 *    may use net income and different commitment definitions, so this figure is
 *    deliberately more conservative than a typical bank.
 * 3. Down payment. The required down payment is 10% of the property price.
 *    Cash above that requirement is treated as cash applied to the purchase,
 *    which reduces the loan and therefore the monthly repayment.
 * 4. Financing. Repayments are modelled as a fixed-rate amortising loan over
 *    the full tenure at the rate the user entered. Real packages are usually
 *    variable and may be tiered.
 * 5. Excluded costs. Legal fees, stamp duty, valuation fees, insurance,
 *    maintenance, and utilities are NOT included in any figure.
 * 6. Two ceilings. The maximum property price is the LOWER of:
 *      a. what the monthly repayment budget can service, and
 *      b. what the available cash can support under the 10% requirement.
 *    Both ceilings are returned so the binding constraint can be explained.
 *
 * THIS IS NOT A BANK APPROVAL, A LOAN OFFER, OR AN ELIGIBILITY DECISION.
 * =====================================================================
 */

import {
  AffordabilityInputs,
  AffordabilityResult,
  AffordabilityLimitingFactor,
  ILLUSTRATIVE_DSR_CAP,
  REQUIRED_DOWN_PAYMENT_PERCENTAGE,
} from '../types/affordability';
import { calculateMaxLoanPrincipal, toFiniteNumber } from './mortgage';
import {
  calculateDSR,
  calculateMortgageBudget,
  calculateMaxTotalDebtBudget,
  calculateMaxPriceByCash,
} from './dsr';

/**
 * A validated, finite version of the user's inputs.
 * Everything unusable is normalised to 0, except the interest rate and tenure
 * where 0 is not a usable planning value; those are reported via `issues`.
 */
export interface SanitizedAffordabilityInputs {
  monthlyIncome: number;
  monthlyDebts: number;
  downPayment: number;
  annualInterestRate: number;
  loanTenureYears: number;
  preferredMaxMonthlyPayment: number;
  /** Human-readable descriptions of unusable inputs, for display */
  issues: string[];
}

/**
 * Validate and normalise raw form values so the rest of the calculation can
 * never be poisoned by NaN, Infinity, or negative amounts.
 */
export function sanitizeAffordabilityInputs(
  inputs: AffordabilityInputs
): SanitizedAffordabilityInputs {
  const issues: string[] = [];

  const monthlyIncome = Math.max(0, toFiniteNumber(inputs.monthlyIncome));
  const monthlyDebts = Math.max(0, toFiniteNumber(inputs.monthlyDebts));
  const downPayment = Math.max(0, toFiniteNumber(inputs.downPayment));
  const annualInterestRate = Math.max(0, toFiniteNumber(inputs.annualInterestRate));
  const loanTenureYears = Math.max(0, toFiniteNumber(inputs.loanTenureYears));
  const preferredMaxMonthlyPayment = Math.max(
    0,
    toFiniteNumber(inputs.preferredMaxMonthlyPayment)
  );

  if (!Number.isFinite(inputs.monthlyIncome) || monthlyIncome <= 0) {
    issues.push('a monthly household income greater than zero');
  }
  if (
    !Number.isFinite(inputs.annualInterestRate) ||
    inputs.annualInterestRate < 0
  ) {
    issues.push('a valid, non-negative annual interest rate');
  }
  if (!Number.isFinite(inputs.loanTenureYears) || inputs.loanTenureYears <= 0) {
    issues.push('a loan tenure greater than zero');
  }

  return {
    monthlyIncome,
    monthlyDebts,
    downPayment,
    annualInterestRate,
    loanTenureYears,
    preferredMaxMonthlyPayment,
    issues,
  };
}

/**
 * Calculate complete affordability results from user inputs.
 *
 * Edge cases handled explicitly:
 * - zero or missing income -> nothing is affordable (the available cash on its
 *   own cannot service a loan; the old behaviour reported the cash as a
 *   property price, which overstated what the user could buy)
 * - existing debts at or above the DSR cap -> nothing is affordable
 * - cash below the required down payment for a meaningful purchase -> the cash
 *   ceiling is returned and flagged as the binding constraint
 * - NaN/Infinity/negative inputs -> normalised and reported, never propagated
 *
 * The result is an illustrative planning estimate, not a bank approval.
 */
export function calculateAffordability(
  inputs: AffordabilityInputs
): AffordabilityResult {
  const sanitized = sanitizeAffordabilityInputs(inputs);
  const {
    monthlyIncome,
    monthlyDebts,
    downPayment,
    annualInterestRate,
    loanTenureYears,
    preferredMaxMonthlyPayment,
  } = sanitized;

  const currentDSR = calculateDSR(monthlyDebts, monthlyIncome);
  const maxTotalMonthlyDebtBudget = calculateMaxTotalDebtBudget(
    monthlyIncome,
    ILLUSTRATIVE_DSR_CAP
  );

  // Mortgage budget from repayment capacity, optionally tightened by the user's
  // own preferred maximum payment.
  let estimatedMortgageBudget = calculateMortgageBudget(
    monthlyIncome,
    monthlyDebts,
    ILLUSTRATIVE_DSR_CAP
  );
  if (preferredMaxMonthlyPayment > 0) {
    estimatedMortgageBudget = Math.min(
      estimatedMortgageBudget,
      preferredMaxMonthlyPayment
    );
  }

  // Ceiling A: what the monthly repayment budget can service.
  const loanCapacity = calculateMaxLoanPrincipal(
    estimatedMortgageBudget,
    annualInterestRate,
    loanTenureYears
  );
  const maxPropertyPriceByRepayment = loanCapacity + downPayment;

  // Ceiling B: what the available cash supports under the required down payment.
  const maxPropertyPriceByCash = calculateMaxPriceByCash(
    downPayment,
    REQUIRED_DOWN_PAYMENT_PERCENTAGE
  );

  const hasIncome = monthlyIncome > 0;
  const hasValidLoanTerms =
    Number.isFinite(inputs.annualInterestRate) &&
    inputs.annualInterestRate >= 0 &&
    Number.isFinite(inputs.loanTenureYears) &&
    inputs.loanTenureYears > 0;
  const hasRepaymentCapacity = estimatedMortgageBudget > 0 && hasIncome;
  const hasCashForDownPayment = maxPropertyPriceByCash > 0;

  const hasViableBudget =
    hasValidLoanTerms && hasRepaymentCapacity && hasCashForDownPayment;

  let limitedReason: string | null = null;
  if (!hasValidLoanTerms) {
    limitedReason =
      'Enter a valid interest rate and a loan tenure greater than zero to get an estimate.';
  } else if (!hasIncome) {
    limitedReason =
      'Monthly household income must be greater than zero. Without income, an estimate of what you could buy cannot be produced — the cash you have is not a borrowing capacity.';
  } else if (!hasRepaymentCapacity) {
    limitedReason = `Your existing monthly commitments already use up the entire illustrative ${ILLUSTRATIVE_DSR_CAP}% debt-service budget, so there is no room for a new mortgage under these assumptions.`;
  } else if (!hasCashForDownPayment) {
    limitedReason = `Enter the cash you have available. Under the ${REQUIRED_DOWN_PAYMENT_PERCENTAGE}% down payment assumption, no purchase price is covered without available cash.`;
  }

  const estimatedMaxPropertyPrice = hasViableBudget
    ? Math.min(maxPropertyPriceByRepayment, maxPropertyPriceByCash)
    : 0;

  let limitingFactor: AffordabilityLimitingFactor = 'none';
  if (hasViableBudget) {
    limitingFactor =
      maxPropertyPriceByCash < maxPropertyPriceByRepayment
        ? 'downPayment'
        : 'repayment';
  }

  // When there is no viable budget, every ceiling is reported as 0 rather than
  // leaking the cash amount into a figure that looks like a buying capacity.
  return {
    monthlyIncome,
    monthlyDebts,
    maxTotalMonthlyDebtBudget,
    estimatedMortgageBudget,
    estimatedMaxLoanPrincipal: hasViableBudget ? loanCapacity : 0,
    estimatedMaxPropertyPrice,
    maxPropertyPriceByRepayment: hasViableBudget ? maxPropertyPriceByRepayment : 0,
    maxPropertyPriceByCash: hasViableBudget ? maxPropertyPriceByCash : 0,
    limitingFactor,
    hasViableBudget,
    limitedReason,
    cashApplied: hasViableBudget ? downPayment : 0,
    currentDSR,
    illustrativeDSRCap: ILLUSTRATIVE_DSR_CAP,
    downPaymentAmount: downPayment,
    annualInterestRate,
    loanTenureYears,
  };
}
