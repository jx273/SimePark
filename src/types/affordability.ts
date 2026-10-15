/**
 * User's financial inputs for affordability calculation.
 */
export interface AffordabilityInputs {
  /** Monthly household income in MYR */
  monthlyIncome: number;
  /** Existing monthly debt commitments in MYR */
  monthlyDebts: number;
  /** Cash actually available for a down payment and purchase costs, in MYR */
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
 * Which constraint limits the estimated maximum property price.
 * - 'repayment': the monthly repayment budget is the binding constraint
 * - 'downPayment': the cash available for the down payment is the binding constraint
 * - 'none': nothing is affordable, or an input is invalid
 */
export type AffordabilityLimitingFactor = 'repayment' | 'downPayment' | 'none';

/**
 * The single input that most constrains the estimated maximum property price.
 *
 * Distinct from `AffordabilityLimitingFactor` because a user-entered
 * `preferredMaxMonthlyPayment` can be the binding constraint even though it does
 * not change the repayment ceiling the user could theoretically service.
 *
 * - 'preferredMaxMonthlyPayment': the user's own monthly ceiling reduced the result
 * - 'downPayment':               available cash caps the price
 * - 'repayment':                 income minus commitments caps the repayment
 * - 'none':                      no estimate was produced
 */
export type BindingConstraint =
  | 'repayment'
  | 'downPayment'
  | 'preferredMaxMonthlyPayment'
  | 'none';

/**
 * Calculated affordability results.
 *
 * All monetary values are in MYR. These are illustrative planning estimates,
 * not a bank approval, eligibility decision, or guarantee.
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
  /**
   * Estimated maximum property price = the LOWER of the price the monthly
   * repayment budget can service and the price the available cash can support.
   * See maxPropertyPriceByRepayment and maxPropertyPriceByCash for each ceiling.
   */
  estimatedMaxPropertyPrice: number;
  /** Property price ceiling implied by the monthly repayment budget */
  maxPropertyPriceByRepayment: number;
  /** Property price ceiling implied by available cash and the required down payment % */
  maxPropertyPriceByCash: number;
  /** Which of the two ceilings is binding */
  limitingFactor: AffordabilityLimitingFactor;
  /**
   * Which input is the overall binding constraint, accounting for a user-entered
   * `preferredMaxMonthlyPayment` as well as the two ceilings. Exposed so
   * dependent features (such as the AI assistant) can state what is really
   * limiting the estimate instead of inferring it.
   */
  bindingConstraint: BindingConstraint;
  /**
   * False when no meaningful estimate is possible (no positive income, invalid
   * interest rate or tenure, or cash below the minimum required down payment).
   * When false, all price ceilings are 0.
   */
  hasViableBudget: boolean;
  /** Plain-language reason when hasViableBudget is false (null otherwise) */
  limitedReason: string | null;
  /** Cash applied to the purchase (never more than the property price) */
  cashApplied: number;
  /** DSR before adding any new mortgage (existing debts / income) */
  currentDSR: number;
  /** The illustrative DSR cap used (e.g., 40) */
  illustrativeDSRCap: number;
  /** Down payment cash assumption used */
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
 * Required down payment as a percentage of the property price.
 * Many Malaysian properties require a 10% down payment for conventional loans,
 * so the app uses 10% as a planning assumption. Actual requirements vary by
 * property, lender, and loan margin — this is not a lending rule.
 *
 * This percentage drives two things:
 * 1. the price ceiling implied by the user's available cash, and
 * 2. whether a given property's down payment requirement is covered.
 */
export const REQUIRED_DOWN_PAYMENT_PERCENTAGE = 10; // 10%

/**
 * @deprecated Use REQUIRED_DOWN_PAYMENT_PERCENTAGE. Kept as a named re-export
 * so existing imports keep working; same value.
 */
export const DEFAULT_DOWN_PAYMENT_PERCENTAGE = REQUIRED_DOWN_PAYMENT_PERCENTAGE;

/**
 * Documented assumptions behind every estimate in the app, in one place.
 * The results UI renders these so the wording cannot drift from the maths.
 */
export const AFFORDABILITY_ASSUMPTIONS = {
  /** Illustrative cap on total monthly debt commitments as a share of gross income */
  dsrCapPercent: ILLUSTRATIVE_DSR_CAP,
  /** Typical range Malaysian banks are reported to use, for context only */
  bankDsrRangePercent: '60–70%',
  /** Required down payment as a share of property price */
  downPaymentPercent: REQUIRED_DOWN_PAYMENT_PERCENTAGE,
  /** Repayments are modelled as a fixed-rate amortising loan */
  interestRateModel: 'fixed rate for the whole tenure',
  /** Costs the model deliberately excludes */
  excludedCosts:
    'legal fees, stamp duty, valuation fees, insurance, maintenance charges, and utilities',
} as const;
