import { describe, it, expect } from 'vitest';
import { calculateMonthlyMortgage, calculateMaxLoanPrincipal, calculateDownPayment, formatMYR } from '../mortgage';
import { calculateDSR, calculateMortgageBudget } from '../dsr';
import { calculateAffordability } from '../affordability';
import { enrichPropertiesWithCalculations, filterProperties, sortProperties, DEFAULT_FILTERS } from '../propertyFilter';
import { AffordabilityInputs } from '../../types/affordability';
import { Property } from '../../types/property';

// ============================================================
// MORTGAGE CALCULATIONS
// ============================================================

describe('calculateMonthlyMortgage', () => {
  it('should calculate monthly payment for a standard loan', () => {
    // RM 360,000 loan, 4% interest, 30 years
    // Expected: approximately RM 1,718.56
    const result = calculateMonthlyMortgage(360000, 4.0, 30);
    expect(result).toBeCloseTo(1718.56, 0);
  });

  it('should handle zero-interest loan', () => {
    // RM 360,000 loan, 0% interest, 30 years
    // Expected: 360000 / 360 = RM 1,000
    const result = calculateMonthlyMortgage(360000, 0, 30);
    expect(result).toBe(1000);
  });

  it('should return 0 for zero principal', () => {
    expect(calculateMonthlyMortgage(0, 4.0, 30)).toBe(0);
  });

  it('should return 0 for negative principal', () => {
    expect(calculateMonthlyMortgage(-100000, 4.0, 30)).toBe(0);
  });

  it('should return 0 for zero tenure', () => {
    expect(calculateMonthlyMortgage(360000, 4.0, 0)).toBe(0);
  });

  it('should return 0 for negative interest rate', () => {
    expect(calculateMonthlyMortgage(360000, -1, 30)).toBe(0);
  });

  it('should handle short tenure correctly', () => {
    // RM 100,000 loan, 5% interest, 5 years
    const result = calculateMonthlyMortgage(100000, 5.0, 5);
    expect(result).toBeCloseTo(1887.12, 0);
  });

  it('should handle high interest rate', () => {
    // RM 200,000 loan, 10% interest, 20 years
    const result = calculateMonthlyMortgage(200000, 10.0, 20);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(1930.08, 0);
  });
});

describe('calculateMaxLoanPrincipal', () => {
  it('should calculate the inverse of monthly mortgage', () => {
    // If RM 1,718.56/month at 4% over 30 years => ~RM 360,000 principal
    const principal = calculateMaxLoanPrincipal(1718.56, 4.0, 30);
    expect(principal).toBeCloseTo(360000, -2); // within RM 100
  });

  it('should handle zero-interest case', () => {
    const principal = calculateMaxLoanPrincipal(1000, 0, 30);
    expect(principal).toBe(360000);
  });

  it('should return 0 for zero payment', () => {
    expect(calculateMaxLoanPrincipal(0, 4.0, 30)).toBe(0);
  });

  it('should return 0 for negative payment', () => {
    expect(calculateMaxLoanPrincipal(-500, 4.0, 30)).toBe(0);
  });
});

describe('calculateDownPayment', () => {
  it('should calculate 10% down payment', () => {
    expect(calculateDownPayment(400000, 10)).toBe(40000);
  });

  it('should return 0 for zero price', () => {
    expect(calculateDownPayment(0, 10)).toBe(0);
  });

  it('should return 0 for negative percentage', () => {
    expect(calculateDownPayment(400000, -5)).toBe(0);
  });
});

describe('formatMYR', () => {
  it('should format a standard amount', () => {
    expect(formatMYR(450000)).toBe('RM 450,000');
  });

  it('should handle zero', () => {
    expect(formatMYR(0)).toBe('RM 0');
  });

  it('should handle Infinity', () => {
    expect(formatMYR(Infinity)).toBe('RM 0');
  });
});

// ============================================================
// DSR CALCULATIONS
// ============================================================

describe('calculateDSR', () => {
  it('should calculate DSR correctly', () => {
    // RM 2,000 debts / RM 6,000 income = 33.33%
    const result = calculateDSR(2000, 6000);
    expect(result).toBeCloseTo(33.33, 1);
  });

  it('should return 0 for zero income', () => {
    expect(calculateDSR(1000, 0)).toBe(0);
  });

  it('should return 0 for negative income', () => {
    expect(calculateDSR(1000, -5000)).toBe(0);
  });

  it('should return 0 for zero debts', () => {
    expect(calculateDSR(0, 5000)).toBe(0);
  });

  it('should return 0 for negative debts', () => {
    expect(calculateDSR(-500, 5000)).toBe(0);
  });

  it('should handle high DSR', () => {
    // RM 5,000 debts / RM 5,000 income = 100%
    expect(calculateDSR(5000, 5000)).toBeCloseTo(100, 1);
  });
});

describe('calculateMortgageBudget', () => {
  it('should calculate mortgage budget at 40% DSR cap', () => {
    // Income RM 8,000, debts RM 1,000, cap 40%
    // Max total = 8000 * 0.4 = 3200
    // Mortgage budget = 3200 - 1000 = 2200
    expect(calculateMortgageBudget(8000, 1000, 40)).toBe(2200);
  });

  it('should clamp to zero when debts exceed cap', () => {
    // Income RM 5,000, debts RM 3,000, cap 40%
    // Max total = 5000 * 0.4 = 2000
    // Mortgage budget = 2000 - 3000 = -1000 => clamped to 0
    expect(calculateMortgageBudget(5000, 3000, 40)).toBe(0);
  });

  it('should return 0 for zero income', () => {
    expect(calculateMortgageBudget(0, 500, 40)).toBe(0);
  });

  it('should handle zero debts', () => {
    // Income RM 6,000, debts RM 0, cap 40%
    // Max total = 6000 * 0.4 = 2400
    expect(calculateMortgageBudget(6000, 0, 40)).toBe(2400);
  });
});

// ============================================================
// AFFORDABILITY CALCULATION
// ============================================================

describe('calculateAffordability', () => {
  it('should produce a complete result', () => {
    const inputs: AffordabilityInputs = {
      monthlyIncome: 8000,
      monthlyDebts: 1000,
      downPayment: 50000,
      annualInterestRate: 4.0,
      loanTenureYears: 30,
    };

    const result = calculateAffordability(inputs);

    expect(result.monthlyIncome).toBe(8000);
    expect(result.monthlyDebts).toBe(1000);
    expect(result.estimatedMortgageBudget).toBe(2200);
    expect(result.estimatedMaxLoanPrincipal).toBeGreaterThan(0);
    expect(result.estimatedMaxPropertyPrice).toBeGreaterThan(result.estimatedMaxLoanPrincipal);
    expect(result.currentDSR).toBeCloseTo(12.5, 1);
    expect(result.illustrativeDSRCap).toBe(40);
  });

  it('should respect preferred max monthly payment', () => {
    const inputs: AffordabilityInputs = {
      monthlyIncome: 10000,
      monthlyDebts: 500,
      downPayment: 30000,
      annualInterestRate: 4.0,
      loanTenureYears: 30,
      preferredMaxMonthlyPayment: 1500,
    };

    const result = calculateAffordability(inputs);

    // Budget should be capped at 1500 (lower than calculated 3500)
    expect(result.estimatedMortgageBudget).toBe(1500);
  });
});

// ============================================================
// PROPERTY FILTERING
// ============================================================

describe('Property filtering and ranking', () => {
  const sampleProperties: Property[] = [
    {
      id: 'test-1',
      propertyName: 'Affordable Condo',
      location: 'Petaling Jaya',
      priceMYR: 300000,
      propertyType: 'Condominium',
      bedrooms: 3,
      bathrooms: 2,
      builtUpSqft: 900,
      sourceUrl: null,
      verifiedDate: null,
      isExample: true,
    },
    {
      id: 'test-2',
      propertyName: 'Luxury Bungalow',
      location: 'Kuala Lumpur',
      priceMYR: 1500000,
      propertyType: 'Bungalow',
      bedrooms: 5,
      bathrooms: 4,
      builtUpSqft: 3500,
      sourceUrl: null,
      verifiedDate: null,
      isExample: true,
    },
    {
      id: 'test-3',
      propertyName: 'Budget Flat',
      location: 'Shah Alam',
      priceMYR: 200000,
      propertyType: 'Flat',
      bedrooms: 2,
      bathrooms: 1,
      builtUpSqft: 650,
      sourceUrl: null,
      verifiedDate: null,
      isExample: true,
    },
  ];

  const inputs: AffordabilityInputs = {
    monthlyIncome: 7000,
    monthlyDebts: 800,
    downPayment: 40000,
    annualInterestRate: 4.0,
    loanTenureYears: 30,
  };

  it('should enrich properties with calculations', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);

    expect(enriched).toHaveLength(3);
    enriched.forEach((p) => {
      expect(p.estimatedMonthlyMortgage).toBeGreaterThanOrEqual(0);
      expect(p.estimatedDSR).toBeGreaterThanOrEqual(0);
      expect(typeof p.isAffordable).toBe('boolean');
      expect(typeof p.matchExplanation).toBe('string');
      expect(p.matchExplanation.length).toBeGreaterThan(0);
    });
  });

  it('should filter by location', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const filtered = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      location: 'Shah Alam',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].location).toBe('Shah Alam');
  });

  it('should filter by property type', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const filtered = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      propertyType: 'Bungalow',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].propertyType).toBe('Bungalow');
  });

  it('should filter by minimum bedrooms', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const filtered = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      minBedrooms: 4,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].bedrooms).toBe(5);
  });

  it('should filter by max price', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const filtered = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      maxPrice: 350000,
    });

    expect(filtered).toHaveLength(2);
  });

  it('should filter affordable only', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const filtered = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      affordableOnly: true,
    });

    // All affordable properties should be within budget
    filtered.forEach((p) => {
      expect(p.isAffordable).toBe(true);
    });
  });

  it('should return empty array when no properties match', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const filtered = filterProperties(enriched, {
      ...DEFAULT_FILTERS,
      location: 'Nonexistent City',
    });

    expect(filtered).toHaveLength(0);
  });

  it('should sort by price ascending', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const sorted = sortProperties(enriched, 'price-asc');

    expect(sorted[0].priceMYR).toBeLessThanOrEqual(sorted[1].priceMYR);
    expect(sorted[1].priceMYR).toBeLessThanOrEqual(sorted[2].priceMYR);
  });

  it('should sort by price descending', () => {
    const result = calculateAffordability(inputs);
    const enriched = enrichPropertiesWithCalculations(sampleProperties, inputs, result);
    const sorted = sortProperties(enriched, 'price-desc');

    expect(sorted[0].priceMYR).toBeGreaterThanOrEqual(sorted[1].priceMYR);
    expect(sorted[1].priceMYR).toBeGreaterThanOrEqual(sorted[2].priceMYR);
  });
});
