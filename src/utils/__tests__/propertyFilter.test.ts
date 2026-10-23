import { describe, it, expect } from 'vitest';
import {
  enrichPropertiesWithCalculations,
  filterProperties,
  filterPropertiesWithMeta,
  filtersFromPreferences,
  sortProperties,
  compareLocation,
  DEFAULT_FILTERS,
  getLocalizedPropertyType,
} from '../propertyFilter';
import { calculateAffordability } from '../affordability';
import { AffordabilityInputs } from '../../types/affordability';
import { Property } from '../../types/property';

const makeProperty = (overrides: Partial<Property>): Property => ({
  id: 'p',
  propertyName: 'Test Property',
  location: 'Petaling Jaya, Selangor',
  priceMYR: 300000,
  propertyType: 'Condominium',
  bedrooms: 3,
  bathrooms: 2,
  builtUpSqft: 900,
  sourceUrl: null,
  verifiedDate: null,
  isExample: true,
  ...overrides,
});

const inputs: AffordabilityInputs = {
  monthlyIncome: 8000,
  monthlyDebts: 1000,
  downPayment: 40000,
  annualInterestRate: 4.0,
  loanTenureYears: 30,
};

const enrich = (properties: Property[], overrides: Partial<AffordabilityInputs> = {}) => {
  const merged = { ...inputs, ...overrides };
  return enrichPropertiesWithCalculations(
    properties,
    merged,
    calculateAffordability(merged)
  );
};

describe('enrichPropertiesWithCalculations — down payment handling', () => {
  it('applies the cash the user actually has, not the 10% requirement', () => {
    // RM 15,000 cash against a RM 300,000 price: the 10% requirement would be
    // RM 30,000, so the loan must reflect only the RM 15,000 actually available.
    const [property] = enrich([makeProperty({ priceMYR: 300000 })], { downPayment: 15000 });

    expect(property.downPaymentApplied).toBe(15000);
    expect(property.requiredDownPayment).toBe(30000);
    expect(property.loanPrincipal).toBe(285000);
    expect(property.cashShortfall).toBe(15000);
  });

  it('reports the exact shortfall instead of assuming the 10% is covered', () => {
    const [property] = enrich([makeProperty({ priceMYR: 320000 })], { downPayment: 15000 });

    expect(property.requiredDownPayment).toBe(32000);
    expect(property.cashShortfall).toBe(17000);
    expect(property.isAffordable).toBe(false);
    expect(property.budgetStatus).toBe('insufficientDownPayment');
    expect(property.matchExplanation).toContain('shortfall');
  });

  it('marks a property affordable only when repayment and cash both fit', () => {
    // RM 320,000 with RM 40,000 cash: 10% = RM 32,000, so cash covers it and the
    // repayment fits the budget for this profile.
    const [property] = enrich([makeProperty({ priceMYR: 320000 })], { downPayment: 40000 });

    expect(property.cashShortfall).toBe(0);
    expect(property.isAffordable).toBe(true);
    expect(property.budgetStatus).toBe('affordable');
    expect(property.downPaymentApplied).toBe(40000);
  });

  it('distinguishes over-monthly-budget from short-on-cash', () => {
    const properties = enrich(
      [
        makeProperty({ id: 'too-expensive', priceMYR: 1200000 }),
        makeProperty({ id: 'cash-short', priceMYR: 320000 }),
      ],
      { downPayment: 15000 }
    );

    const expensive = properties.find((p) => p.id === 'too-expensive')!;
    const cashShort = properties.find((p) => p.id === 'cash-short')!;

    // Both are unaffordable, but for different reasons.
    expect(expensive.isAffordable).toBe(false);
    expect(expensive.budgetStatus).toBe('overMonthlyBudget');
    expect(cashShort.isAffordable).toBe(false);
    expect(cashShort.budgetStatus).toBe('insufficientDownPayment');
  });

  it('never applies more cash than the property price', () => {
    const [property] = enrich([makeProperty({ priceMYR: 200000 })], { downPayment: 500000 });

    expect(property.downPaymentApplied).toBe(200000);
    expect(property.loanPrincipal).toBe(0);
    expect(property.estimatedMonthlyMortgage).toBe(0);
    expect(property.cashShortfall).toBe(0);
  });

  it('marks outright cash purchases with RM0 mortgage as affordable, not overMonthlyBudget', () => {
    // Regression test for Bug 2: When buyer has enough cash to buy outright,
    // estimated monthly mortgage is RM0 and must not trigger "overMonthlyBudget".
    const [property] = enrich(
      [makeProperty({ id: 'cash-buy', priceMYR: 250000 })],
      { downPayment: 300000, monthlyIncome: 3000, monthlyDebts: 500 }
    );

    expect(property.loanPrincipal).toBe(0);
    expect(property.estimatedMonthlyMortgage).toBe(0);
    expect(property.isAffordable).toBe(true);
    expect(property.budgetStatus).toBe('affordable');
    expect(property.matchExplanation).not.toContain('exceeds');
  });

  it('keeps every derived number finite for hostile input', () => {
    const merged: AffordabilityInputs = {
      monthlyIncome: NaN,
      monthlyDebts: NaN,
      downPayment: NaN,
      annualInterestRate: NaN,
      loanTenureYears: NaN,
    };
    const [property] = enrichPropertiesWithCalculations(
      [makeProperty({})],
      merged,
      calculateAffordability(merged)
    );

    for (const key of [
      'estimatedMonthlyMortgage',
      'requiredDownPayment',
      'downPaymentApplied',
      'cashShortfall',
      'loanPrincipal',
      'estimatedDSR',
      'matchScore',
    ] as const) {
      expect(Number.isFinite(property[key])).toBe(true);
    }
    expect(property.isAffordable).toBe(false);
  });
});

describe('filtersFromPreferences', () => {
  it('seeds location and minimum bedrooms from submitted preferences', () => {
    const filters = filtersFromPreferences({
      ...inputs,
      preferredLocation: 'Kuala Lumpur',
      minBedrooms: 3,
    });

    expect(filters.location).toBe('Kuala Lumpur');
    expect(filters.minBedrooms).toBe(3);
    expect(filters.propertyType).toBe(DEFAULT_FILTERS.propertyType);
    expect(filters.affordableOnly).toBe(false);
  });

  it('falls back to defaults when there are no preferences', () => {
    expect(filtersFromPreferences(null)).toEqual(DEFAULT_FILTERS);
    expect(filtersFromPreferences(undefined)).toEqual(DEFAULT_FILTERS);
    expect(filtersFromPreferences({ ...inputs, minBedrooms: 0 })).toEqual(DEFAULT_FILTERS);
  });
});

describe('compareLocation', () => {
  it('matches a city against a fuller address, case-insensitively', () => {
    expect(compareLocation('Cheras, Kuala Lumpur', 'Kuala Lumpur')).toBe('match');
    expect(compareLocation('Cheras, Kuala Lumpur', 'kuala lumpur')).toBe('match');
    expect(compareLocation('Cheras, Kuala Lumpur', 'Petaling Jaya')).toBe('mismatch');
  });

  it('reports no preference when nothing is selected', () => {
    expect(compareLocation('Cheras, Kuala Lumpur', '')).toBe('none');
    expect(compareLocation('Cheras, Kuala Lumpur', undefined)).toBe('none');
    expect(compareLocation('Cheras, Kuala Lumpur', '   ')).toBe('none');
  });
});

describe('filterPropertiesWithMeta — filtering behaviour', () => {
  const sample: Property[] = [
    makeProperty({ id: 'kl-3bed', location: 'Cheras, Kuala Lumpur', bedrooms: 3 }),
    makeProperty({ id: 'pj-5bed', location: 'Ara Damansara, Petaling Jaya', bedrooms: 5 }),
    makeProperty({ id: 'pj-unknown', location: 'SS2, Petaling Jaya', bedrooms: null }),
    makeProperty({ id: 'shah-1bed', location: 'Setia Alam, Shah Alam', bedrooms: 1 }),
  ];

  it('filters by preferred location from the form', () => {
    const enriched = enrich(sample);
    const { properties } = filterPropertiesWithMeta(
      enriched,
      filtersFromPreferences({ ...inputs, preferredLocation: 'Kuala Lumpur' })
    );

    expect(properties).toHaveLength(1);
    expect(properties[0].id).toBe('kl-3bed');
  });

  it('filters by minimum bedrooms from the form', () => {
    const enriched = enrich(sample);
    const { properties } = filterPropertiesWithMeta(
      enriched,
      filtersFromPreferences({ ...inputs, minBedrooms: 3 })
    );

    expect(properties.map((p) => p.id)).toEqual(['kl-3bed', 'pj-5bed']);
  });

  it('excludes unknown bedroom counts while a bedroom filter is active, and counts them', () => {
    const enriched = enrich(sample);
    const { properties, hiddenUnknownBedrooms } = filterPropertiesWithMeta(
      enriched,
      { ...DEFAULT_FILTERS, minBedrooms: 2 }
    );

    expect(properties.map((p) => p.id)).toEqual(['kl-3bed', 'pj-5bed']);
    expect(hiddenUnknownBedrooms).toBe(1);
  });

  it('applies location and minimum-bedroom filters together', () => {
    const enriched = enrich(sample);
    const { properties } = filterPropertiesWithMeta(enriched, {
      ...DEFAULT_FILTERS,
      location: 'Petaling Jaya',
      minBedrooms: 3,
    });

    expect(properties.map((property) => property.id)).toEqual(['pj-5bed']);
  });

  it('filters by bathrooms and built-up area without treating unknowns as matches', () => {
    const enriched = enrich([
      makeProperty({ id: 'large', bathrooms: 3, builtUpSqft: 1500 }),
      makeProperty({ id: 'small', bathrooms: 1, builtUpSqft: 800 }),
      makeProperty({ id: 'unknown-area', bathrooms: 3, builtUpSqft: null }),
    ]);

    const { properties } = filterPropertiesWithMeta(enriched, {
      ...DEFAULT_FILTERS,
      minBathrooms: 2,
      minBuiltUpSqft: 1000,
    });

    expect(properties.map((property) => property.id)).toEqual(['large']);
  });

  it('requires every selected facility and ignores properties without facility data', () => {
    const enriched = enrich([
      makeProperty({ id: 'both', facilities: ['Gym', 'Swimming Pool'] }),
      makeProperty({ id: 'gym-only', facilities: ['Gym'] }),
      makeProperty({ id: 'not-recorded', facilities: undefined }),
    ]);

    const { properties } = filterPropertiesWithMeta(enriched, {
      ...DEFAULT_FILTERS,
      facilities: ['Gym', 'Swimming Pool'],
    });
    expect(properties.map((property) => property.id)).toEqual(['both']);
  });

  it('keeps unknown bedroom counts visible when no bedroom filter is active', () => {
    const enriched = enrich(sample);
    const { properties, hiddenUnknownBedrooms } = filterPropertiesWithMeta(
      enriched,
      DEFAULT_FILTERS
    );

    expect(properties).toHaveLength(4);
    expect(hiddenUnknownBedrooms).toBe(0);
  });

  it('still filters by type, max price and affordability', () => {
    const enriched = enrich(sample, { downPayment: 40000 });

    expect(
      filterProperties(enriched, { ...DEFAULT_FILTERS, propertyType: 'Condominium' })
    ).toHaveLength(4);

    expect(
      filterProperties(enriched, { ...DEFAULT_FILTERS, maxPrice: 250000 })
    ).toHaveLength(0);

    const affordable = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      affordableOnly: true,
    });
    affordable.forEach((p) => expect(p.isAffordable).toBe(true));
  });

  it('filters property categories across languages without dropping results (Bug 3)', () => {
    // Regression test for Bug 3: Selecting Apartment (or 公寓 / Pangsapuri)
    // returns matching properties regardless of whether the filter is specified
    // in English, Chinese, or Malay.
    const enProperties = enrich([
      makeProperty({ id: 'p1', propertyType: 'Apartment' }),
      makeProperty({ id: 'p2', propertyType: 'Apartment' }),
      makeProperty({ id: 'p3', propertyType: 'Condominium' }),
    ]);

    const zhProperties = enProperties.map((p) => ({
      ...p,
      propertyType: p.propertyType === 'Apartment' ? ('公寓' as any) : ('高级公寓' as any),
      translations: {
        zh: { propertyType: p.propertyType === 'Apartment' ? '公寓' : '高级公寓' },
        ms: { propertyType: p.propertyType === 'Apartment' ? 'Pangsapuri' : 'Kondominium' },
      },
    }));

    // Filter with English "Apartment" on Chinese properties
    expect(filterProperties(zhProperties, { ...DEFAULT_FILTERS, propertyType: 'Apartment' })).toHaveLength(2);

    // Filter with Chinese "公寓" on Chinese properties
    expect(filterProperties(zhProperties, { ...DEFAULT_FILTERS, propertyType: '公寓' })).toHaveLength(2);

    // Filter with Malay "Pangsapuri" on Chinese properties
    expect(filterProperties(zhProperties, { ...DEFAULT_FILTERS, propertyType: 'Pangsapuri' })).toHaveLength(2);

    // Filter with Chinese "公寓" on English properties
    expect(filterProperties(enProperties, { ...DEFAULT_FILTERS, propertyType: '公寓' })).toHaveLength(2);

    // Translation helper maps across languages correctly
    expect(getLocalizedPropertyType('Apartment', 'zh')).toBe('公寓');
    expect(getLocalizedPropertyType('Apartment', 'ms')).toBe('Pangsapuri');
    expect(getLocalizedPropertyType('公寓', 'en')).toBe('Apartment');
    expect(getLocalizedPropertyType('Pangsapuri', 'zh')).toBe('公寓');
  });

  it('leaves the convenience wrapper consistent with the meta version', () => {
    const enriched = enrich(sample);
    const filters = { ...DEFAULT_FILTERS, minBedrooms: 3 };

    expect(filterProperties(enriched, filters)).toEqual(
      filterPropertiesWithMeta(enriched, filters).properties
    );
  });
});

describe('sortProperties', () => {
  it('keeps unpriced listings last for both price sort directions', () => {
    const enriched = enrich([
      makeProperty({ id: 'unpriced', priceMYR: null }),
      makeProperty({ id: 'low', priceMYR: 200000 }),
      makeProperty({ id: 'high', priceMYR: 800000 }),
    ]);

    expect(sortProperties(enriched, 'price-asc').map((property) => property.id)).toEqual([
      'low',
      'high',
      'unpriced',
    ]);
    expect(sortProperties(enriched, 'price-desc').map((property) => property.id)).toEqual([
      'high',
      'low',
      'unpriced',
    ]);
    const matchSorted = sortProperties(enriched, 'match');
    expect(matchSorted[matchSorted.length - 1]?.id).toBe('unpriced');
  });

  it('ranks affordable properties in a predictable order', () => {
    const enriched = enrich(
      [
        makeProperty({ id: 'small', priceMYR: 220000 }),
        makeProperty({ id: 'mid', priceMYR: 300000 }),
        makeProperty({ id: 'big', priceMYR: 900000 }),
      ],
      { downPayment: 40000 }
    );

    const byMortgage = sortProperties(enriched, 'mortgage-asc');
    const lowestPayment = byMortgage[0].estimatedMonthlyMortgage;
    const highestPayment = byMortgage[2].estimatedMonthlyMortgage;
    expect(lowestPayment).not.toBeNull();
    expect(highestPayment).not.toBeNull();
    if (lowestPayment !== null && highestPayment !== null) {
      expect(lowestPayment).toBeLessThanOrEqual(highestPayment);
    }

    const byMatch = sortProperties(enriched, 'match');
    for (let i = 1; i < byMatch.length; i += 1) {
      expect(byMatch[i - 1].matchScore).toBeGreaterThanOrEqual(byMatch[i].matchScore);
    }
  });
});
