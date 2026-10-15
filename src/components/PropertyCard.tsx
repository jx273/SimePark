import { PropertyWithCalculations } from '../types/property';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import { ILLUSTRATIVE_DSR_CAP } from '../types/affordability';
import BudgetBadge from './BudgetBadge';
import './PropertyCard.css';

interface PropertyCardProps {
  property: PropertyWithCalculations;
  onViewDetails: (property: PropertyWithCalculations) => void;
}

export default function PropertyCard({ property, onViewDetails }: PropertyCardProps) {
  return (
    <article className="property-card card" onClick={() => onViewDetails(property)}>
      {/* Demo data badge */}
      {property.isExample && (
        <div className="property-card__demo-banner">
          DEMO DATA — For interface testing only
        </div>
      )}

      <div className="property-card__content">
        <div className="property-card__header">
          <div>
            <h3 className="property-card__name">{property.propertyName}</h3>
            <p className="property-card__location">📍 {property.location}</p>
          </div>
          <BudgetBadge property={property} />
        </div>

        <p className="property-card__price">{formatMYR(property.priceMYR)}</p>

        <div className="property-card__tags">
          <span className="badge badge--type">{property.propertyType}</span>
          {property.bedrooms !== null && (
            <span className="badge badge--type">{property.bedrooms} Bed</span>
          )}
          {property.bathrooms !== null && (
            <span className="badge badge--type">{property.bathrooms} Bath</span>
          )}
          {property.builtUpSqft !== null && (
            <span className="badge badge--type">{property.builtUpSqft.toLocaleString()} sqft</span>
          )}
        </div>

        <div className="property-card__finance">
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">Est. Monthly</span>
            <span className="property-card__finance-value">
              {formatMYR(property.estimatedMonthlyMortgage)}
            </span>
          </div>
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">Down Payment</span>
            <span className="property-card__finance-value">
              {formatMYR(property.requiredDownPayment)}
            </span>
          </div>
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">Your Cash</span>
            <span
              className={`property-card__finance-value ${
                property.cashShortfall > 0 ? 'property-card__finance-value--warning' : ''
              }`}
            >
              {property.cashShortfall > 0
                ? `Short ${formatMYR(property.cashShortfall)}`
                : formatMYR(property.downPaymentApplied)}
            </span>
          </div>
          <div className="property-card__finance-item">
            <span className="property-card__finance-label">Est. DSR</span>
            <span className={`property-card__finance-value ${
              property.estimatedDSR > ILLUSTRATIVE_DSR_CAP
                ? 'property-card__finance-value--warning'
                : ''
            }`}>
              {formatPercentage(property.estimatedDSR)}
            </span>
          </div>
        </div>

        <p className="property-card__explanation">{property.matchExplanation}</p>

        <div className="property-card__footer">
          <span className="property-card__score">
            Match: {property.matchScore}/100
          </span>
          <button
            className="btn btn--secondary property-card__details-btn"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(property);
            }}
          >
            View Details
          </button>
        </div>
      </div>
    </article>
  );
}
