/**
 * Affordability scenario simulator.
 *
 * Pure functions only, so the arithmetic is deterministic, unit-tested, and never
 * delegated to the AI model. Every figure comes from the existing
 * `calculateAffordability` utility and the same mortgage maths used elsewhere;
 * this module only applies the scenario's adjustments and interprets the result.
 *
 * All outputs are estimates. Nothing here models bank approval, and no cost
 * category outside the down payment and the repayment is invented.
 */

import { calculateAffordability } from './affordability';
import { calculateMonthlyMortgage, calculateMaxLoanPrincipal } from './mortgage';
import { REQUIRED_DOWN_PAYMENT_PERCENTAGE } from '../types/affordability';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';

/** The adjustments a user can make to a base scenario. */
export interface ScenarioAdjustments {
  /** Cash added to (positive) or removed from (negative) the down payment. */
  extraCash: number;
  /** A specific property price to test. Null means "do not test a price". */
  targetPrice: number | null;
  /** Overrides for the base inputs. Null means "keep the base value". */
  monthlyIncome: number | null;
  monthlyDebts: number | null;
  loanTenureYears: number | null;
  annualInterestRate: number | null;
}

export const EMPTY_ADJUSTMENTS: ScenarioAdjustments = {
  extraCash: 0,
  targetPrice: null,
  monthlyIncome: null,
  monthlyDebts: null,
  loanTenureYears: null,
  annualInterestRate: null,
};

/** A neutral starting point used before the user submits the main form. */
export const NEUTRAL_BASE: AffordabilityInputs = {
  monthlyIncome: 6000,
  monthlyDebts: 500,
  downPayment: 40000,
  annualInterestRate: 4,
  loanTenureYears: 30,
};

/**
 * Fold the adjustments into a concrete input set.
 *
 * Negative income, debts and tenure are clamped rather than allowed through: the
 * underlying utility would reject them and the user would see an unexplained
 * blank, which is worse than showing the clamped value they can see and correct.
 */
export function applyAdjustments(
  base: AffordabilityInputs,
  adjustments: ScenarioAdjustments
): AffordabilityInputs {
  const downPayment = Math.max(0, base.downPayment + (adjustments.extraCash || 0));

  return {
    ...base,
    monthlyIncome:
      adjustments.monthlyIncome !== null ? Math.max(0, adjustments.monthlyIncome) : base.monthlyIncome,
    monthlyDebts:
      adjustments.monthlyDebts !== null ? Math.max(0, adjustments.monthlyDebts) : base.monthlyDebts,
    downPayment,
    loanTenureYears:
      adjustments.loanTenureYears !== null
        ? Math.max(1, adjustments.loanTenureYears)
        : base.loanTenureYears,
    annualInterestRate:
      adjustments.annualInterestRate !== null
        ? Math.max(0, adjustments.annualInterestRate)
        : base.annualInterestRate,
  };
}

export type PriceFitStatus = 'fits' | 'overMonthlyBudget' | 'insufficientCash' | 'bothFail';

export interface PriceFit {
  price: number;
  requiredDownPayment: number;
  availableCash: number;
  cashGap: number;
  cashSurplus: number;
  loanPrincipal: number;
  estimatedMonthlyRepayment: number;
  monthlyBudget: number;
  monthlyDifference: number;
  status: PriceFitStatus;
  fitsMonthlyBudget: boolean;
  cashCoversDownPayment: boolean;
}

/**
 * Evaluate a specific property price against the scenario.
 *
 * Mirrors the per-property logic in `propertyFilter.ts` so the simulator and the
 * property list can never disagree: cash the user actually has is applied, the
 * loan is the remainder, and the requirement is checked separately.
 */
export function evaluatePrice(price: number, result: AffordabilityResult, inputs: AffordabilityInputs): PriceFit {
  const requiredDownPayment = price * (REQUIRED_DOWN_PAYMENT_PERCENTAGE / 100);
  const availableCash = Math.min(Math.max(0, inputs.downPayment), price);
  const cashGap = Math.max(0, requiredDownPayment - availableCash);
  const loanPrincipal = Math.max(0, price - availableCash);

  const estimatedMonthlyRepayment = calculateMonthlyMortgage(
    loanPrincipal,
    inputs.annualInterestRate,
    inputs.loanTenureYears
  );

  const monthlyBudget = result.estimatedMortgageBudget;
  const monthlyDifference = monthlyBudget - estimatedMonthlyRepayment;

  const fitsMonthlyBudget = monthlyDifference >= 0;
  const cashCoversDownPayment = cashGap <= 0;

  let status: PriceFitStatus = 'fits';
  if (!fitsMonthlyBudget && !cashCoversDownPayment) status = 'bothFail';
  else if (!fitsMonthlyBudget) status = 'overMonthlyBudget';
  else if (!cashCoversDownPayment) status = 'insufficientCash';

  return {
    price,
    requiredDownPayment,
    availableCash,
    cashGap,
    cashSurplus: Math.max(0, availableCash - requiredDownPayment),
    loanPrincipal,
    estimatedMonthlyRepayment,
    monthlyBudget,
    monthlyDifference,
    status,
    fitsMonthlyBudget,
    cashCoversDownPayment,
  };
}

export interface ScenarioOutcome {
  inputs: AffordabilityInputs;
  result: AffordabilityResult;
  /** Present only when the user supplied a price to test. */
  priceFit: PriceFit | null;
  /**
   * How much the extra cash alone changed the estimated maximum price, so the
   * contribution of that one lever is visible rather than implied.
   */
  maxPriceChangeFromCash: number;
}

/** Run a scenario end to end. Deterministic and side-effect free. */
export function runScenario(
  base: AffordabilityInputs,
  adjustments: ScenarioAdjustments
): ScenarioOutcome {
  const inputs = applyAdjustments(base, adjustments);
  const result = calculateAffordability(inputs);

  const baselineResult = calculateAffordability(base);
  const maxPriceChangeFromCash =
    result.estimatedMaxPropertyPrice - baselineResult.estimatedMaxPropertyPrice;

  const priceFit =
    adjustments.targetPrice !== null && adjustments.targetPrice > 0
      ? evaluatePrice(adjustments.targetPrice, result, inputs)
      : null;

  return { inputs, result, priceFit, maxPriceChangeFromCash };
}

/** Monthly repayment the scenario's maximum price would require, for context. */
export function repaymentAtMaxPrice(result: AffordabilityResult, inputs: AffordabilityInputs): number {
  const price = result.estimatedMaxPropertyPrice;
  if (price <= 0) return 0;

  const loan = calculateMaxLoanPrincipal(
    result.estimatedMortgageBudget,
    inputs.annualInterestRate,
    inputs.loanTenureYears
  );

  return calculateMonthlyMortgage(loan, inputs.annualInterestRate, inputs.loanTenureYears);
}
