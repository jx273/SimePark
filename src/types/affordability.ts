/**
 * User's financial inputs for affordability calculation.
 */
export interface AffordabilityInputs {
  /** Monthly household income in MYR */
  monthlyIncome: number;
  /** Existing monthly debt commitments in MYR */
  monthlyDebts: number;
  /** Available down payment amount in MYR */
  downPayment: number;
  /** Annual interest rate as a percentage (e.g., 4.0 means 4%) */
  annualInterestRate: number;
  /** Loan tenure in years */
  loanTenureYears: number;
  /** Optional: preferred maximum monthly mortgage payment */
  preferredMaxMonthlyPayment?: number;
  /** Optional: preferred property location */
  preferredLocation?: string;
  /** Optional: minimum number of bedrooms */
  minBedrooms?: number;
}

/**
 * Calculated affordability results.
 */
export interface AffordabilityResult {
  /** Monthly household income (echo back) */
  monthlyIncome: number;
  /** Existing monthly debt commitments (echo back) */
  monthlyDebts: number;
  /** Maximum total monthly debt budget based on illustrative DSR assumption */
  maxTotalMonthlyDebtBudget: number;
  /** Estimated monthly mortgage budget (after subtracting existing debts) */
  estimatedMortgageBudget: number;
  /** Estimated maximum loan principal the user can service */
  estimatedMaxLoanPrincipal: number;
  /** Estimated maximum property price (loan principal + down payment) */
  estimatedMaxPropertyPrice: number;
  /** DSR before adding any new mortgage (existing debts / income) */
  currentDSR: number;
  /** The illustrative DSR cap used (e.g., 40) */
  illustrativeDSRCap: number;
  /** Down payment assumption used */
  downPaymentAmount: number;
  /** Interest rate used */
  annualInterestRate: number;
  /** Loan tenure used */
  loanTenureYears: number;
}

/** Default values for the affordability form */
export const DEFAULT_AFFORDABILITY_INPUTS: AffordabilityInputs = {
  monthlyIncome: 0,
  monthlyDebts: 0,
  downPayment: 0,
  annualInterestRate: 4.0,
  loanTenureYears: 30,
};

/**
 * Illustrative DSR cap used for affordability estimation.
 * This is a planning assumption, NOT a bank rule.
 * Different Malaysian banks use different DSR thresholds.
 */
export const ILLUSTRATIVE_DSR_CAP = 40; // 40%

/**
 * Default down payment percentage assumption.
 * Many Malaysian properties require 10% down payment for conventional loans.
 * This is a simplification — actual requirements vary by property and lender.
 */
export const DEFAULT_DOWN_PAYMENT_PERCENTAGE = 10; // 10%
