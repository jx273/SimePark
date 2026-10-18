import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PropertyWithCalculations } from '../types/property';
import { formatMYR } from '../utils/mortgage';
import { MAX_COMPARISON } from '../state/SelectionProvider';
import './CompareTray.css';

interface CompareTrayProps {
  properties: PropertyWithCalculations[];
  onRemove: (propertyId: string) => void;
  onClear: () => void;
}

/**
 * Side-by-side comparison of the selected properties.
 *
 * Renders as a real `<table>` so the row/column relationship is exposed to
 * assistive technology, wrapped in a horizontally scrollable region so it stays
 * usable on a narrow screen. Missing values render as "Not recorded" — never as a
 * zero or an estimate.
 */
export default function CompareTray({ properties, onRemove, onClear }: CompareTrayProps) {
  const { t } = useTranslation();

  if (properties.length === 0) {
    return (
      <section className="compare section" id="compare" aria-labelledby="compare-title">
        <div className="container">
          <h2 className="section__title" id="compare-title">
            {t('compare.title')}
          </h2>
          <p className="section__subtitle">
            {t('compare.subtitle', { max: MAX_COMPARISON })}
          </p>
          <div className="compare__empty surface">
            <p>{t('compare.empty')}</p>
            <p className="compare__empty-hint">{t('compare.emptyHint')}</p>
          </div>
        </div>
      </section>
    );
  }

  const rows: Array<{ label: string; render: (property: PropertyWithCalculations) => ReactNode }> = [
    { label: t('compare.price'), render: (p) => formatMYR(p.priceMYR) },
    { label: t('compare.monthly'), render: (p) => formatMYR(p.estimatedMonthlyMortgage) },
    { label: t('compare.downPayment'), render: (p) => formatMYR(p.requiredDownPayment) },
    {
      label: t('compare.cashCovered'),
      render: (p) =>
        p.cashShortfall === null
          ? t('status.notCalculated')
          : p.cashShortfall > 0
            ? `${t('common.no')} — ${t('card.cashShort', { amount: formatMYR(p.cashShortfall) })}`
            : t('common.yes'),
    },
    {
      label: t('compare.withinBudget'),
      render: (p) =>
        p.isAffordable === null
          ? t('status.notCalculated')
          : p.isAffordable
            ? t('common.yes')
            : t('common.no'),
    },
    { label: t('compare.location'), render: (p) => p.location },
    { label: t('compare.type'), render: (p) => p.propertyType ?? t('common.unknown') },
    {
      label: t('compare.bedrooms'),
      render: (p) => (p.bedrooms === null ? t('common.unknown') : String(p.bedrooms)),
    },
    {
      label: t('compare.bathrooms'),
      render: (p) => (p.bathrooms === null ? t('common.unknown') : String(p.bathrooms)),
    },
    {
      label: t('compare.builtUp'),
      render: (p) =>
        p.builtUpSqft === null
          ? t('common.unknown')
          : `${p.builtUpSqft.toLocaleString()} ${t('detail.sqft')}`,
    },
    {
      label: t('detail.landArea'),
      render: (p) =>
        p.landArea == null
          ? t('common.unknown')
          : `${p.landArea.toLocaleString()} ${p.landAreaUnit ?? ''}`.trim(),
    },
    {
      label: t('detail.tenure'),
      render: (p) => p.tenure ?? t('common.unknown'),
    },
    {
      label: t('detail.furnishing'),
      render: (p) => p.furnishingStatus ?? t('common.unknown'),
    },
    {
      label: t('detail.nearestTransit'),
      render: (p) =>
        p.nearestTransit
          ? `${p.nearestTransit}${p.transitDistanceKm == null ? '' : ` — ${p.transitDistanceKm} km (${p.transitMode ?? t('detail.routeTypeUnknown')})`}`
          : t('common.unknown'),
    },
    {
      label: t('detail.facilities'),
      render: (p) => p.facilities?.join(', ') || t('common.unknown'),
    },
    {
      label: t('detail.gallery'),
      render: (p) => {
        const photos = (p.media ?? []).filter((item) => item.kind === 'photo');
        return photos.length > 0 ? (
          <div className="compare__media">
            {photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={photo.caption ?? p.propertyName}
              >
                <img
                  src={photo.url}
                  alt={photo.altText ?? photo.caption ?? p.propertyName}
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        ) : (
          t('common.unknown')
        );
      },
    },
    {
      label: t('detail.floorplans'),
      render: (p) => {
        const plans = (p.media ?? []).filter((item) => item.kind === 'floorplan');
        return plans.length > 0 ? (
          <div className="compare__media">
            {plans.map((plan) => (
              <a
                key={plan.id}
                href={plan.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={plan.caption ?? t('detail.floorplan')}
              >
                <img
                  src={plan.url}
                  alt={plan.altText ?? plan.caption ?? t('detail.floorplan')}
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        ) : (
          t('common.unknown')
        );
      },
    },
    {
      label: t('detail.availability'),
      render: (p) =>
        p.availabilityStatus === 'unknown'
          ? t('detail.availabilityUnknown')
          : p.availabilityStatus ?? t('common.unknown'),
    },
  ];

  return (
    <section className="compare section" id="compare" aria-labelledby="compare-title">
      <div className="container">
        <div className="compare__heading">
          <div>
            <h2 className="section__title" id="compare-title">
              {t('compare.title')}
            </h2>
            <p className="section__subtitle">
              {t('compare.subtitle', { max: MAX_COMPARISON })}
            </p>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onClear}>
            {t('compare.clear')}
          </button>
        </div>

        {/* Focusable scroll region: a keyboard user can reach and scroll it. */}
        <div className="compare__scroll" tabIndex={0} role="region" aria-label={t('compare.title')}>
          <table className="compare__table">
            <caption className="sr-only">{t('compare.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('common.search')}</th>
                {properties.map((property) => (
                  <th scope="col" key={property.id}>
                    <span className="compare__name">{property.propertyName}</span>
                    <button
                      type="button"
                      className="compare__remove"
                      aria-label={`${t('compare.remove')}: ${property.propertyName}`}
                      onClick={() => onRemove(property.id)}
                    >
                      ✕
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {properties.map((property) => (
                    <td key={`${row.label}-${property.id}`}>{row.render(property)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
