/**
 * Property filtering, scoring, ranking, and the "uncalculated" state.
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
 *
 * UNCALCULATED STATE
 * Independent property search must work before the calculator is used. In that
 * state the budget-dependent fields are NULL and the status is 'uncalculated',
 * never 0 or a fabricated verdict.
 *
 * FACILITY FILTERING
 * `facilities` is a normalized array per property. An active facility filter is a
 * conjunction (every selected facility must be present) and matching is
 * case-insensitive. Only genuinely synonymous wording is aliased; a property is
 * never treated as having a facility it does not list.
 */

import {
  Property,
  PropertyWithCalculations,
  PropertyBudgetStatus,
} from '../types/property';
import {
  AffordabilityInputs,
  AffordabilityResult,
  REQUIRED_DOWN_PAYMENT_PERCENTAGE,
} from '../types/affordability';
import { calculateMonthlyMortgage } from './mortgage';
import { calculateDSR } from './dsr';
import { sanitizeAffordabilityInputs } from './affordability';

/* ------------------------------------------------------------------ */
/* Uncalculated state                                                 */
/* ------------------------------------------------------------------ */

/**
 * Enrich properties without any affordability calculation.
 *
 * This is the state an independent search starts in. Every budget-dependent
 * field is null and `budgetStatus` is 'uncalculated', so the UI must render a
 * neutral placeholder rather than "Within budget" or "Over budget".
 */
export function toUncalculatedProperties(properties: Property[]): PropertyWithCalculations[] {
  return properties.map((property) => ({
    ...property,
    estimatedMonthlyMortgage: null,
    requiredDownPayment: null,
    downPaymentApplied: null,
    cashShortfall: null,
    loanPrincipal: null,
    estimatedDSR: null,
    isAffordable: null,
    budgetStatus: 'uncalculated' as PropertyBudgetStatus,
    // Neutral ordering score only; not a recommendation or a match verdict.
    matchScore: 0,
    matchExplanation: '',
  }));
}

/* ------------------------------------------------------------------ */
/* Calculated state                                                   */
/* ------------------------------------------------------------------ */

/**
 * Enrich properties with affordability calculations for a given user profile.
 *
 * Inputs are sanitised first, so this is safe to call with raw form values.
 */
export function enrichPropertiesWithCalculations(
  properties: Property[],
  inputs: AffordabilityInputs,
  result: AffordabilityResult
): PropertyWithCalculations[] {
  const safeInputs = sanitizeAffordabilityInputs(inputs);

  return properties.map((property) => {
    const price = property.priceMYR;
    if (price === null) {
      return toUncalculatedProperties([property])[0];
    }

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
      price,
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
  price: number,
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
  if (
    isAffordable ||
    (hasComparableBudget && estimatedMonthlyMortgage <= result.estimatedMortgageBudget)
  ) {
    // Properties closer to budget (but under) score higher
    if (hasComparableBudget) {
      const budgetRatio = estimatedMonthlyMortgage / result.estimatedMortgageBudget;
      // Sweet spot: 60-90% of budget scores highest
      if (budgetRatio >= 0.6 && budgetRatio <= 0.9) {
        score += 40;
      } else if (budgetRatio < 0.6) {
        score += 30;
      } else {
        score += 25;
      }
    }
  } else if (hasComparableBudget) {
    const overRatio = estimatedMonthlyMortgage / result.estimatedMortgageBudget;
    score += Math.max(0, 15 - (overRatio - 1) * 20);
  }

  // Location match (25 points)
  const locationRank = compareLocation(property.location, inputs.preferredLocation);
  if (locationRank === 'match') {
    score += 25;
  } else if (locationRank === 'none') {
    score += 15;
  }

  // Bedroom match (20 points)
  if (inputs.minBedrooms && inputs.minBedrooms > 0) {
    if (property.bedrooms !== null && property.bedrooms >= inputs.minBedrooms) {
      score += 20;
    } else if (property.bedrooms === null) {
      score += 10;
    }
  } else {
    score += 15;
  }

  // Down payment feasibility (15 points)
  const requiredDP = price * (REQUIRED_DOWN_PAYMENT_PERCENTAGE / 100);
  if (inputs.downPayment >= requiredDP) {
    score += 15;
  } else if (inputs.downPayment >= requiredDP * 0.5) {
    score += 8;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Compare a property's location against a user preference.
 * Case-insensitive substring matching in either direction so "Kuala Lumpur"
 * matches "Ampang Hilir, Kuala Lumpur".
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

/** Generate a human-readable match explanation. */
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

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

export interface PropertyFilters {
  search: string;
  /** Free-text location query; matched against location and the recorded address */
  location: string;
  propertyType: string;
  minBedrooms: number;
  maxBedrooms: number;
  minPrice: number;
  maxPrice: number;
  minBathrooms: number;
  minBuiltUpSqft: number;
  /** Every selected facility must be present on the property */
  facilities: string[];
  affordableOnly: boolean;
}

export type SortOption = 'match' | 'price-asc' | 'price-desc' | 'mortgage-asc';

export const DEFAULT_FILTERS: PropertyFilters = {
  search: '',
  location: '',
  propertyType: 'All',
  minBedrooms: 0,
  maxBedrooms: 0,
  minPrice: 0,
  maxPrice: 0,
  minBathrooms: 0,
  minBuiltUpSqft: 0,
  facilities: [],
  affordableOnly: false,
};

/**
 * Seed filters from submitted preferences.
 *
 * `location` is a free-text query, so a preference for "Kuala Lumpur" simply
 * becomes that query. It is not constrained to a fixed dropdown value.
 */
export function filtersFromPreferences(
  inputs: AffordabilityInputs | null | undefined
): PropertyFilters {
  const preferredLocation = (inputs?.preferredLocation || '').trim();
  const minBedrooms =
    inputs?.minBedrooms && inputs.minBedrooms > 0 ? Math.floor(inputs.minBedrooms) : 0;

  return {
    ...DEFAULT_FILTERS,
    location: preferredLocation,
    minBedrooms,
  };
}

/**
 * How a facility label is matched against a property's facility list.
 *
 * Only genuinely synonymous wording is aliased. Nothing is inferred: a property
 * is never treated as having a facility it does not list.
 */
const FACILITY_ALIASES: Record<string, string[]> = {
  gym: ['gym', 'gymnasium', 'fitness centre', 'fitness center'],
  'swimming pool': ['swimming pool', 'pool'],
  parking: ['covered car park', 'car park', 'parking', 'parking bay'],
  security: [
    '24-hour security',
    'security',
    'guarded & gated',
    'gated guarded 24 hours',
    'gated guarded',
  ],
  playground: ['kids playground', 'playground'],
  'jogging track': ['jogging track'],
  bbq: ['bbq', 'barbecue'],
  jacuzzi: ['jacuzzi'],
  'multi-purpose hall': ['multi-purpose hall', 'multipurpose hall'],
  'business centre': ['business centre', 'business center'],
  'badminton hall': ['badminton hall'],
  'basketball court': ['basketball court'],
  'meditation pavilion': ['meditation pavilion'],
  'sky bar': ['sky bar'],
};

/** True when a property lists the requested facility. */
export function hasFacility(property: Property, facility: string): boolean {
  const wanted = facility.trim().toLowerCase();
  if (!wanted) return false;

  const aliases = FACILITY_ALIASES[wanted] ?? [wanted];
  const owned = (property.facilities ?? []).map((item) => item.toLowerCase());

  return owned.some((item) => aliases.some((alias) => item === alias || item.includes(alias)));
}

/**
 * The facility options actually present in a catalogue, de-duplicated and mapped
 * onto canonical labels.
 *
 * Options are derived from the records rather than hard-coded, so a control can
 * never offer a facility that no property has.
 */
export function availableFacilities(properties: Property[]): string[] {
  const map = new Map<string, string>();

  const canonical = (label: string): string => {
    const lower = label.toLowerCase();
    for (const [key, aliases] of Object.entries(FACILITY_ALIASES)) {
      if (aliases.some((alias) => lower === alias || lower.includes(alias))) {
        return key.replace(/\b\w/g, (char) => char.toUpperCase());
      }
    }
    return label;
  };

  for (const property of properties) {
    for (const facility of property.facilities ?? []) {
      const label = canonical(facility);
      const key = label.toLowerCase();
      if (!map.has(key)) map.set(key, label);
    }
  }

  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

export interface FilterResult {
  properties: PropertyWithCalculations[];
  /**
   * How many properties were excluded only because a bedroom filter is active
   * and their bedroom count is unknown.
   */
  hiddenUnknownBedrooms: number;
}

/**
 * Filter properties.
 *
 * Filters are conjunctive and applied to the CURRENT filter values, so the
 * displayed controls, the count and the results cannot disagree.
 *
 * Unknown bedroom counts are treated as not meeting an active bedroom filter.
 * Missing data is never treated as zero and never assumed to qualify.
 */
export function filterPropertiesWithMeta(
  properties: PropertyWithCalculations[],
  filters: PropertyFilters
): FilterResult {
  const minBedrooms = filters.minBedrooms > 0 ? filters.minBedrooms : 0;
  const maxBedrooms = filters.maxBedrooms > 0 ? filters.maxBedrooms : 0;
  const locationQuery = filters.location.trim();
  const searchQuery = filters.search.trim().toLocaleLowerCase();

  let hiddenUnknownBedrooms = 0;

  const filtered = properties.filter((property) => {
    if (searchQuery) {
      const searchable = [
        property.propertyName,
        property.location,
        property.address,
        property.propertyType,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      if (!searchable.includes(searchQuery)) return false;
    }

    // Location: free text, matched against area and the recorded project address.
    if (locationQuery && locationQuery.toLowerCase() !== 'all') {
      const haystack = `${property.location} ${property.address ?? ''}`.toLowerCase();
      if (!haystack.includes(locationQuery.toLowerCase())) return false;
    }

    if (filters.propertyType && filters.propertyType !== 'All') {
      if (property.propertyType !== filters.propertyType) return false;
    }

    if (minBedrooms > 0 || maxBedrooms > 0) {
      if (property.bedrooms === null) {
        hiddenUnknownBedrooms += 1;
        return false;
      }
      if (minBedrooms > 0 && property.bedrooms < minBedrooms) return false;
      if (maxBedrooms > 0 && property.bedrooms > maxBedrooms) return false;
    }

    if (filters.minBathrooms > 0) {
      if (property.bathrooms === null || property.bathrooms < filters.minBathrooms) return false;
    }

    if (filters.minBuiltUpSqft > 0) {
      if (property.builtUpSqft === null || property.builtUpSqft < filters.minBuiltUpSqft) {
        return false;
      }
    }

    if (filters.minPrice > 0 && (property.priceMYR === null || property.priceMYR < filters.minPrice)) return false;
    if (filters.maxPrice > 0 && (property.priceMYR === null || property.priceMYR > filters.maxPrice)) return false;

    if (filters.facilities.length > 0) {
      const hasAll = filters.facilities.every((facility) => hasFacility(property, facility));
      if (!hasAll) return false;
    }

    // Affordability filter applies only when a calculation exists. Selecting it
    // before calculating yields no results rather than fabricated ones.
    if (filters.affordableOnly) {
      if (property.isAffordable !== true) return false;
    }

    return true;
  });

  return { properties: filtered, hiddenUnknownBedrooms };
}

/** Convenience wrapper when the hidden count is not needed. */
export function filterProperties(
  properties: PropertyWithCalculations[],
  filters: PropertyFilters
): PropertyWithCalculations[] {
  return filterPropertiesWithMeta(properties, filters).properties;
}

/**
 * Sort properties.
 *
 * Uncalculated records sort after calculated ones for the mortgage sort, so a
 * missing figure never appears to be the cheapest. Ties fall back to price for
 * deterministic output.
 */
export function sortProperties(
  properties: PropertyWithCalculations[],
  sortBy: SortOption
): PropertyWithCalculations[] {
  const sorted = [...properties];
  const comparePrice = (a: PropertyWithCalculations, b: PropertyWithCalculations) => {
    if (a.priceMYR === null && b.priceMYR === null) return a.propertyName.localeCompare(b.propertyName);
    if (a.priceMYR === null) return 1;
    if (b.priceMYR === null) return -1;
    return a.priceMYR - b.priceMYR;
  };
  const comparePriceDescending = (a: PropertyWithCalculations, b: PropertyWithCalculations) => {
    if (a.priceMYR === null && b.priceMYR === null) return a.propertyName.localeCompare(b.propertyName);
    if (a.priceMYR === null) return 1;
    if (b.priceMYR === null) return -1;
    return b.priceMYR - a.priceMYR;
  };

  switch (sortBy) {
    case 'match':
      sorted.sort((a, b) =>
        budgetStatusRank(a.budgetStatus) - budgetStatusRank(b.budgetStatus) ||
        b.matchScore - a.matchScore ||
        comparePrice(a, b)
      );
      break;
    case 'price-asc':
      sorted.sort(comparePrice);
      break;
    case 'price-desc':
      sorted.sort(comparePriceDescending);
      break;
    case 'mortgage-asc':
      sorted.sort((a, b) => {
        const left = a.estimatedMonthlyMortgage;
        const right = b.estimatedMonthlyMortgage;
        if (left === null && right === null) return comparePrice(a, b);
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right;
      });
      break;
    default:
      sorted.sort((a, b) =>
        budgetStatusRank(a.budgetStatus) - budgetStatusRank(b.budgetStatus) ||
        b.matchScore - a.matchScore ||
        comparePrice(a, b)
      );
  }

  return sorted;
}

function budgetStatusRank(status: PropertyWithCalculations['budgetStatus']): number {
  switch (status) {
    case 'affordable': return 0;
    case 'insufficientDownPayment': return 1;
    case 'overMonthlyBudget': return 2;
    case 'uncalculated': return 3;
  }
}
