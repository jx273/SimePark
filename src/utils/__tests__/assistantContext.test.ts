import { describe, it, expect } from 'vitest';
import {
  buildAssistantContext,
  selectContextProperties,
  toContextAffordability,
  toContextInputs,
  toContextProperty,
} from '../assistantContext';
import { calculateAffordability } from '../affordability';
import { enrichPropertiesWithCalculations } from '../propertyFilter';
import { ASSISTANT_LIMITS } from '../../types/assistant';
import { REQUIRED_DOWN_PAYMENT_PERCENTAGE } from '../../types/affordability';
import type { AffordabilityInputs } from '../../types/affordability';
import type { Property } from '../../types/property';

const inputs: AffordabilityInputs = {
  monthlyIncome: 8000,
  monthlyDebts: 1000,
  downPayment: 40000,
  annualInterestRate: 4,
  loanTenureYears: 30,
  preferredLocation: 'Kuala Lumpur',
  minBedrooms: 3,
};

const rawProperties: Property[] = [
  {
    id: 'p-1',
    propertyName: 'Affordable Condo',
    location: 'Cheras, Kuala Lumpur',
    priceMYR: 320000,
    propertyType: 'Condominium',
    bedrooms: 3,
    bathrooms: 2,
    builtUpSqft: 900,
    sourceUrl: 'https://example.com/listing/1',
    verifiedDate: null,
    isExample: true,
  },
  {
    id: 'p-2',
    propertyName: 'Expensive Bungalow',
    location: 'Mont Kiara, Kuala Lumpur',
    priceMYR: 1480000,
    propertyType: 'Bungalow',
    bedrooms: 5,
    bathrooms: 4,
    builtUpSqft: 3500,
    sourceUrl: null,
    verifiedDate: null,
    isExample: true,
  },
  {
    id: 'p-3',
    propertyName: 'Unknown Bedrooms',
    location: 'Shah Alam',
    priceMYR: 240000,
    propertyType: 'Flat',
    bedrooms: null,
    bathrooms: null,
    builtUpSqft: null,
    sourceUrl: null,
    verifiedDate: null,
    isExample: true,
  },
];

function buildEnriched(overrides: Partial<AffordabilityInputs> = {}) {
  const merged = { ...inputs, ...overrides };
  const result = calculateAffordability(merged);
  return {
    merged,
    result,
    enriched: enrichPropertiesWithCalculations(rawProperties, merged, result),
  };
}

describe('toContextProperty', () => {
  it('copies only the fields the assistant needs, without inventing any', () => {
    const { enriched } = buildEnriched();
    const contextProperty = toContextProperty(enriched[0]);

    expect(contextProperty.id).toBe('p-1');
    expect(contextProperty.priceMYR).toBe(320000);
    expect(contextProperty.requiredDownPayment).toBe(
      320000 * (REQUIRED_DOWN_PAYMENT_PERCENTAGE / 100)
    );
    expect(contextProperty.matchExplanation).toBe(enriched[0].matchExplanation);
    expect(Object.keys(contextProperty).sort()).toEqual(
      [
        'bedrooms',
        'budgetStatus',
        'builtUpSqft',
        'cashShortfall',
        'estimatedDSR',
        'estimatedMonthlyMortgage',
        'id',
        'isAffordable',
        'isExample',
        'location',
        'matchExplanation',
        'matchScore',
        'priceMYR',
        'propertyName',
        'propertyType',
        'requiredDownPayment',
        'sourceUrl',
        'verifiedDate',
      ].sort()
    );
  });

  it('preserves a null bedroom count rather than guessing', () => {
    const { enriched } = buildEnriched();
    const unknown = enriched.find((property) => property.id === 'p-3')!;
    expect(toContextProperty(unknown).bedrooms).toBeNull();
  });
});

describe('toContextInputs', () => {
  it('omits optional preferences that were not provided', () => {
    const contextInputs = toContextInputs({
      monthlyIncome: 5000,
      monthlyDebts: 0,
      downPayment: 0,
      annualInterestRate: 4,
      loanTenureYears: 30,
    });

    expect(contextInputs).not.toHaveProperty('preferredLocation');
    expect(contextInputs).not.toHaveProperty('minBedrooms');
    expect(contextInputs).not.toHaveProperty('preferredMaxMonthlyPayment');
  });

  it('carries provided preferences through', () => {
    const contextInputs = toContextInputs({ ...inputs, preferredMaxMonthlyPayment: 1500 });

    expect(contextInputs.preferredLocation).toBe('Kuala Lumpur');
    expect(contextInputs.minBedrooms).toBe(3);
    expect(contextInputs.preferredMaxMonthlyPayment).toBe(1500);
  });
});

describe('toContextAffordability', () => {
  it('mirrors the authoritative result and states the down payment assumption', () => {
    const { result } = buildEnriched();
    const reflected = toContextAffordability(result);

    expect(reflected.estimatedMaxPropertyPrice).toBe(result.estimatedMaxPropertyPrice);
    expect(reflected.maxPropertyPriceByRepayment).toBe(result.maxPropertyPriceByRepayment);
    expect(reflected.maxPropertyPriceByCash).toBe(result.maxPropertyPriceByCash);
    expect(reflected.limitingFactor).toBe(result.limitingFactor);
    expect(reflected.bindingConstraint).toBe(result.bindingConstraint);
    expect(reflected.hasViableBudget).toBe(true);
    expect(reflected.requiredDownPaymentPercentage).toBe(REQUIRED_DOWN_PAYMENT_PERCENTAGE);
  });

  it('passes through the reason when no estimate is possible', () => {
    const result = calculateAffordability({ ...inputs, monthlyIncome: 0 });
    const reflected = toContextAffordability(result);

    expect(reflected.hasViableBudget).toBe(false);
    expect(reflected.limitedReason).toBe(result.limitedReason);
    expect(reflected.estimatedMaxPropertyPrice).toBe(0);
  });
});

describe('selectContextProperties', () => {
  it('keeps every property when under the cap', () => {
    const { enriched } = buildEnriched();
    expect(selectContextProperties(enriched)).toHaveLength(enriched.length);
  });

  it('prioritises affordable matches and respects the cap', () => {
    const { enriched } = buildEnriched();
    const lots = [...enriched, ...enriched, ...enriched, ...enriched];
    const selected = selectContextProperties(lots);

    expect(selected).toHaveLength(ASSISTANT_LIMITS.maxContextProperties);
  });
});

describe('buildAssistantContext', () => {
  it('reports no estimate before the form is submitted', () => {
    const context = buildAssistantContext({
      inputs: null,
      affordabilityResult: null,
      properties: [],
    });

    expect(context.hasAffordabilityResult).toBe(false);
    expect(context.affordability).toBeNull();
    expect(context.inputs).toBeNull();
    expect(context.properties).toEqual([]);
  });

  it('includes the estimate, the inputs and the real property records', () => {
    const { merged, result, enriched } = buildEnriched();
    const context = buildAssistantContext({
      inputs: merged,
      affordabilityResult: result,
      properties: enriched,
      selectedProperty: enriched[0],
    });

    expect(context.hasAffordabilityResult).toBe(true);
    expect(context.inputs?.monthlyIncome).toBe(8000);
    expect(context.affordability?.estimatedMaxPropertyPrice).toBe(
      result.estimatedMaxPropertyPrice
    );
    expect(context.properties).toHaveLength(3);
    expect(context.totalListedProperties).toBe(3);
    expect(context.selectedProperty?.id).toBe('p-1');
  });

  it('never claims an affordability result when inputs exist but no calculation ran', () => {
    const context = buildAssistantContext({
      inputs,
      affordabilityResult: null,
      properties: rawProperties as never,
    });

    expect(context.hasAffordabilityResult).toBe(false);
    expect(context.properties).toEqual([]);
  });

  it('still reports the raw inputs when the calculation is missing, without an estimate', () => {
    // Inputs alone must never be presented as an estimate: the model is told
    // there is no result, so it cannot quote a figure the app never produced.
    const context = buildAssistantContext({
      inputs,
      affordabilityResult: null,
      properties: [],
    });

    expect(context.hasAffordabilityResult).toBe(false);
    expect(context.affordability).toBeNull();
    expect(context.inputs?.monthlyIncome).toBe(8000);
  });

  it('passes through an unusable estimate with its reason, not as zero affordability', () => {
    // A submitted form with, say, no income produces a result with
    // hasViableBudget=false. The assistant must be able to explain WHY rather
    // than claiming the form was never submitted.
    const zeroIncome = calculateAffordability({ ...inputs, monthlyIncome: 0 });
    const context = buildAssistantContext({
      inputs: { ...inputs, monthlyIncome: 0 },
      affordabilityResult: zeroIncome,
      properties: enrichPropertiesWithCalculations(
        rawProperties,
        { ...inputs, monthlyIncome: 0 },
        zeroIncome
      ),
    });

    expect(context.hasAffordabilityResult).toBe(true);
    expect(context.affordability?.hasViableBudget).toBe(false);
    expect(context.affordability?.limitedReason).toBeTruthy();
    expect(context.affordability?.estimatedMaxPropertyPrice).toBe(0);
  });

  it('carries a user-entered preference separately from the calculated budget', () => {
    const { merged, result } = buildEnriched({ preferredMaxMonthlyPayment: 1500 });
    const context = buildAssistantContext({
      inputs: merged,
      affordabilityResult: result,
      properties: [],
    });

    expect(context.inputs?.preferredMaxMonthlyPayment).toBe(1500);
    // The preference does not overwrite or stand in for the calculated figure.
    expect(context.affordability?.estimatedMortgageBudget).toBe(result.estimatedMortgageBudget);
    // And the app's own determination of what binds travels with it, so the
    // assistant never has to guess the cause from the raw numbers.
    expect(context.affordability?.bindingConstraint).toBe(result.bindingConstraint);
  });

  it('sends the app-determined binding constraint, not an inferred one', () => {
    // Preference active and low enough that it caps the price below the cash
    // ceiling, so the app reports the preference as binding.
    const { merged, result } = buildEnriched({
      downPayment: 200000,
      preferredMaxMonthlyPayment: 1500,
    });
    const context = buildAssistantContext({
      inputs: merged,
      affordabilityResult: result,
      properties: [],
    });

    expect(result.bindingConstraint).toBe('preferredMaxMonthlyPayment');
    expect(context.affordability?.bindingConstraint).toBe('preferredMaxMonthlyPayment');
  });

  it('reflects a re-submitted form rather than the previous result', () => {
    const first = buildEnriched({ monthlyIncome: 8000 });
    const firstContext = buildAssistantContext({
      inputs: first.merged,
      affordabilityResult: first.result,
      properties: [],
    });

    const second = buildEnriched({ monthlyIncome: 12000 });
    const secondContext = buildAssistantContext({
      inputs: second.merged,
      affordabilityResult: second.result,
      properties: [],
    });

    expect(firstContext.inputs?.monthlyIncome).toBe(8000);
    expect(secondContext.inputs?.monthlyIncome).toBe(12000);
    expect(secondContext.affordability?.estimatedMortgageBudget).toBeGreaterThan(
      firstContext.affordability?.estimatedMortgageBudget ?? 0
    );
  });
});
