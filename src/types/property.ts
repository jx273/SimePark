/**
 * Property data model for SimePark.
 * Designed to be easy to extend with CSV import later.
 */
export interface Property {
  /** Unique identifier */
  id: string;
  /** Property name or development name */
  propertyName: string;
  /** Location / area / city */
  location: string;
  /** Listed price in MYR */
  priceMYR: number;
  /** Type of property */
  propertyType: PropertyType;
  /** Number of bedrooms (null if unknown) */
  bedrooms: number | null;
  /** Number of bathrooms (null if unknown) */
  bathrooms: number | null;
  /** Built-up area in square feet (null if unknown) */
  builtUpSqft: number | null;
  /** Original listing source URL (null if not available) */
  sourceUrl: string | null;
  /** Date the record was last verified (ISO string, null if unverified) */
  verifiedDate: string | null;
  /** Whether this is example/demo data (true) or verified data (false) */
  isExample: boolean;
}

export type PropertyType =
  | 'Condominium'
  | 'Apartment'
  | 'Terrace House'
  | 'Semi-Detached'
  | 'Bungalow'
  | 'Townhouse'
  | 'Flat';

/**
 * Why a property does or does not fit the user's budget.
 * - 'affordable': the estimated repayment fits the monthly budget and the
 *   available cash covers the required down payment
 * - 'overMonthlyBudget': the estimated repayment exceeds the monthly budget
 * - 'insufficientDownPayment': the repayment fits, but available cash is short
 *   of the required down payment
 */
export type PropertyBudgetStatus =
  | 'affordable'
  | 'overMonthlyBudget'
  | 'insufficientDownPayment';

/**
 * A property record enriched with affordability calculations
 * specific to the user's financial inputs.
 */
export interface PropertyWithCalculations extends Property {
  /** Estimated monthly mortgage payment in MYR */
  estimatedMonthlyMortgage: number;
  /** Required down payment in MYR (property price x required down payment %) */
  requiredDownPayment: number;
  /** Cash actually applied to this property (never more than the price) */
  downPaymentApplied: number;
  /** How much more cash is needed to cover the required down payment (0 if covered) */
  cashShortfall: number;
  /** Loan principal = price - cash applied */
  loanPrincipal: number;
  /** Estimated DSR (%) including this property's mortgage */
  estimatedDSR: number;
  /** Whether this property is within the user's budget (repayment AND down payment) */
  isAffordable: boolean;
  /** Which constraint fails, for display purposes */
  budgetStatus: PropertyBudgetStatus;
  /** Simple match score (0-100) for ranking */
  matchScore: number;
  /** Human-readable explanation of why this property matches or doesn't */
  matchExplanation: string;
}
