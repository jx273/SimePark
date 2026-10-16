import { useTranslation } from 'react-i18next';
import { PropertyWithCalculations } from '../types/property';

/**
 * Three-state budget badge.
 *
 * "Over monthly budget" is used only when the estimated monthly repayment
 * genuinely exceeds the monthly budget. A property whose repayment fits but whose
 * required down payment is not covered by available cash is labelled
 * "Insufficient down-payment cash" instead, because that is a different problem
 * with a different remedy.
 *
 * Every state carries a glyph as well as a colour, so the distinction survives
 * greyscale, colour blindness, and dark mode.
 */
export default function BudgetBadge({
  property,
  long = false,
}: {
  property: PropertyWithCalculations;
  long?: boolean;
}) {
  const { t } = useTranslation();

  switch (property.budgetStatus) {
    case 'affordable':
      return (
        <span className="badge badge--affordable">
          <span aria-hidden="true">✓</span>{' '}
          {long ? t('status.withinBudgetLong') : t('status.withinBudget')}
        </span>
      );
    case 'insufficientDownPayment':
      return (
        <span className="badge badge--cash-short">
          <span aria-hidden="true">◐</span>{' '}
          {long ? t('status.insufficientDownPayment') : t('status.cashShort')}
        </span>
      );
    case 'overMonthlyBudget':
    default:
      return (
        <span className="badge badge--over-budget">
          <span aria-hidden="true">!</span> {t('status.overBudget')}
        </span>
      );
  }
}

/**
 * Provenance label.
 *
 * "Verified" is shown only when the record carries a genuine verification date.
 * Demonstration records are always labelled, so they cannot be presented as real
 * listings.
 */
export function ProvenanceBadge({
  isExample,
  verifiedDate,
  sourceUrl,
}: {
  isExample: boolean;
  verifiedDate: string | null;
  sourceUrl: string | null;
}) {
  const { t } = useTranslation();

  if (verifiedDate) {
    return (
      <span className="badge badge--verified">
        <span aria-hidden="true">✓</span> {t('status.verifiedOn', { date: verifiedDate })}
      </span>
    );
  }

  if (isExample) {
    return (
      <span className="badge badge--demo">
        <span aria-hidden="true">⚑</span> {t('status.exampleListing')}
      </span>
    );
  }

  if (sourceUrl) {
    return (
      <span className="badge badge--source">
        <span aria-hidden="true">↗</span> {t('status.sourceProvided')}
      </span>
    );
  }

  return (
    <span className="badge badge--unverified">
      <span aria-hidden="true">?</span> {t('status.notVerified')}
    </span>
  );
}
