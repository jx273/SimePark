import { describe, it, expect } from 'vitest';
import {
  EMPTY_ADJUSTMENTS,
  NEUTRAL_BASE,
  applyAdjustments,
  evaluatePrice,
  repaymentAtMaxPrice,
  runScenario,
} from '../simulator';
import { calculateAffordability } from '../affordability';
import { calculateMonthlyMortgage } from '../mortgage';
import type { AffordabilityInputs } from '../../types/affordability';

const base: AffordabilityInputs = {
  monthlyIncome: 8000,
  monthlyDebts: 1000,
  downPayment: 50000,
  annualInterestRate: 4,
  loanTenureYears: 30,
};

describe('applyAdjustments', () => {
  it('preserves all main-calculator assumptions when no scenario overrides are set', () => {
    const inputs = {
      ...base,
      preferredMaxMonthlyPayment: 1800,
      preferredLocation: 'Shah Alam',
      minBedrooms: 3,
    };
    expect(applyAdjustments(inputs, EMPTY_ADJUSTMENTS)).toEqual(inputs);
  });

  it('applies base-cash and preferred-payment overrides without changing other inputs', () => {
    const inputs = applyAdjustments(
      { ...base, preferredMaxMonthlyPayment: 2400 },
      { ...EMPTY_ADJUSTMENTS, downPayment: 65000, preferredMaxMonthlyPayment: 1700 }
    );
    expect(inputs.downPayment).toBe(65000);
    expect(inputs.preferredMaxMonthlyPayment).toBe(1700);
    expect(inputs.monthlyIncome).toBe(base.monthlyIncome);
    expect(inputs.monthlyDebts).toBe(base.monthlyDebts);
  });

  it('returns the base unchanged for empty adjustments', () => {
    expect(applyAdjustments(base, EMPTY_ADJUSTMENTS)).toEqual(base);
  });

  it('adds extra cash to the down payment', () => {
    const result = applyAdjustments(base, { ...EMPTY_ADJUSTMENTS, extraCash: 25000 });
    expect(result.downPayment).toBe(75000);
  });

  it('never lets extra cash push the down payment below zero', () => {
    const result = applyAdjustments(base, { ...EMPTY_ADJUSTMENTS, extraCash: -999999 });
    expect(result.downPayment).toBe(0);
  });

  it('applies overrides only when provided, and clamps them', () => {
    const result = applyAdjustments(base, {
      ...EMPTY_ADJUSTMENTS,
      monthlyIncome: -500,
      monthlyDebts: 200,
      loanTenureYears: 0,
      annualInterestRate: -1,
    });

    expect(result.monthlyIncome).toBe(0);
    expect(result.monthlyDebts).toBe(200);
    // A zero or negative tenure would make every calculation blank, so clamp to 1.
    expect(result.loanTenureYears).toBe(1);
    expect(result.annualInterestRate).toBe(0);
  });

  it('keeps base values when an override is null', () => {
    const result = applyAdjustments(base, {
      ...EMPTY_ADJUSTMENTS,
      monthlyIncome: null,
      monthlyDebts: null,
      loanTenureYears: null,
      annualInterestRate: null,
    });

    expect(result.monthlyIncome).toBe(base.monthlyIncome);
    expect(result.monthlyDebts).toBe(base.monthlyDebts);
    expect(result.loanTenureYears).toBe(base.loanTenureYears);
    expect(result.annualInterestRate).toBe(base.annualInterestRate);
  });
});

describe('evaluatePrice', () => {
  it('agrees with the affordability utility about the monthly budget', () => {
    const result = calculateAffordability(base);
    const fit = evaluatePrice(320000, result, base);

    expect(fit.monthlyBudget).toBe(result.estimatedMortgageBudget);
    expect(fit.estimatedMonthlyRepayment).toBe(
      calculateMonthlyMortgage(320000 - 50000, base.annualInterestRate, base.loanTenureYears)
    );
  });

  it('reports a price as fitting when repayment and cash both work', () => {
    const result = calculateAffordability(base);
    const fit = evaluatePrice(300000, result, base);

    expect(fit.status).toBe('fits');
    expect(fit.fitsMonthlyBudget).toBe(true);
    expect(fit.cashCoversDownPayment).toBe(true);
    expect(fit.cashGap).toBe(0);
  });

  it('identifies a down-payment shortfall separately from an over-budget repayment', () => {
    // Income is high enough that the repayment on this price fits comfortably,
    // but the cash is far below the 10% requirement, so this must be reported as
    // a cash problem rather than as "too expensive".
    const inputs: AffordabilityInputs = {
      ...base,
      monthlyIncome: 20000,
      downPayment: 5000,
    };
    const result = calculateAffordability(inputs);
    const fit = evaluatePrice(600000, result, inputs);

    expect(fit.fitsMonthlyBudget).toBe(true);
    expect(fit.cashCoversDownPayment).toBe(false);
    expect(fit.status).toBe('insufficientCash');
    // The shortfall is exactly the 10% requirement minus the cash available.
    expect(fit.cashGap).toBeCloseTo(60000 - 5000, 5);
  });

  it('reports both failures when nothing works', () => {
    const inputs: AffordabilityInputs = { ...base, downPayment: 1000 };
    const result = calculateAffordability(inputs);
    const fit = evaluatePrice(2000000, result, inputs);

    expect(fit.status).toBe('bothFail');
    expect(fit.monthlyDifference).toBeLessThan(0);
  });

  it('never applies more cash than the price', () => {
    const inputs: AffordabilityInputs = { ...base, downPayment: 900000 };
    const result = calculateAffordability(inputs);
    const fit = evaluatePrice(300000, result, inputs);

    expect(fit.availableCash).toBe(300000);
    expect(fit.loanPrincipal).toBe(0);
    expect(fit.cashSurplus).toBeGreaterThan(0);
  });
});

describe('runScenario', () => {
  it('matches the main calculator exactly when scenario inputs are unchanged', () => {
    const inputs: AffordabilityInputs = {
      ...base,
      preferredMaxMonthlyPayment: 2200,
      preferredLocation: 'Kuala Lumpur',
      minBedrooms: 2,
    };
    expect(runScenario(inputs, EMPTY_ADJUSTMENTS).result).toEqual(calculateAffordability(inputs));
  });

  it('is deterministic for identical input', () => {
    const first = runScenario(base, EMPTY_ADJUSTMENTS);
    const second = runScenario(base, EMPTY_ADJUSTMENTS);

    expect(first.result).toEqual(second.result);
    expect(first.priceFit).toBeNull();
  });

  it('raises the maximum price when extra cash is added', () => {
    const without = runScenario(base, EMPTY_ADJUSTMENTS);
    const withCash = runScenario(base, { ...EMPTY_ADJUSTMENTS, extraCash: 100000 });

    expect(withCash.result.estimatedMaxPropertyPrice).toBeGreaterThan(
      without.result.estimatedMaxPropertyPrice
    );
    expect(withCash.maxPriceChangeFromCash).toBeGreaterThan(0);
  });

  it('does NOT raise the maximum price from income alone when cash is the ceiling', () => {
    // With RM 50,000 cash the down-payment ceiling (RM 500,000) binds, so extra
    // income cannot lift the result. Reporting otherwise would be a real bug.
    const without = runScenario(base, EMPTY_ADJUSTMENTS);
    const richer = runScenario(base, { ...EMPTY_ADJUSTMENTS, monthlyIncome: 14000 });

    expect(without.result.bindingConstraint).toBe('downPayment');
    expect(richer.result.estimatedMaxPropertyPrice).toBe(
      without.result.estimatedMaxPropertyPrice
    );
  });

  it('raises the maximum price from income when the repayment ceiling binds', () => {
    // Cash is plentiful here, so income is what limits the result.
    const plentifulCash: AffordabilityInputs = { ...base, downPayment: 400000 };
    const without = runScenario(plentifulCash, EMPTY_ADJUSTMENTS);
    const richer = runScenario(plentifulCash, { ...EMPTY_ADJUSTMENTS, monthlyIncome: 14000 });

    expect(without.result.bindingConstraint).toBe('repayment');
    expect(richer.result.estimatedMaxPropertyPrice).toBeGreaterThan(
      without.result.estimatedMaxPropertyPrice
    );
  });

  it('produces a price fit only when a price was supplied', () => {
    expect(runScenario(base, { ...EMPTY_ADJUSTMENTS, targetPrice: null }).priceFit).toBeNull();
    expect(runScenario(base, { ...EMPTY_ADJUSTMENTS, targetPrice: 0 }).priceFit).toBeNull();
    expect(runScenario(base, { ...EMPTY_ADJUSTMENTS, targetPrice: 350000 }).priceFit).not.toBeNull();
  });

  it('handles a neutral base without throwing', () => {
    const outcome = runScenario(NEUTRAL_BASE, { ...EMPTY_ADJUSTMENTS, targetPrice: 400000 });
    expect(Number.isFinite(outcome.result.estimatedMaxPropertyPrice)).toBe(true);
    expect(outcome.result.hasViableBudget).toBe(true);
  });

  it('survives hostile adjustment values without producing NaN', () => {
    const outcome = runScenario(base, {
      ...EMPTY_ADJUSTMENTS,
      extraCash: Number.NaN,
      targetPrice: Number.POSITIVE_INFINITY,
      monthlyIncome: Number.NaN,
      monthlyDebts: Number.NaN,
      loanTenureYears: Number.NaN,
      annualInterestRate: Number.NaN,
    });

    for (const value of Object.values(outcome.result)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('repaymentAtMaxPrice', () => {
  it('returns a repayment inside the monthly budget', () => {
    const inputs = base;
    const result = calculateAffordability(inputs);
    const repayment = repaymentAtMaxPrice(result, inputs);

    expect(repayment).toBeGreaterThan(0);
    expect(repayment).toBeLessThanOrEqual(result.estimatedMortgageBudget + 1);
  });

  it('returns zero when no estimate exists', () => {
    const inputs: AffordabilityInputs = { ...base, monthlyIncome: 0 };
    expect(repaymentAtMaxPrice(calculateAffordability(inputs), inputs)).toBe(0);
  });
});
