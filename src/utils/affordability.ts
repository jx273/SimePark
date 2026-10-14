/**
 * Affordability calculation — combines mortgage, DSR, and user inputs
 * to produce a complete affordability result.
 */

import { AffordabilityInputs, AffordabilityResult, ILLUSTRATIVE_DSR_CAP } from '../types/affordability';
import { calculateMaxLoanPrincipal } from './mortgage';
import { calculateDSR, calculateMortgageBudget, calculateMaxTotalDebtBudget } from './dsr';

/**
 * Calculate complete affordability results from user inputs.
 *
 * Assumptions clearly documented:
 * - Uses an illustrative DSR cap (default 40%) as a planning assumption
 * - This is NOT a bank approval or guarantee
 * - Different banks use different DSR thresholds and income definitions
 * - Other costs (legal fees, insurance, taxes, maintenance) are not included
 */
export function calculateAffordability(
  inputs: AffordabilityInputs
): AffordabilityResult {
  const { monthlyIncome, monthlyDebts, downPayment, annualInterestRate, loanTenureYears } = inputs;

  // Current DSR (before any new mortgage)
  const currentDSR = calculateDSR(monthlyDebts, monthlyIncome);

  // Maximum total monthly debt budget
  const maxTotalMonthlyDebtBudget = calculateMaxTotalDebtBudget(monthlyIncome, ILLUSTRATIVE_DSR_CAP);

  // Estimated mortgage budget
  let estimatedMortgageBudget = calculateMortgageBudget(
    monthlyIncome,
    monthlyDebts,
    ILLUSTRATIVE_DSR_CAP
  );

  // If user specified a preferred max monthly payment, use the lower of the two
  if (inputs.preferredMaxMonthlyPayment && inputs.preferredMaxMonthlyPayment > 0) {
    estimatedMortgageBudget = Math.min(
      estimatedMortgageBudget,
      inputs.preferredMaxMonthlyPayment
    );
  }

  // Calculate maximum loan principal from mortgage budget
  const estimatedMaxLoanPrincipal = calculateMaxLoanPrincipal(
    estimatedMortgageBudget,
    annualInterestRate,
    loanTenureYears
  );

  // Estimated maximum property price = loan principal + down payment
  const estimatedMaxPropertyPrice = estimatedMaxLoanPrincipal + downPayment;

  return {
    monthlyIncome,
    monthlyDebts,
    maxTotalMonthlyDebtBudget,
    estimatedMortgageBudget,
    estimatedMaxLoanPrincipal,
    estimatedMaxPropertyPrice,
    currentDSR,
    illustrativeDSRCap: ILLUSTRATIVE_DSR_CAP,
    downPaymentAmount: downPayment,
    annualInterestRate,
    loanTenureYears,
  };
}
