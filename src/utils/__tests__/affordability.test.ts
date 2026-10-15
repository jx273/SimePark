import { describe, it, expect } from 'vitest';
import {
  calculateAffordability,
  sanitizeAffordabilityInputs,
} from '../affordability';
import { calculateMaxPriceByCash } from '../dsr';
import {
  AffordabilityInputs,
  ILLUSTRATIVE_DSR_CAP,
  REQUIRED_DOWN_PAYMENT_PERCENTAGE,
} from '../../types/affordability';

const baseInputs: AffordabilityInputs = {
  monthlyIncome: 8000,
  monthlyDebts: 1000,
  downPayment: 50000,
  annualInterestRate: 4.0,
  loanTenureYears: 30,
};

describe('sanitizeAffordabilityInputs', () => {
  it('normalises NaN, Infinity and negatives to safe values', () => {
    const sanitized = sanitizeAffordabilityInputs({
      monthlyIncome: NaN,
      monthlyDebts: Infinity,
      downPayment: -5000,
      annualInterestRate: NaN,
      loanTenureYears: -3,
      preferredMaxMonthlyPayment: NaN,
    });

    expect(sanitized.monthlyIncome).toBe(0);
    expect(sanitized.monthlyDebts).toBe(0);
    expect(sanitized.downPayment).toBe(0);
    expect(sanitized.annualInterestRate).toBe(0);
    expect(sanitized.loanTenureYears).toBe(0);
    expect(sanitized.preferredMaxMonthlyPayment).toBe(0);
    expect(sanitized.issues.length).toBeGreaterThan(0);
  });

  it('reports no issues for a valid profile', () => {
    expect(sanitizeAffordabilityInputs(baseInputs).issues).toEqual([]);
  });
});

describe('calculateAffordability — the two ceilings', () => {
  it('caps the estimate at the cash ceiling when cash is the binding constraint', () => {
    const result = calculateAffordability(baseInputs);

    // Cash ceiling: RM 50,000 covers the 10% requirement up to RM 500,000.
    expect(result.maxPropertyPriceByCash).toBe(500000);
    // Repayment ceiling is higher for this profile.
    expect(result.maxPropertyPriceByRepayment).toBeGreaterThan(500000);
    // Headline is the lower of the two, never the repayment ceiling alone.
    expect(result.estimatedMaxPropertyPrice).toBe(500000);
    expect(result.limitingFactor).toBe('downPayment');
    expect(result.hasViableBudget).toBe(true);
  });

  it('never reports a price the available cash cannot support', () => {
    const result = calculateAffordability(baseInputs);
    const requiredDownPayment =
      result.estimatedMaxPropertyPrice * (REQUIRED_DOWN_PAYMENT_PERCENTAGE / 100);

    expect(requiredDownPayment).toBeLessThanOrEqual(result.downPaymentAmount + 0.01);
  });

  it('caps the estimate at the repayment ceiling when repayment is binding', () => {
    // Large cash pile, modest income: repayment is the limit.
    const result = calculateAffordability({
      ...baseInputs,
      monthlyIncome: 5000,
      monthlyDebts: 0,
      downPayment: 400000,
    });

    expect(result.limitingFactor).toBe('repayment');
    expect(result.estimatedMaxPropertyPrice).toBe(result.maxPropertyPriceByRepayment);
    expect(result.estimatedMaxPropertyPrice).toBeLessThan(result.maxPropertyPriceByCash);
  });

  it('keeps the price ceilings internally consistent', () => {
    const result = calculateAffordability(baseInputs);

    expect(result.estimatedMaxPropertyPrice).toBe(
      Math.min(result.maxPropertyPriceByRepayment, result.maxPropertyPriceByCash)
    );
    expect(result.estimatedMaxLoanPrincipal + result.cashApplied).toBe(
      result.maxPropertyPriceByRepayment
    );
  });
});

describe('calculateAffordability — edge cases', () => {
  it('reports nothing affordable when income is zero, even with cash available', () => {
    const result = calculateAffordability({ ...baseInputs, monthlyIncome: 0 });

    expect(result.hasViableBudget).toBe(false);
    expect(result.estimatedMaxPropertyPrice).toBe(0);
    expect(result.maxPropertyPriceByRepayment).toBe(0);
    expect(result.limitingFactor).toBe('none');
    expect(result.limitedReason).toContain('income');
    // The old behaviour returned the cash amount as a property price here.
    expect(result.estimatedMaxPropertyPrice).not.toBe(baseInputs.downPayment);
  });

  it('reports nothing affordable when existing debts already exhaust the DSR cap', () => {
    const result = calculateAffordability({
      ...baseInputs,
      monthlyDebts: 4000, // 50% of income, above the 40% illustrative cap
    });

    expect(result.estimatedMortgageBudget).toBe(0);
    expect(result.hasViableBudget).toBe(false);
    expect(result.estimatedMaxPropertyPrice).toBe(0);
    expect(result.limitedReason).toContain(`${ILLUSTRATIVE_DSR_CAP}%`);
  });

  it('reports nothing affordable when no cash is available for a down payment', () => {
    const result = calculateAffordability({ ...baseInputs, downPayment: 0 });

    expect(result.maxPropertyPriceByCash).toBe(0);
    expect(result.hasViableBudget).toBe(false);
    expect(result.estimatedMaxPropertyPrice).toBe(0);
    expect(result.limitingFactor).toBe('none');
  });

  it('flags a down payment that is far below the requirement as the binding limit', () => {
    const result = calculateAffordability({
      ...baseInputs,
      monthlyIncome: 8000,
      monthlyDebts: 1000,
      downPayment: 5000,
    });

    expect(result.hasViableBudget).toBe(true);
    expect(result.limitingFactor).toBe('downPayment');
    expect(result.estimatedMaxPropertyPrice).toBe(50000);
  });

  it('never returns NaN or Infinity for hostile input', () => {
    const result = calculateAffordability({
      monthlyIncome: NaN,
      monthlyDebts: NaN,
      downPayment: NaN,
      annualInterestRate: NaN,
      loanTenureYears: NaN,
    });

    for (const value of Object.values(result)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(result.hasViableBudget).toBe(false);
  });

  it('rejects an invalid loan tenure instead of producing an estimate', () => {
    const result = calculateAffordability({ ...baseInputs, loanTenureYears: 0 });

    expect(result.hasViableBudget).toBe(false);
    expect(result.estimatedMaxPropertyPrice).toBe(0);
    expect(result.limitedReason).not.toBeNull();
  });

  it('rejects a negative interest rate instead of producing an estimate', () => {
    const result = calculateAffordability({ ...baseInputs, annualInterestRate: -1 });

    expect(result.hasViableBudget).toBe(false);
    expect(result.estimatedMaxPropertyPrice).toBe(0);
  });

  it('handles a zero-interest loan without dividing by zero', () => {
    const result = calculateAffordability({ ...baseInputs, annualInterestRate: 0 });

    expect(Number.isFinite(result.estimatedMaxLoanPrincipal)).toBe(true);
    expect(result.estimatedMaxLoanPrincipal).toBeGreaterThan(0);
  });

  it('lets the preferred monthly payment tighten the budget but not raise it', () => {
    const tightened = calculateAffordability({
      ...baseInputs,
      preferredMaxMonthlyPayment: 1000,
    });
    const ignored = calculateAffordability({
      ...baseInputs,
      preferredMaxMonthlyPayment: 999999,
    });
    const calculatedBudget = 8000 * (ILLUSTRATIVE_DSR_CAP / 100) - 1000;

    expect(tightened.estimatedMortgageBudget).toBe(1000);
    expect(ignored.estimatedMortgageBudget).toBe(calculatedBudget);
  });
});

describe('calculateAffordability — which constraint is really binding', () => {
  // All expectations below were taken from the app's own output, not assumed.

  it('reports cash when cash caps the price and no preference was entered', () => {
    // cash 50k: repayment ceiling 510,815 vs cash ceiling 500,000
    const result = calculateAffordability({ ...baseInputs, downPayment: 50000 });

    expect(result.limitingFactor).toBe('downPayment');
    expect(result.bindingConstraint).toBe('downPayment');
  });

  it('reports repayment when income caps the price and cash is plentiful', () => {
    // cash 200k: repayment ceiling 660,815 vs cash ceiling 2,000,000
    const result = calculateAffordability({ ...baseInputs, downPayment: 200000 });

    expect(result.limitingFactor).toBe('repayment');
    expect(result.bindingConstraint).toBe('repayment');
  });

  it('names the preference when it lowers the ceiling below the cash ceiling', () => {
    // cash 50k + preference 1,500: repayment ceiling drops to 364,192, which is
    // now below the 500,000 the cash would otherwise allow. Before this fix the
    // app blamed the cash for a limit the user's own preference created.
    const result = calculateAffordability({
      ...baseInputs,
      downPayment: 50000,
      preferredMaxMonthlyPayment: 1500,
    });

    expect(result.estimatedMortgageBudget).toBe(1500);
    expect(result.bindingConstraint).toBe('preferredMaxMonthlyPayment');
    expect(result.limitingFactor).toBe('repayment');
    expect(result.maxPropertyPriceByRepayment).toBeLessThan(result.maxPropertyPriceByCash);
  });

  it('still names the preference at a higher setting that also binds', () => {
    // cash 50k + preference 2,000: repayment ceiling 468,922 < cash 500,000
    const result = calculateAffordability({
      ...baseInputs,
      downPayment: 50000,
      preferredMaxMonthlyPayment: 2000,
    });

    expect(result.estimatedMortgageBudget).toBe(2000);
    expect(result.bindingConstraint).toBe('preferredMaxMonthlyPayment');
  });

  it('reports cash when a preference is set but cash is still the real limit', () => {
    // cash 50k + preference 3,000: the preference is above the app's calculated
    // budget of 2,200, so it is ignored and cash remains the binding constraint.
    // This is the exact misattribution the live assistant made.
    const result = calculateAffordability({
      ...baseInputs,
      downPayment: 50000,
      preferredMaxMonthlyPayment: 3000,
    });

    expect(result.estimatedMortgageBudget).toBe(2200);
    expect(result.limitingFactor).toBe('downPayment');
    expect(result.bindingConstraint).toBe('downPayment');
    expect(result.bindingConstraint).not.toBe('preferredMaxMonthlyPayment');
  });

  it('reports repayment when a preference is set but income still caps the price', () => {
    // cash 200k + preference 3,000: ignored, ceiling stays 660,815 vs 2,000,000
    const result = calculateAffordability({
      ...baseInputs,
      downPayment: 200000,
      preferredMaxMonthlyPayment: 3000,
    });

    expect(result.bindingConstraint).toBe('repayment');
  });

  it('reports the preference when cash is abundant but income is limited', () => {
    // cash 200k + preference 1,500: ceiling 514,192 vs cash 2,000,000
    const result = calculateAffordability({
      ...baseInputs,
      downPayment: 200000,
      preferredMaxMonthlyPayment: 1500,
    });

    expect(result.bindingConstraint).toBe('preferredMaxMonthlyPayment');
  });

  it('reports none when no estimate could be produced', () => {
    const result = calculateAffordability({
      ...baseInputs,
      monthlyIncome: 0,
      preferredMaxMonthlyPayment: 1500,
    });

    expect(result.hasViableBudget).toBe(false);
    expect(result.bindingConstraint).toBe('none');
  });
});

describe('calculateMaxPriceByCash', () => {
  it('converts cash into a price ceiling at the required percentage', () => {
    expect(calculateMaxPriceByCash(50000, 10)).toBe(500000);
  });

  it('returns 0 for unusable input', () => {
    expect(calculateMaxPriceByCash(0, 10)).toBe(0);
    expect(calculateMaxPriceByCash(-100, 10)).toBe(0);
    expect(calculateMaxPriceByCash(50000, 0)).toBe(0);
    expect(calculateMaxPriceByCash(NaN, 10)).toBe(0);
  });
});
