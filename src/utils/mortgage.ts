/**
 * Mortgage calculation utilities for SimePark.
 * All monetary values are in Malaysian Ringgit (MYR).
 *
 * Uses the standard fixed-rate amortization formula:
 * M = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *
 * Where:
 *   M = monthly payment
 *   P = loan principal (property price - down payment)
 *   r = monthly interest rate (annual rate / 12)
 *   n = total number of monthly payments (years * 12)
 */

/**
 * Calculate the monthly mortgage payment using standard fixed-rate amortization.
 *
 * @param principal - Loan principal in MYR (must be >= 0)
 * @param annualInterestRate - Annual interest rate as percentage (e.g., 4.0 = 4%)
 * @param tenureYears - Loan tenure in years (must be > 0)
 * @returns Monthly payment in MYR, or 0 if inputs are invalid
 */
export function calculateMonthlyMortgage(
  principal: number,
  annualInterestRate: number,
  tenureYears: number
): number {
  // Guard against invalid inputs
  if (principal <= 0 || tenureYears <= 0 || annualInterestRate < 0) {
    return 0;
  }

  const n = tenureYears * 12; // total monthly payments

  // Handle zero-interest case separately
  if (annualInterestRate === 0) {
    return principal / n;
  }

  const r = annualInterestRate / 100 / 12; // monthly interest rate
  const compoundFactor = Math.pow(1 + r, n); // (1 + r)^n

  return (principal * r * compoundFactor) / (compoundFactor - 1);
}

/**
 * Calculate the maximum loan principal that can be serviced
 * with a given monthly payment, interest rate, and tenure.
 *
 * This is the inverse of the mortgage payment formula:
 * P = M * ((1 + r)^n - 1) / (r * (1 + r)^n)
 *
 * @param monthlyPayment - Maximum monthly payment in MYR
 * @param annualInterestRate - Annual interest rate as percentage
 * @param tenureYears - Loan tenure in years
 * @returns Maximum loan principal in MYR
 */
export function calculateMaxLoanPrincipal(
  monthlyPayment: number,
  annualInterestRate: number,
  tenureYears: number
): number {
  if (monthlyPayment <= 0 || tenureYears <= 0 || annualInterestRate < 0) {
    return 0;
  }

  const n = tenureYears * 12;

  // Handle zero-interest case
  if (annualInterestRate === 0) {
    return monthlyPayment * n;
  }

  const r = annualInterestRate / 100 / 12;
  const compoundFactor = Math.pow(1 + r, n);

  return (monthlyPayment * (compoundFactor - 1)) / (r * compoundFactor);
}

/**
 * Calculate the required down payment for a property.
 *
 * @param propertyPrice - Property price in MYR
 * @param downPaymentPercentage - Down payment as percentage (e.g., 10 = 10%)
 * @returns Required down payment in MYR
 */
export function calculateDownPayment(
  propertyPrice: number,
  downPaymentPercentage: number
): number {
  if (propertyPrice <= 0 || downPaymentPercentage < 0) {
    return 0;
  }
  return propertyPrice * (downPaymentPercentage / 100);
}

/**
 * Format a number as MYR currency string.
 * Example: 450000 → "RM 450,000"
 */
export function formatMYR(amount: number): string {
  if (!isFinite(amount)) return 'RM 0';
  return `RM ${Math.round(amount).toLocaleString('en-MY')}`;
}

/**
 * Format a percentage value.
 * Example: 35.5 → "35.5%"
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  if (!isFinite(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}
