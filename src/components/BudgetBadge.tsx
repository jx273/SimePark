import { PropertyWithCalculations } from '../types/property';

/**
 * Three-state budget badge.
 *
 * "Over budget" is only used when the estimated monthly repayment genuinely
 * exceeds the monthly budget. A property whose repayment fits but whose
 * required down payment is not covered by available cash is labelled
 * "Short on Down Payment" instead, because that is a different problem with a
 * different remedy.
 */
export default function BudgetBadge({
  property,
  long = false,
}: {
  property: PropertyWithCalculations;
  long?: boolean;
}) {
  switch (property.budgetStatus) {
    case 'affordable':
      return (
        <span className="badge badge--affordable">
          {long ? '✓ Within Your Budget' : '✓ Within Budget'}
        </span>
      );
    case 'insufficientDownPayment':
      return (
        <span className="badge badge--cash-short">
          {long ? 'Short on Down Payment' : 'Cash Short'}
        </span>
      );
    case 'overMonthlyBudget':
    default:
      return <span className="badge badge--over-budget">Over Budget</span>;
  }
}
