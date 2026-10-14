/**
 * Property filtering, scoring, and ranking utilities.
 */

import { Property, PropertyWithCalculations } from '../types/property';
import { AffordabilityInputs, AffordabilityResult, DEFAULT_DOWN_PAYMENT_PERCENTAGE } from '../types/affordability';
import { calculateMonthlyMortgage } from './mortgage';
import { calculateDSR } from './dsr';

/**
 * Enrich properties with affordability calculations for a given user profile.
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
  return properties.map((property) => {
    // Calculate required down payment
    // Use user's fixed down payment if provided, otherwise use percentage
    const requiredDownPayment = property.priceMYR * (DEFAULT_DOWN_PAYMENT_PERCENTAGE / 100);

    // Use the user's available down payment or the required percentage, whichever applies
    const effectiveDownPayment = Math.min(
      Math.max(inputs.downPayment, requiredDownPayment),
      property.priceMYR // Down payment cannot exceed property price
    );

    const loanPrincipal = Math.max(0, property.priceMYR - effectiveDownPayment);

    const estimatedMonthlyMortgage = calculateMonthlyMortgage(
      loanPrincipal,
      inputs.annualInterestRate,
      inputs.loanTenureYears
    );

    const estimatedDSR = calculateDSR(
      inputs.monthlyDebts + estimatedMonthlyMortgage,
      inputs.monthlyIncome
    );

    // A property is "affordable" if:
    // 1. The estimated monthly mortgage is within the user's mortgage budget
    // 2. The user has enough for the required down payment
    const isWithinMortgageBudget = estimatedMonthlyMortgage <= result.estimatedMortgageBudget;
    const hasEnoughDownPayment = inputs.downPayment >= requiredDownPayment;
    const isAffordable = isWithinMortgageBudget && hasEnoughDownPayment;

    // Calculate match score (0-100)
    const matchScore = calculateMatchScore(
      property,
      inputs,
      result,
      estimatedMonthlyMortgage,
      isAffordable
    );

    // Generate match explanation
    const matchExplanation = generateMatchExplanation(
      property,
      inputs,
      result,
      estimatedMonthlyMortgage,
      requiredDownPayment,
      estimatedDSR,
      isAffordable,
      isWithinMortgageBudget,
      hasEnoughDownPayment
    );

    return {
      ...property,
      estimatedMonthlyMortgage,
      requiredDownPayment,
      loanPrincipal,
      estimatedDSR,
      isAffordable,
      matchScore,
      matchExplanation,
    };
  });
}

/**
 * Calculate a simple match score (0-100) for ranking properties.
 *
 * Scoring factors:
 * - Budget fit (40 points): How well the property price fits the user's budget
 * - Location match (25 points): Whether the property is in the preferred location
 * - Bedroom match (20 points): Whether the property meets minimum bedroom requirement
 * - Down payment feasibility (15 points): Whether user can afford the down payment
 */
function calculateMatchScore(
  property: Property,
  inputs: AffordabilityInputs,
  result: AffordabilityResult,
  estimatedMonthlyMortgage: number,
  isAffordable: boolean
): number {
  let score = 0;

  // Budget fit (40 points)
  if (isAffordable) {
    // Properties closer to budget (but under) score higher
    if (result.estimatedMortgageBudget > 0) {
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
  } else {
    // Over budget, reduce score based on how much over
    if (result.estimatedMortgageBudget > 0) {
      const overRatio = estimatedMonthlyMortgage / result.estimatedMortgageBudget;
      score += Math.max(0, 15 - (overRatio - 1) * 20);
    }
  }

  // Location match (25 points)
  if (inputs.preferredLocation) {
    const preferredLower = inputs.preferredLocation.toLowerCase().trim();
    const propertyLower = property.location.toLowerCase();
    if (propertyLower.includes(preferredLower) || preferredLower.includes(propertyLower)) {
      score += 25;
    }
  } else {
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
  const requiredDP = property.priceMYR * (DEFAULT_DOWN_PAYMENT_PERCENTAGE / 100);
  if (inputs.downPayment >= requiredDP) {
    score += 15;
  } else if (inputs.downPayment >= requiredDP * 0.5) {
    score += 8;
  }

  return Math.min(100, Math.round(score));
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
    const budgetUsage = result.estimatedMortgageBudget > 0
      ? Math.round((estimatedMonthlyMortgage / result.estimatedMortgageBudget) * 100)
      : 0;
    reasons.push(`Estimated mortgage uses ~${budgetUsage}% of your mortgage budget.`);
  } else {
    reasons.push('Estimated mortgage exceeds your calculated budget.');
  }

  if (!hasEnoughDownPayment) {
    const shortfall = requiredDownPayment - inputs.downPayment;
    reasons.push(`Down payment shortfall: ~RM ${Math.round(shortfall).toLocaleString('en-MY')}.`);
  }

  if (inputs.preferredLocation) {
    const preferredLower = inputs.preferredLocation.toLowerCase().trim();
    if (property.location.toLowerCase().includes(preferredLower)) {
      reasons.push(`Located in your preferred area.`);
    }
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

/**
 * Filter properties based on user preferences and filters.
 */
export function filterProperties(
  properties: PropertyWithCalculations[],
  filters: PropertyFilters
): PropertyWithCalculations[] {
  return properties.filter((p) => {
    // Location filter
    if (filters.location && filters.location !== 'All') {
      if (!p.location.toLowerCase().includes(filters.location.toLowerCase())) {
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
    if (filters.minBedrooms && filters.minBedrooms > 0) {
      if (p.bedrooms !== null && p.bedrooms < filters.minBedrooms) {
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
