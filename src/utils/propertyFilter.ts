/**
 * Property filtering, scoring, and ranking utilities.
 *
 * Affordability model (must stay consistent with src/utils/affordability.ts):
 * - The user's available down payment is CASH THEY ACTUALLY HAVE. It is applied
 *   to the purchase, so the loan is (price - cash applied), capped so the loan
 *   cannot be negative.
 * - The required down payment is REQUIRED_DOWN_PAYMENT_PERCENTAGE of the price.
 *   If the user's cash does not cover it, that is a genuine shortfall and is
 *   reported as such rather than being quietly assumed away.
 * - A property counts as affordable only when BOTH the estimated monthly
 *   repayment fits the monthly budget AND the required down payment is covered.
 */

import { Property, PropertyWithCalculations, PropertyBudgetStatus } from '../types/property';
import {
  AffordabilityInputs,
  AffordabilityResult,
  REQUIRED_DOWN_PAYMENT_PERCENTAGE,
} from '../types/affordability';
import { calculateMonthlyMortgage } from './mortgage';
import { calculateDSR } from './dsr';
import { sanitizeAffordabilityInputs } from './affordability';

/**
 * Enrich properties with affordability calculations for a given user profile.
 *
 * Inputs are sanitised first, so this is safe to call with raw form values.
 *
 * @param properties - Array of raw property records
 * @param inputs - User's affordability inputs
 * @param result - Calculated affordability result
 * @returns Array of properties enriched with calculation data
 */
export function enrichPropertiesWithCalculations(
  properties: Property[],
  inputs: AffordabilityInputs,
  result: AffordabilityResult
): PropertyWithCalculations[] {
  const safeInputs = sanitizeAffordabilityInputs(inputs);

  return properties.map((property) => {
    const price = property.priceMYR;

    // Down payment required by the 10% planning assumption for this price.
    const requiredDownPayment = price * (REQUIRED_DOWN_PAYMENT_PERCENTAGE / 100);

    // Cash the user can actually put in (never more than the price).
    const downPaymentApplied = Math.min(safeInputs.downPayment, price);

    // True shortfall against the required down payment, never negative.
    const cashShortfall = Math.max(0, requiredDownPayment - downPaymentApplied);

    const loanPrincipal = Math.max(0, price - downPaymentApplied);

    const estimatedMonthlyMortgage = calculateMonthlyMortgage(
      loanPrincipal,
      safeInputs.annualInterestRate,
      safeInputs.loanTenureYears
    );

    const estimatedDSR = calculateDSR(
      safeInputs.monthlyDebts + estimatedMonthlyMortgage,
      safeInputs.monthlyIncome
    );

    // A property is affordable only when the monthly repayment fits the
    // calculated budget AND the required down payment is covered by real cash.
    const isWithinMortgageBudget =
      estimatedMonthlyMortgage > 0 &&
      estimatedMonthlyMortgage <= result.estimatedMortgageBudget;
    const hasEnoughDownPayment = cashShortfall <= 0;
    const isAffordable = isWithinMortgageBudget && hasEnoughDownPayment;

    // When it is not affordable, say which constraint failed. Repayment is
    // checked first because it binds regardless of how much cash is available.
    let budgetStatus: PropertyBudgetStatus = 'affordable';
    if (!isAffordable) {
      budgetStatus = isWithinMortgageBudget
        ? 'insufficientDownPayment'
        : 'overMonthlyBudget';
    }

    const matchScore = calculateMatchScore(
      property,
      safeInputs,
      result,
      estimatedMonthlyMortgage,
      isAffordable
    );

    const matchExplanation = generateMatchExplanation(
      property,
      safeInputs,
      result,
      estimatedMonthlyMortgage,
      requiredDownPayment,
      cashShortfall,
      estimatedDSR,
      isAffordable,
      isWithinMortgageBudget,
      hasEnoughDownPayment
    );

    return {
      ...property,
      estimatedMonthlyMortgage,
      requiredDownPayment,
      downPaymentApplied,
      cashShortfall,
      loanPrincipal,
      estimatedDSR,
      isAffordable,
      budgetStatus,
      matchScore,
      matchExplanation,
    };
  });
}

/**
 * Calculate a simple match score (0-100) for ranking properties.
 *
 * Scoring factors:
 * - Budget fit (40 points): How well the property fits the monthly budget
 * - Location match (25 points): Whether the property is in the preferred location
 * - Bedroom match (20 points): Whether the property meets minimum bedroom requirement
 * - Down payment feasibility (15 points): Whether the required down payment is covered
 */
function calculateMatchScore(
  property: Property,
  inputs: AffordabilityInputs,
  result: AffordabilityResult,
  estimatedMonthlyMortgage: number,
  isAffordable: boolean
): number {
  let score = 0;

  const hasComparableBudget =
    Number.isFinite(result.estimatedMortgageBudget) &&
    result.estimatedMortgageBudget > 0 &&
    Number.isFinite(estimatedMonthlyMortgage);

  // Budget fit (40 points)
  if (isAffordable || (hasComparableBudget && estimatedMonthlyMortgage <= result.estimatedMortgageBudget)) {
    // Properties closer to budget (but under) score higher
    if (hasComparableBudget) {
      const budgetRatio = estimatedMonthlyMortgage / result.estimatedMortgageBudget;
      // Sweet spot: 60-90% of budget scores highest
      if (budgetRatio >= 0.6 && budgetRatio <= 0.9) {
        score += 40;
      } else if (budgetRatio < 0.6) {
        score += 30; // Well under budget
      } else {
        score += 25; // Close to budget limit
      }
    }
  } else if (hasComparableBudget) {
    // Over budget, reduce score based on how much over
    const overRatio = estimatedMonthlyMortgage / result.estimatedMortgageBudget;
    score += Math.max(0, 15 - (overRatio - 1) * 20);
  }

  // Location match (25 points)
  const locationRank = compareLocation(property.location, inputs.preferredLocation);
  if (locationRank === 'match') {
    score += 25;
  } else if (locationRank === 'none') {
    score += 15; // No preference, partial credit
  }

  // Bedroom match (20 points)
  if (inputs.minBedrooms && inputs.minBedrooms > 0) {
    if (property.bedrooms !== null && property.bedrooms >= inputs.minBedrooms) {
      score += 20;
    } else if (property.bedrooms === null) {
      score += 10; // Unknown, partial credit
    }
  } else {
    score += 15; // No preference, partial credit
  }

  // Down payment feasibility (15 points)
  const requiredDP = property.priceMYR * (REQUIRED_DOWN_PAYMENT_PERCENTAGE / 100);
  if (inputs.downPayment >= requiredDP) {
    score += 15;
  } else if (inputs.downPayment >= requiredDP * 0.5) {
    score += 8;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Compare a property's location against a user preference.
 * Matching is case-insensitive substring matching in either direction so that
 * "Kuala Lumpur" matches "Cheras, Kuala Lumpur".
 *
 * @returns 'match', 'mismatch', or 'none' when there is no preference
 */
export function compareLocation(
  propertyLocation: string,
  preferredLocation?: string
): 'match' | 'mismatch' | 'none' {
  const preferred = (preferredLocation || '').trim().toLowerCase();
  if (!preferred) return 'none';

  const actual = (propertyLocation || '').trim().toLowerCase();
  if (!actual) return 'mismatch';

  return actual.includes(preferred) || preferred.includes(actual)
    ? 'match'
    : 'mismatch';
}

/**
 * Generate a human-readable match explanation.
 */
function generateMatchExplanation(
  property: Property,
  inputs: AffordabilityInputs,
  result: AffordabilityResult,
  estimatedMonthlyMortgage: number,
  requiredDownPayment: number,
  cashShortfall: number,
  estimatedDSR: number,
  isAffordable: boolean,
  isWithinMortgageBudget: boolean,
  hasEnoughDownPayment: boolean
): string {
  const reasons: string[] = [];

  if (isAffordable) {
    reasons.push('This property is within your estimated budget.');
  }

  if (isWithinMortgageBudget) {
    const budgetUsage =
      result.estimatedMortgageBudget > 0
        ? Math.round((estimatedMonthlyMortgage / result.estimatedMortgageBudget) * 100)
        : 0;
    reasons.push(`Estimated repayment uses ~${budgetUsage}% of your monthly mortgage budget.`);
  } else {
    reasons.push('Estimated repayment exceeds your calculated monthly budget.');
  }

  if (!hasEnoughDownPayment) {
    reasons.push(
      `Down payment shortfall: ~RM ${Math.round(cashShortfall).toLocaleString('en-MY')} ` +
        `(you have RM ${Math.round(inputs.downPayment).toLocaleString('en-MY')}, ` +
        `this price needs RM ${Math.round(requiredDownPayment).toLocaleString('en-MY')}).`
    );
  } else {
    reasons.push('Your available cash covers the required down payment.');
  }

  if (compareLocation(property.location, inputs.preferredLocation) === 'match') {
    reasons.push('Located in your preferred area.');
  }

  if (inputs.minBedrooms && property.bedrooms !== null) {
    if (property.bedrooms >= inputs.minBedrooms) {
      reasons.push(`Meets your ${inputs.minBedrooms}+ bedroom requirement.`);
    } else {
      reasons.push(`Has ${property.bedrooms} bedroom(s), below your ${inputs.minBedrooms} minimum.`);
    }
  }

  reasons.push(`Estimated DSR with this property: ${estimatedDSR.toFixed(1)}%.`);

  return reasons.join(' ');
}

export interface PropertyFilters {
  location: string;
  propertyType: string;
  minBedrooms: number;
  maxPrice: number;
  affordableOnly: boolean;
}

export type SortOption = 'match' | 'price-asc' | 'price-desc' | 'mortgage-asc';

export const DEFAULT_FILTERS: PropertyFilters = {
  location: 'All',
  propertyType: 'All',
  minBedrooms: 0,
  maxPrice: 0,
  affordableOnly: false,
};

/**
 * Build explorer filters from the preferences submitted with the form, so that
 * a chosen preferred location and minimum bedrooms actually filter the list
 * rather than only affecting the match score.
 */
export function filtersFromPreferences(
  inputs: AffordabilityInputs | null | undefined
): PropertyFilters {
  const preferredLocation = (inputs?.preferredLocation || '').trim();
  const minBedrooms = inputs?.minBedrooms && inputs.minBedrooms > 0
    ? Math.floor(inputs.minBedrooms)
    : 0;

  return {
    ...DEFAULT_FILTERS,
    location: preferredLocation || DEFAULT_FILTERS.location,
    minBedrooms,
  };
}

export interface FilterResult {
  properties: PropertyWithCalculations[];
  /**
   * How many properties were excluded only because a minimum-bedroom filter is
   * active and their bedroom count is unknown. Reported so the UI can explain
   * the omission instead of hiding it.
   */
  hiddenUnknownBedrooms: number;
}

/**
 * Filter properties based on user preferences and filters.
 *
 * Unknown bedroom counts are treated as NOT meeting an active minimum-bedroom
 * filter (missing data is never treated as zero, and never silently assumed to
 * qualify). When no bedroom filter is active, those properties stay visible.
 */
export function filterPropertiesWithMeta(
  properties: PropertyWithCalculations[],
  filters: PropertyFilters
): FilterResult {
  const minBedrooms = filters.minBedrooms > 0 ? filters.minBedrooms : 0;
  let hiddenUnknownBedrooms = 0;

  const filtered = properties.filter((p) => {
    // Location filter (case-insensitive substring, either direction)
    if (filters.location && filters.location !== 'All') {
      if (compareLocation(p.location, filters.location) !== 'match') {
        return false;
      }
    }

    // Property type filter
    if (filters.propertyType && filters.propertyType !== 'All') {
      if (p.propertyType !== filters.propertyType) {
        return false;
      }
    }

    // Bedrooms filter
    if (minBedrooms > 0) {
      if (p.bedrooms === null) {
        hiddenUnknownBedrooms += 1;
        return false;
      }
      if (p.bedrooms < minBedrooms) {
        return false;
      }
    }

    // Max price filter
    if (filters.maxPrice && filters.maxPrice > 0) {
      if (p.priceMYR > filters.maxPrice) {
        return false;
      }
    }

    // Affordability filter
    if (filters.affordableOnly) {
      if (!p.isAffordable) {
        return false;
      }
    }

    return true;
  });

  return { properties: filtered, hiddenUnknownBedrooms };
}

/**
 * Filter properties based on user preferences and filters.
 * Convenience wrapper around filterPropertiesWithMeta when the hidden count is
 * not needed.
 */
export function filterProperties(
  properties: PropertyWithCalculations[],
  filters: PropertyFilters
): PropertyWithCalculations[] {
  return filterPropertiesWithMeta(properties, filters).properties;
}

/**
 * Sort properties by the selected criteria.
 */
export function sortProperties(
  properties: PropertyWithCalculations[],
  sortBy: SortOption
): PropertyWithCalculations[] {
  const sorted = [...properties];

  switch (sortBy) {
    case 'match':
      sorted.sort((a, b) => b.matchScore - a.matchScore);
      break;
    case 'price-asc':
      sorted.sort((a, b) => a.priceMYR - b.priceMYR);
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.priceMYR - a.priceMYR);
      break;
    case 'mortgage-asc':
      sorted.sort((a, b) => a.estimatedMonthlyMortgage - b.estimatedMonthlyMortgage);
      break;
    default:
      sorted.sort((a, b) => b.matchScore - a.matchScore);
  }

  return sorted;
}
