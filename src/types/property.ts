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
 * A property record enriched with affordability calculations
 * specific to the user's financial inputs.
 */
export interface PropertyWithCalculations extends Property {
  /** Estimated monthly mortgage payment in MYR */
  estimatedMonthlyMortgage: number;
  /** Required down payment in MYR (based on configured down payment percentage) */
  requiredDownPayment: number;
  /** Loan principal = price - down payment */
  loanPrincipal: number;
  /** Estimated DSR (%) including this property's mortgage */
  estimatedDSR: number;
  /** Whether this property is within the user's budget */
  isAffordable: boolean;
  /** Simple match score (0-100) for ranking */
  matchScore: number;
  /** Human-readable explanation of why this property matches or doesn't */
  matchExplanation: string;
}
