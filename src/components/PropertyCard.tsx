import { useTranslation } from 'react-i18next';
import { PropertyWithCalculations } from '../types/property';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import { ILLUSTRATIVE_DSR_CAP } from '../types/affordability';
import BudgetBadge, { ProvenanceBadge } from './BudgetBadge';
import './PropertyCard.css';

interface PropertyCardProps {
  property: PropertyWithCalculations;
  onViewDetails: (property: PropertyWithCalculations) => void;
  isSaved: boolean;
  isCompared: boolean;
  onToggleSaved: (propertyId: string) => void;
  onToggleCompared: (propertyId: string) => void;
  comparisonFull: boolean;
}

export default function PropertyCard({
  property,
  onViewDetails,
  isSaved,
  isCompared,
  onToggleSaved,
  onToggleCompared,
  comparisonFull,
}: PropertyCardProps) {
  const { t } = useTranslation();

  const compareDisabled = !isCompared && comparisonFull;

  return (
    <article className="property-card card">
      {property.isExample && (
        <div className="property-card__demo-banner">{t('card.demoBanner')}</div>
      )}

      <div className="property-card__content">
        <div className="property-card__header">
          <div className="property-card__heading">
            <h3 className="property-card__name">
              <button
                type="button"
                className="property-card__name-button"
                onClick={() => onViewDetails(property)}
              >
                {property.propertyName}
              </button>
            </h3>
            <p className="property-card__location">📍 {property.location}</p>
          </div>
          <BudgetBadge property={property} />
        </div>

        <p className="property-card__price">{formatMYR(property.priceMYR)}</p>

        <div className="property-card__labels">
          <ProvenanceBadge
            isExample={property.isExample}
            verifiedDate={property.verifiedDate}
            sourceUrl={property.sourceUrl}
          />
        </div>

        <div className="property-card__tags">
          <span className="badge badge--type">{property.propertyType}</span>
          {property.bedrooms !== null ? (
            <span className="badge badge--type">
              {property.bedrooms} {t('detail.bedrooms')}
            </span>
          ) : (
            <span className="badge badge--type badge--unknown">{t('common.unknown')}</span>
          )}
          {property.bathrooms !== null && (
            <span className="badge badge--type">
              {property.bathrooms} {t('detail.bathrooms')}
            </span>
          )}
          {property.builtUpSqft !== null && (
            <span className="badge badge--type">
              {property.builtUpSqft.toLocaleString()} {t('detail.sqft')}
            </span>
          )}
        </div>

        <div className="property-card__finance">
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">{t('card.estMonthly')}</span>
            <span className="property-card__finance-value">
              {formatMYR(property.estimatedMonthlyMortgage)}
            </span>
          </div>
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">{t('card.downPayment')}</span>
            <span className="property-card__finance-value">
              {formatMYR(property.requiredDownPayment)}
            </span>
          </div>
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">{t('card.yourCash')}</span>
            <span
              className={`property-card__finance-value ${
                property.cashShortfall > 0 ? 'property-card__finance-value--warning' : ''
              }`}
            >
              {property.cashShortfall > 0
                ? t('card.cashShort', { amount: formatMYR(property.cashShortfall) })
                : formatMYR(property.downPaymentApplied)}
            </span>
          </div>
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">{t('card.estDsr')}</span>
            <span
              className={`property-card__finance-value ${
                property.estimatedDSR > ILLUSTRATIVE_DSR_CAP
                  ? 'property-card__finance-value--warning'
                  : ''
              }`}
            >
              {formatPercentage(property.estimatedDSR)}
            </span>
          </div>
        </div>

        <p className="property-card__explanation">{property.matchExplanation}</p>

        <div className="property-card__actions">
          <button
            type="button"
            className={`icon-button${isSaved ? ' is-active' : ''}`}
            aria-pressed={isSaved}
            aria-label={isSaved ? t('card.unfavorite') : t('card.favorite')}
            title={isSaved ? t('card.unfavorite') : t('card.favorite')}
            onClick={() => onToggleSaved(property.id)}
          >
            <span aria-hidden="true">{isSaved ? '♥' : '♡'}</span>
          </button>

          <button
            type="button"
            className={`icon-button${isCompared ? ' is-active' : ''}`}
            aria-pressed={isCompared}
            aria-label={isCompared ? t('card.uncompare') : t('card.compare')}
            title={
              compareDisabled
                ? t('card.compareFull', { max: 3 })
                : isCompared
                  ? t('card.uncompare')
                  : t('card.compare')
            }
            disabled={compareDisabled}
            onClick={() => onToggleCompared(property.id)}
          >
            <span aria-hidden="true">{isCompared ? '⊟' : '⊞'}</span>
          </button>
        </div>

        <div className="property-card__footer">
          <span className="property-card__score">
            {t('card.match')}: {property.matchScore}/100
          </span>
          <button
            type="button"
            className="btn btn--secondary property-card__details-btn"
            onClick={() => onViewDetails(property)}
          >
            {t('card.viewDetails')}
          </button>
        </div>
      </div>
    </article>
  );
}
