/**
 * Debt Service Ratio (DSR) calculation utilities.
 *
 * DSR = (total monthly debt obligations / gross monthly income) × 100%
 *
 * IMPORTANT: This is an ILLUSTRATIVE estimate only.
 * - Different Malaysian banks use different DSR thresholds (typically 60-70%).
 * - Some banks use net income instead of gross income.
 * - Some banks include different types of commitments.
 * - This tool uses a configurable illustrative cap for planning purposes only.
 */

import { ILLUSTRATIVE_DSR_CAP } from '../types/affordability';

/**
 * Calculate the Debt Service Ratio.
 *
 * @param totalMonthlyDebts - Total monthly debt obligations in MYR
 * @param monthlyIncome - Gross monthly household income in MYR
 * @returns DSR as a percentage (e.g., 35.5 means 35.5%), or 0 if income is zero
 */
export function calculateDSR(
  totalMonthlyDebts: number,
  monthlyIncome: number
): number {
  // Guard against division by zero
  if (monthlyIncome <= 0) {
    return 0;
  }
  if (totalMonthlyDebts < 0) {
    return 0;
  }
  return (totalMonthlyDebts / monthlyIncome) * 100;
}

/**
 * Calculate the estimated mortgage budget based on the illustrative DSR cap.
 *
 * Formula:
 *   maxTotalDebtBudget = monthlyIncome × (illustrativeDSRCap / 100)
 *   mortgageBudget = maxTotalDebtBudget - existingMonthlyDebts
 *
 * Clamps negative values to zero.
 *
 * @param monthlyIncome - Gross monthly household income in MYR
 * @param existingMonthlyDebts - Existing monthly debt commitments in MYR
 * @param dsrCap - Illustrative DSR cap as percentage (default: ILLUSTRATIVE_DSR_CAP)
 * @returns Estimated monthly mortgage budget in MYR
 */
export function calculateMortgageBudget(
  monthlyIncome: number,
  existingMonthlyDebts: number,
  dsrCap: number = ILLUSTRATIVE_DSR_CAP
): number {
  if (monthlyIncome <= 0 || dsrCap <= 0) {
    return 0;
  }

  const maxTotalDebtBudget = monthlyIncome * (dsrCap / 100);
  const mortgageBudget = maxTotalDebtBudget - Math.max(0, existingMonthlyDebts);

  // Cannot have negative mortgage budget
  return Math.max(0, mortgageBudget);
}

/**
 * Get the maximum total monthly debt budget.
 */
export function calculateMaxTotalDebtBudget(
  monthlyIncome: number,
  dsrCap: number = ILLUSTRATIVE_DSR_CAP
): number {
  if (monthlyIncome <= 0 || dsrCap <= 0) return 0;
  return monthlyIncome * (dsrCap / 100);
}
