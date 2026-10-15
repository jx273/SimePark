import { PropertyWithCalculations } from '../types/property';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import { ILLUSTRATIVE_DSR_CAP, REQUIRED_DOWN_PAYMENT_PERCENTAGE } from '../types/affordability';
import BudgetBadge from './BudgetBadge';
import './PropertyModal.css';

interface PropertyModalProps {
  property: PropertyWithCalculations;
  onClose: () => void;
}

export default function PropertyModal({ property, onClose }: PropertyModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Property Details">
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {property.isExample && (
          <div className="property-card__demo-banner">
            DEMO DATA — Replace with verified listings before final presentation
          </div>
        )}

        <div className="modal__body">
          <div className="modal__header">
            <h2 className="modal__title">{property.propertyName}</h2>
            <p className="modal__location">📍 {property.location}</p>
            <p className="modal__price">{formatMYR(property.priceMYR)}</p>
            <BudgetBadge property={property} long />
          </div>

          <div className="modal__section">
            <h3 className="modal__section-title">Property Details</h3>
            <div className="modal__details-grid">
              <div className="modal__detail">
                <span className="modal__detail-label">Type</span>
                <span className="modal__detail-value">{property.propertyType}</span>
              </div>
              <div className="modal__detail">
                <span className="modal__detail-label">Bedrooms</span>
                <span className="modal__detail-value">
                  {property.bedrooms !== null ? property.bedrooms : 'Not specified'}
                </span>
              </div>
              <div className="modal__detail">
                <span className="modal__detail-label">Bathrooms</span>
                <span className="modal__detail-value">
                  {property.bathrooms !== null ? property.bathrooms : 'Not specified'}
                </span>
              </div>
              <div className="modal__detail">
                <span className="modal__detail-label">Built-up Area</span>
                <span className="modal__detail-value">
                  {property.builtUpSqft !== null
                    ? `${property.builtUpSqft.toLocaleString()} sqft`
                    : 'Not specified'}
                </span>
              </div>
            </div>
          </div>

          <div className="modal__section">
            <h3 className="modal__section-title">Estimated Affordability</h3>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-card__label">Monthly Mortgage</p>
                <p className="stat-card__value">{formatMYR(property.estimatedMonthlyMortgage)}</p>
                <p className="stat-card__note">Estimated payment</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">Required Down Payment</p>
                <p className="stat-card__value">{formatMYR(property.requiredDownPayment)}</p>
                <p className="stat-card__note">
                  {REQUIRED_DOWN_PAYMENT_PERCENTAGE}% of property price
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">Your Available Cash</p>
                <p
                  className={`stat-card__value ${
                    property.cashShortfall > 0 ? 'stat-card__value--accent' : ''
                  }`}
                >
                  {formatMYR(property.downPaymentApplied)}
                </p>
                <p className="stat-card__note">
                  {property.cashShortfall > 0
                    ? `Short by ${formatMYR(property.cashShortfall)}`
                    : 'Covers the required down payment'}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">Loan Principal</p>
                <p className="stat-card__value">{formatMYR(property.loanPrincipal)}</p>
                <p className="stat-card__note">Price minus your cash</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">Est. DSR</p>
                <p className={`stat-card__value ${property.estimatedDSR > ILLUSTRATIVE_DSR_CAP ? 'stat-card__value--accent' : ''}`}>
                  {formatPercentage(property.estimatedDSR)}
                </p>
                <p className="stat-card__note">Including this mortgage</p>
              </div>
            </div>
          </div>

          <div className="modal__section">
            <h3 className="modal__section-title">Why This Property</h3>
            <p className="modal__explanation">{property.matchExplanation}</p>
            <p className="modal__score">Match Score: {property.matchScore}/100</p>
          </div>

          {property.sourceUrl && (
            <div className="modal__section">
              <h3 className="modal__section-title">Source</h3>
              <a
                href={property.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary"
              >
                View Original Listing ↗
              </a>
            </div>
          )}

          {!property.sourceUrl && (
            <p className="modal__no-source">
              No source URL available for this property.
              {property.isExample && ' This is a demo record for testing purposes.'}
            </p>
          )}

          <div className="disclaimer">
            <p className="disclaimer__title">⚠️ Estimate Only</p>
            <p className="disclaimer__text">
              All calculations are illustrative estimates, not a loan approval, a loan offer,
              or an eligibility decision. Actual mortgage rates, eligibility, and costs depend
              on your lender. Other fees (legal, stamp duty, insurance, maintenance) are not
              included. This is not financial advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
