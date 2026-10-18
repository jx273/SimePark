/**
 * Compare loan-rate scenarios using a shared principal and tenure.
 *
 * The supplied property dataset does not include bank interest rates. This
 * helper only prices rates the user (or the calculator) actually provided. It
 * never invents a bank name, a current offer, or a promotional rate.
 */

import { calculateMonthlyMortgage } from './mortgage';

export type RateOrigin = 'user' | 'calculator';

export interface RateScenarioInput {
  id: string;
  label: string;
  annualRate: number;
  origin: RateOrigin;
  rateType: string | null;
  source: string | null;
  verifiedDate: string | null;
}

export interface RateComparisonRow extends RateScenarioInput {
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
}

export function isUsableLoanAmount(principal: number, tenureYears: number): boolean {
  return Number.isFinite(principal) && principal > 0 && Number.isFinite(tenureYears) && tenureYears > 0;
}

export function compareLoanRates(
  principal: number,
  tenureYears: number,
  scenarios: RateScenarioInput[]
): RateComparisonRow[] {
  if (!isUsableLoanAmount(principal, tenureYears)) return [];

  const months = tenureYears * 12;
  return scenarios.flatMap((scenario) => {
    if (!Number.isFinite(scenario.annualRate) || scenario.annualRate < 0) return [];
    const monthlyPayment = calculateMonthlyMortgage(principal, scenario.annualRate, tenureYears);
    const totalPaid = monthlyPayment * months;
    return [
      {
        ...scenario,
        monthlyPayment,
        totalPaid,
        totalInterest: Math.max(0, totalPaid - principal),
      },
    ];
  });
}
