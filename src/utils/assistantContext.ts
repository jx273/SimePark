/**
 * Builds the context object handed to the AI assistant.
 *
 * Everything here comes from the app's own deterministic pipeline:
 * `calculateAffordability()` and `enrichPropertiesWithCalculations()`.
 * Nothing is inferred, estimated, or invented on the client, and the assistant
 * is told to treat these values as read-only facts.
 */

import {
  ASSISTANT_LIMITS,
  type AssistantContext,
  type AssistantContextAffordability,
  type AssistantContextInputs,
  type AssistantContextProperty,
} from '../types/assistant';
import {
  REQUIRED_DOWN_PAYMENT_PERCENTAGE,
  type AffordabilityInputs,
  type AffordabilityResult,
} from '../types/affordability';
import type { PropertyWithCalculations } from '../types/property';

/** Select the properties worth describing to the model. */
export function selectContextProperties(
  properties: PropertyWithCalculations[],
  limit: number = ASSISTANT_LIMITS.maxContextProperties
): PropertyWithCalculations[] {
  if (properties.length <= limit) return properties;

  const affordable = properties.filter((property) => property.isAffordable);
  const rest = properties.filter((property) => !property.isAffordable);

  // Keep every affordable match first, then fill the remaining slots by score,
  // so the model can answer "what can I actually afford" as well as "top match".
  return [...affordable, ...rest]
    .slice(0, limit)
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function toContextProperty(
  property: PropertyWithCalculations
): AssistantContextProperty {
  return {
    id: property.id,
    propertyName: property.propertyName,
    location: property.location,
    priceMYR: property.priceMYR,
    propertyType: property.propertyType ?? 'Not recorded',
    bedrooms: property.bedrooms,
    builtUpSqft: property.builtUpSqft,
    estimatedMonthlyMortgage: property.estimatedMonthlyMortgage,
    requiredDownPayment: property.requiredDownPayment,
    cashShortfall: property.cashShortfall,
    estimatedDSR: property.estimatedDSR,
    isAffordable: property.isAffordable,
    budgetStatus: property.budgetStatus,
    matchScore: property.matchScore,
    matchExplanation: property.matchExplanation,
    sourceUrl: property.sourceUrl,
    isExample: property.isExample,
    // Provenance travels with the record so the assistant can label status
    // without inferring it. Never populated speculatively.
    verifiedDate: property.verifiedDate,
  };
}

export function toContextInputs(inputs: AffordabilityInputs): AssistantContextInputs {
  const contextInputs: AssistantContextInputs = {
    monthlyIncome: inputs.monthlyIncome,
    monthlyDebts: inputs.monthlyDebts,
    downPayment: inputs.downPayment,
    annualInterestRate: inputs.annualInterestRate,
    loanTenureYears: inputs.loanTenureYears,
  };

  if (inputs.preferredMaxMonthlyPayment) {
    contextInputs.preferredMaxMonthlyPayment = inputs.preferredMaxMonthlyPayment;
  }
  if (inputs.preferredLocation) {
    contextInputs.preferredLocation = inputs.preferredLocation;
  }
  if (inputs.minBedrooms) {
    contextInputs.minBedrooms = inputs.minBedrooms;
  }

  return contextInputs;
}

export function toContextAffordability(
  result: AffordabilityResult
): AssistantContextAffordability {
  return {
    estimatedMaxPropertyPrice: result.estimatedMaxPropertyPrice,
    maxPropertyPriceByRepayment: result.maxPropertyPriceByRepayment,
    maxPropertyPriceByCash: result.maxPropertyPriceByCash,
    limitingFactor: result.limitingFactor,
    bindingConstraint: result.bindingConstraint,
    estimatedMortgageBudget: result.estimatedMortgageBudget,
    estimatedMaxLoanPrincipal: result.estimatedMaxLoanPrincipal,
    currentDSR: result.currentDSR,
    illustrativeDSRCap: result.illustrativeDSRCap,
    requiredDownPaymentPercentage: REQUIRED_DOWN_PAYMENT_PERCENTAGE,
    hasViableBudget: result.hasViableBudget,
    limitedReason: result.limitedReason,
  };
}

export interface BuildAssistantContextArgs {
  inputs: AffordabilityInputs | null;
  affordabilityResult: AffordabilityResult | null;
  /** Properties currently listed in the explorer after the user's filters. */
  properties: PropertyWithCalculations[];
  /** The property open in the detail view, if any. */
  selectedProperty?: PropertyWithCalculations | null;
  /** Properties the user explicitly selected for comparison. */
  comparisonProperties?: PropertyWithCalculations[];
}

/**
 * Assemble the full context. Safe to call at any point: before the form is
 * submitted it simply reports that there is no affordability result yet.
 */
export function buildAssistantContext({
  inputs,
  affordabilityResult,
  properties,
  selectedProperty = null,
  comparisonProperties = [],
}: BuildAssistantContextArgs): AssistantContext {
  const hasAffordabilityResult = Boolean(inputs && affordabilityResult);
  const selected = selectedProperty ? toContextProperty(selectedProperty) : null;

  return {
    hasAffordabilityResult,
    inputs: inputs ? toContextInputs(inputs) : null,
    affordability: affordabilityResult
      ? toContextAffordability(affordabilityResult)
      : null,
    properties: hasAffordabilityResult
      ? selectContextProperties(properties).map(toContextProperty)
      : [],
    totalListedProperties: properties.length,
    selectedProperty: selected,
    // Comparison selection is available to guests too, so it is sent regardless
    // of whether an affordability result exists.
    comparisonProperties: comparisonProperties
      .slice(0, ASSISTANT_LIMITS.maxComparisonProperties)
      .map(toContextProperty),
  };
}
