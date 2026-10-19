import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useSelection } from '../state/SelectionProvider';
import { recordActivity } from '../lib/userRepository';
import { formatMYR, formatPercentage } from '../utils/mortgage';
import { ILLUSTRATIVE_DSR_CAP } from '../types/affordability';
import { navigate } from '../router/router';
import BudgetBadge, { ProvenanceBadge } from '../components/BudgetBadge';
import type { Property, PropertyWithCalculations } from '../types/property';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import AssistantChat from '../components/AssistantChat';
import './PropertyDetailPage.css';

interface PropertyDetailPageProps {
  propertyId: string;
  /** The enriched record when the catalogue has it, otherwise null. */
  property: PropertyWithCalculations | null;
  /** The raw record, so facts can be shown without an affordability estimate. */
  rawProperty: Property | null;
  isLoading: boolean;
  affordabilityInputs: AffordabilityInputs | null;
  affordabilityResult: AffordabilityResult | null;
  properties: PropertyWithCalculations[];
  comparisonProperties: PropertyWithCalculations[];
}

export default function PropertyDetailPage({
  propertyId,
  property,
  rawProperty,
  isLoading,
  affordabilityInputs,
  affordabilityResult,
  properties,
  comparisonProperties,
}: PropertyDetailPageProps) {
  const { t } = useTranslation();
  const { user, isConfigured } = useAuth();
  const { isSaved, isCompared, toggleSaved, toggleCompared, comparisonFull } = useSelection();
  const [activityLogged, setActivityLogged] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // Record a genuine view once, and only for a signed-in user, so the dashboard
  // activity list reflects real usage rather than page loads by guests.
  useEffect(() => {
    if (!user || !isConfigured || activityLogged || !rawProperty) return;
    setActivityLogged(true);
    void recordActivity(user.id, 'viewed', rawProperty.id);
  }, [user, isConfigured, activityLogged, rawProperty]);

  if (isLoading) {
    return (
      <div className="container detail">
        <p className="detail__loading" role="status">
          {t('common.loading')}
        </p>
      </div>
    );
  }

  // The record may be absent because it is unpublished, removed, or simply not in
  // the id space. All three are reported the same honest way.
  if (!rawProperty) {
    return (
      <div className="container detail">
        <div className="empty-state">
          <h1 className="empty-state__title">{t('detail.notFound')}</h1>
          <p className="empty-state__text">{t('detail.notFoundText')}</p>
          <button
            type="button"
            className="btn btn--primary mt-lg"
            onClick={() => navigate({ name: 'home' })}
          >
            {t('footer.navigate')}
          </button>
        </div>
      </div>
    );
  }

  const saved = isSaved(rawProperty.id);
  const compared = isCompared(rawProperty.id);

  const facts: Array<{ label: string; value: string | null }> = [
    { label: t('detail.type'), value: rawProperty.propertyType },
    {
      label: t('detail.bedrooms'),
      value: rawProperty.bedrooms === null ? null : String(rawProperty.bedrooms),
    },
    {
      label: t('detail.bathrooms'),
      value: rawProperty.bathrooms === null ? null : String(rawProperty.bathrooms),
    },
    {
      label: t('detail.builtUp'),
      value:
        rawProperty.builtUpSqft === null
          ? null
          : `${rawProperty.builtUpSqft.toLocaleString()} ${t('detail.sqft')}`,
    },
    { label: t('detail.location'), value: rawProperty.location },
  ];

  return (
    <div className="container detail" key={propertyId}>
      <button type="button" className="detail__back" onClick={() => navigate({ name: 'home' })}>
        <span aria-hidden="true">←</span> {t('detail.backToList')}
      </button>

      <article className="detail__card surface">
        <header className="detail__header">
          <div>
            <h1 className="detail__title">{rawProperty.propertyName}</h1>
            <p className="detail__location">📍 {rawProperty.location}</p>
          </div>
          <div className="detail__labels">
            <ProvenanceBadge
              isExample={rawProperty.isExample}
              verifiedDate={rawProperty.verifiedDate}
              sourceUrl={rawProperty.sourceUrl}
            />
            {property && <BudgetBadge property={property} long />}
          </div>
        </header>

        {rawProperty.isExample && (
          <p className="detail__demo-note" role="note">
            <span aria-hidden="true">⚑ </span>
            {t('detail.demoRecord')} {t('card.demoBanner')}
          </p>
        )}

        <p className="detail__price">
          {rawProperty.priceBasis ? `${rawProperty.priceBasis}: ` : ''}
          {formatMYR(rawProperty.priceMYR)}
        </p>

        {(rawProperty.media?.length ?? 0) > 0 && (
          <section className="detail__section" aria-label={t('detail.gallery')}>
            <div className="detail__gallery">
              {(rawProperty.media ?? [])
                .filter((item) => item.kind === 'photo')
                .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder)
                .map((item) => (
                  <figure className="detail__media" key={item.id}>
                    <button
                      type="button"
                      className="detail__media-button"
                      onClick={() => setExpandedImage(item.url)}
                      aria-label={t('detail.enlargeImage')}
                    >
                      <img src={item.url} alt={item.altText ?? item.caption ?? rawProperty.propertyName} loading="lazy" />
                    </button>
                    <figcaption>
                      {item.caption}
                      {item.attribution && (
                        <span className="detail__attribution">{t('detail.imageAttribution', { source: item.attribution })}</span>
                      )}
                    </figcaption>
                  </figure>
                ))}
            </div>
            {(rawProperty.media ?? []).some((item) => item.kind === 'floorplan') && (
              <div className="detail__floorplans">
                <h3>{t('detail.floorplans')}</h3>
                {(rawProperty.media ?? [])
                  .filter((item) => item.kind === 'floorplan')
                  .map((item) => (
                    <figure className="detail__media" key={item.id}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        <img src={item.url} alt={item.altText ?? item.caption ?? t('detail.floorplan')} loading="lazy" />
                      </a>
                      <figcaption>
                        {item.caption}
                        {item.attribution && (
                          <span className="detail__attribution">{t('detail.imageAttribution', { source: item.attribution })}</span>
                        )}
                      </figcaption>
                    </figure>
                  ))}
              </div>
            )}
          </section>
        )}

        <div className="detail__actions">
          <button
            type="button"
            className={`btn ${saved ? 'btn--secondary' : 'btn--primary'}`}
            aria-pressed={saved}
            onClick={() => void toggleSaved(rawProperty.id)}
          >
            <span aria-hidden="true">{saved ? '♥' : '♡'}</span>{' '}
            {saved ? t('card.unfavorite') : t('card.favorite')}
          </button>
          <button
            type="button"
            className={`btn ${compared ? 'btn--secondary' : 'btn--outline'}`}
            aria-pressed={compared}
            disabled={!compared && comparisonFull}
            title={!compared && comparisonFull ? t('card.compareFull', { max: 3 }) : undefined}
            onClick={() => void toggleCompared(rawProperty.id)}
          >
            <span aria-hidden="true">{compared ? '⊟' : '⊞'}</span>{' '}
            {compared ? t('card.uncompare') : t('card.compare')}
          </button>
        </div>

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.whyTitle')}</h2>
          <dl className="detail__facts">
            {facts.map((fact) => (
              <div className="detail__fact" key={fact.label}>
                <dt>{fact.label}</dt>
                {/* A null value is reported as "Not recorded", never guessed. */}
                <dd className={fact.value === null ? 'detail__fact--unknown' : undefined}>
                  {fact.value ?? t('common.unknown')}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {property && property.budgetStatus !== 'uncalculated' ? (
          <section className="detail__section">
            <h2 className="detail__section-title">{t('detail.affordabilityTitle')}</h2>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.requiredDownPayment')}</p>
                <p className="stat-card__value">{formatMYR(property.requiredDownPayment)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.availableCash')}</p>
                <p className="stat-card__value">{formatMYR(property.downPaymentApplied)}</p>
                <p className="stat-card__note">
                  {property.cashShortfall !== null && property.cashShortfall > 0
                    ? t('detail.shortfall', { amount: formatMYR(property.cashShortfall) })
                    : t('detail.coversDownPayment')}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('card.estMonthly')}</p>
                <p className="stat-card__value">{formatMYR(property.estimatedMonthlyMortgage)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.loanPrincipal')}</p>
                <p className="stat-card__value">{formatMYR(property.loanPrincipal)}</p>
                <p className="stat-card__note">{t('detail.loanPrincipalNote')}</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.estDsr')}</p>
                <p
                  className={`stat-card__value ${
                    property.estimatedDSR !== null && property.estimatedDSR > ILLUSTRATIVE_DSR_CAP
                      ? 'stat-card__value--accent'
                      : ''
                  }`}
                >
                  {formatPercentage(property.estimatedDSR)}
                </p>
                <p className="stat-card__note">{t('detail.dsrNote')}</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.matchScore')}</p>
                <p className="stat-card__value">{property.matchScore}/100</p>
              </div>
            </div>

            <p className="detail__explanation">{property.matchExplanation}</p>
          </section>
        ) : (
          <section className="detail__section">
            <h2 className="detail__section-title">{t('detail.affordabilityTitle')}</h2>
            <p className="detail__explanation">{t('detail.noAffordability')}</p>
          </section>
        )}

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.moreFacts')}</h2>
          <dl className="detail__facts">
            {[
              [t('explorer.propertyType'), rawProperty.propertyType],
              [t('detail.priceBasis'), rawProperty.priceBasis],
              [t('detail.landArea'), rawProperty.landArea == null ? null : `${rawProperty.landArea.toLocaleString()} ${rawProperty.landAreaUnit ?? ''}`.trim()],
              [t('detail.tenure'), rawProperty.tenure],
              [t('detail.completionDate'), rawProperty.completionDate],
              [t('detail.furnishing'), rawProperty.furnishingStatus],
              [t('detail.parkingBays'), rawProperty.parkingBays == null ? null : String(rawProperty.parkingBays)],
              [t('detail.maintenance'), rawProperty.monthlyMaintenanceMYR == null ? null : formatMYR(rawProperty.monthlyMaintenanceMYR)],
              [t('detail.sinkingFund'), rawProperty.sinkingFundMYR == null ? null : formatMYR(rawProperty.sinkingFundMYR)],
              [t('detail.availability'), rawProperty.availabilityStatus === 'unknown' ? t('detail.availabilityUnknown') : rawProperty.availabilityStatus],
              [t('detail.availabilityCheckedDate'), rawProperty.availabilityCheckedDate],
              [t('detail.confidence'), rawProperty.confidenceStatus],
            ].filter(([, value]) => value !== null && value !== undefined).map(([label, value]) => (
              <div className="detail__fact" key={String(label)}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {(rawProperty.facilities?.length ?? 0) > 0 && (
            <div>
              <h3>{t('detail.facilities')}</h3>
              <ul>{rawProperty.facilities?.map((facility) => <li key={facility}>{facility}</li>)}</ul>
            </div>
          )}
          {(rawProperty.amenities?.length ?? 0) > 0 && (
            <div>
              <h3>{t('detail.nearbyAmenities')}</h3>
              <ul>
                {rawProperty.amenities?.map((amenity) => (
                  <li key={amenity.name}>
                    {amenity.name}
                    {amenity.distanceKm != null && (
                      <span className="detail__reported-distance">
                        {t('detail.reportedDistance')}: {amenity.distanceKm} km
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rawProperty.nearestTransit && (
            <p>
              <strong>{t('detail.nearestTransit')}:</strong> {rawProperty.nearestTransit}
              {rawProperty.transitDistanceKm != null && ` — ${rawProperty.transitDistanceKm} km`}
              {rawProperty.transitTravelTimeMin != null && `, ${rawProperty.transitTravelTimeMin} min`}
              {(rawProperty.transitDistanceKm != null || rawProperty.transitTravelTimeMin != null) &&
                ` (${rawProperty.transitMode ?? t('detail.routeTypeUnknown')})`}
            </p>
          )}
          <p><strong>{t('detail.imagePermission')}:</strong> {rawProperty.imagePermission ?? t('common.unknown')}</p>
          {rawProperty.notes && <p className="detail__source-notes">{rawProperty.notes}</p>}
        </section>

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.provenanceTitle')}</h2>
          <dl className="detail__facts">
            <div className="detail__fact">
              <dt>{t('detail.verifiedDate')}</dt>
              <dd className={rawProperty.verifiedDate ? undefined : 'detail__fact--unknown'}>
                {rawProperty.verifiedDate ?? t('status.notVerified')}
              </dd>
            </div>
            <div className="detail__fact">
              <dt>{t('detail.sourceAccessed')}</dt>
              <dd>{rawProperty.dateAccessed ?? t('common.unknown')}</dd>
            </div>
            <div className="detail__fact">
              <dt>{t('detail.source')}</dt>
              <dd>{rawProperty.sourceName ?? rawProperty.sourceType ?? t('common.unknown')}</dd>
            </div>
          </dl>

          {rawProperty.sourceUrl ? (
            <a
              className="btn btn--secondary"
              href={rawProperty.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('detail.viewSource')} ↗
            </a>
          ) : (
            <p className="detail__no-source">{t('detail.noSource')}</p>
          )}
        </section>

        <div className="disclaimer">
          <p className="disclaimer__title">⚠️ {t('results.disclaimerTitle')}</p>
          <p className="disclaimer__text">{t('results.disclaimerText')}</p>
        </div>
      </article>
      <AssistantChat
        userInputs={affordabilityInputs}
        affordabilityResult={affordabilityResult}
        properties={properties}
        selectedProperty={property}
        comparisonProperties={comparisonProperties}
        onNavigate={(section) => {
          const target = document.getElementById(section);
          target?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      {expandedImage && (
        <div className="detail__lightbox" role="dialog" aria-modal="true" aria-label={t('detail.gallery')}>
          <button type="button" className="detail__lightbox-close" onClick={() => setExpandedImage(null)}>
            {t('common.close')}
          </button>
          <img src={expandedImage} alt={rawProperty.propertyName} />
        </div>
      )}
    </div>
  );
}
