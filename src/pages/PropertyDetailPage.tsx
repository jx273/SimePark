import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useSelection } from '../state/SelectionProvider';
import { recordActivity } from '../lib/userRepository';
import { formatMYR, formatPercentage, calculateMonthlyMortgage } from '../utils/mortgage';
import { ILLUSTRATIVE_DSR_CAP } from '../types/affordability';
import { navigate } from '../router/router';
import BudgetBadge, { ProvenanceBadge } from '../components/BudgetBadge';
import type { Property, PropertyWithCalculations } from '../types/property';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import { isPubliclyDisplayableMedia, isSafeMediaUrl } from '../lib/propertyAdapter';
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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [failedMedia, setFailedMedia] = useState<Set<string>>(() => new Set());
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(() => new Set());

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
  const publicMedia = (rawProperty.media ?? [])
    .filter(isPubliclyDisplayableMedia)
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
  const photos = publicMedia.filter((item) => item.kind === 'photo');
  const floorplans = publicMedia.filter((item) => item.kind === 'floorplan');
  const videos = publicMedia.filter((item) => item.kind === 'video');
  const hasUnapprovedPhotos = (rawProperty.media ?? []).some(
    (item) => item.kind === 'photo' && !isPubliclyDisplayableMedia(item)
  );
  const activePhoto = photos[activePhotoIndex] ?? null;

  useEffect(() => {
    setActivePhotoIndex(0);
    setFailedMedia(new Set());
    setLoadedMedia(new Set());
  }, [propertyId]);

  const stepPhoto = (offset: number) => {
    if (photos.length < 2) return;
    setActivePhotoIndex((current) => (current + offset + photos.length) % photos.length);
  };
  const renderFacts = (entries: Array<[string, string | null]>) => (
    <dl className="detail__facts">
      {entries.filter(([, value]) => value !== null).map(([label, value]) => (
        <div className="detail__fact" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
  const facilityIcon = (facility: string) => {
    const label = facility.toLowerCase();
    if (label.includes('pool')) return '◉';
    if (label.includes('gym') || label.includes('fitness')) return '◇';
    if (label.includes('security') || label.includes('guard')) return '▣';
    if (label.includes('park') || label.includes('playground')) return '♧';
    if (label.includes('court') || label.includes('sport')) return '⌁';
    return '•';
  };

  const getAmenityCategory = (name: string): { icon: string; category: string } => {
    const lower = name.toLowerCase();
    if (lower.match(/sk |smk|sjk|school|primary|secondary|sekolah|college|kolej|universiti|university|institut|kindergarten|kumon|brainy/)) {
      return { icon: '🏫', category: 'Education' };
    }
    if (lower.match(/hospital|clinic|klinik|medical|doctors|pantai|ksmc/)) {
      return { icon: '🏥', category: 'Healthcare' };
    }
    if (lower.match(/mall|megamall|plaza|pavilion|suria|citta|paradigm|fahrenheit|lot 10|gurney/)) {
      return { icon: '🛍️', category: 'Shopping' };
    }
    if (lower.match(/mart|tesco|lotus|aeon|giant|market|grocer|pasar/)) {
      return { icon: '🛒', category: 'Grocery' };
    }
    if (lower.match(/park|taman|eco park|forest|lake|tasik|reserve|golf|club/)) {
      return { icon: '🌳', category: 'Parks & Nature' };
    }
    if (lower.match(/lrt|mrt|ktm|station|stesen|ciq|causeway|terminal/)) {
      return { icon: '🚉', category: 'Transit' };
    }
    if (lower.match(/dining|restaurant|food|cafe|makan/)) {
      return { icon: '🍽️', category: 'Dining' };
    }
    return { icon: '📍', category: 'Amenity' };
  };

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
          {rawProperty.priceMYR === null ? t('common.unknown') : formatMYR(rawProperty.priceMYR)}
        </p>

        <section className="detail__section" aria-label={t('detail.gallery')}>
          <h2 className="detail__section-title">{t('detail.gallery')}</h2>
          <div
            className="detail__gallery-viewer"
            role="group"
            aria-label={t('detail.gallery')}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') stepPhoto(-1);
              if (event.key === 'ArrowRight') stepPhoto(1);
            }}
          >
            {activePhoto && !failedMedia.has(activePhoto.id) ? (
              <figure className="detail__hero-media">
                {!loadedMedia.has(activePhoto.id) && (
                  <span className="detail__media-loading" role="status">{t('detail.loadingMedia')}</span>
                )}
                <button
                  type="button"
                  className="detail__media-button"
                  onClick={() => setExpandedImage(activePhoto.externalUrl ?? activePhoto.url)}
                  aria-label={t('detail.enlargeImage')}
                >
                  <img
                    src={activePhoto.externalUrl ?? activePhoto.url}
                    alt={activePhoto.altText ?? activePhoto.caption ?? rawProperty.propertyName}
                    onLoad={() => setLoadedMedia((current) => new Set(current).add(activePhoto.id))}
                    onError={() => setFailedMedia((current) => new Set(current).add(activePhoto.id))}
                  />
                </button>
                {isSafeMediaUrl(rawProperty.sourceUrl) && (
                  <a
                    className="detail__image-source"
                    href={rawProperty.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('detail.viewSource')} ↗
                  </a>
                )}
                <figcaption>{activePhoto.caption}</figcaption>
                {photos.length > 1 && (
                  <div className="detail__gallery-controls">
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => stepPhoto(-1)}>
                      {t('detail.previousImage')}
                    </button>
                    <span aria-live="polite">{activePhotoIndex + 1} / {photos.length}</span>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => stepPhoto(1)}>
                      {t('detail.nextImage')}
                    </button>
                  </div>
                )}
              </figure>
            ) : (
              <div className="detail__media-placeholder" role="status">
                <span className="detail__placeholder-icon" aria-hidden="true">⌂</span>
                <strong>{t(failedMedia.size > 0 ? 'detail.mediaUnavailable' : 'detail.noPublicMedia')}</strong>
                {hasUnapprovedPhotos && <span>{t('detail.mediaPermissionPending')}</span>}
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="detail__thumbnails" aria-label={t('detail.galleryThumbnails')}>
              {photos.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`detail__thumbnail${index === activePhotoIndex ? ' is-active' : ''}`}
                  aria-label={t('detail.selectImage', { index: index + 1 })}
                  aria-pressed={index === activePhotoIndex}
                  onClick={() => setActivePhotoIndex(index)}
                >
                  <img src={item.externalUrl ?? item.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </section>

        {floorplans.length > 0 && (
          <section className="detail__section">
            <h2 className="detail__section-title">{t('detail.floorplans')}</h2>
            <div className="detail__floorplans">
              {floorplans.map((item) => (
                <figure className="detail__media" key={item.id}>
                  {failedMedia.has(item.id) ? (
                    <p className="detail__media-placeholder" role="status">{t('detail.mediaUnavailable')}</p>
                  ) : (
                    <>
                      {!loadedMedia.has(item.id) && (
                        <span className="detail__media-loading" role="status">{t('detail.loadingMedia')}</span>
                      )}
                      <a href={item.externalUrl ?? item.url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={item.externalUrl ?? item.url}
                          alt={item.altText ?? item.caption ?? t('detail.floorplan')}
                          loading="lazy"
                          onLoad={() => setLoadedMedia((current) => new Set(current).add(item.id))}
                          onError={() => setFailedMedia((current) => new Set(current).add(item.id))}
                        />
                      </a>
                    </>
                  )}
                  <figcaption>{item.caption ?? t('detail.floorplan')}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {videos.length > 0 && (
          <section className="detail__section">
            <h2 className="detail__section-title">{t('detail.videos')}</h2>
            <div className="detail__videos">
              {videos.map((item) => {
                const url = item.externalUrl ?? item.url;
                const isDirectVideo = /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url);
                const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]+)/);

                if (ytMatch && ytMatch[1]) {
                  const embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;
                  return (
                    <div key={item.id} className="detail__video-wrapper">
                      <iframe
                        src={embedUrl}
                        title={item.caption ?? `${rawProperty.propertyName} video`}
                        className="detail__video-iframe"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="detail__video-external-link"
                      >
                        ↗ {t('detail.openVideoSource')}
                      </a>
                    </div>
                  );
                }

                return isDirectVideo ? (
                  failedMedia.has(item.id) ? (
                    <p key={item.id} role="status">{t('detail.videoUnavailable')}</p>
                  ) : (
                    <video
                      key={item.id}
                      src={url}
                      controls
                      preload="metadata"
                      className="detail__video-player"
                      onError={() => setFailedMedia((current) => new Set(current).add(item.id))}
                    >
                      {t('detail.videoUnavailable')}
                    </video>
                  )
                ) : (
                  <a key={item.id} href={url} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--sm">
                    ↗ {t('detail.openVideoSource')}
                  </a>
                );
              })}
            </div>
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
        {!compared && comparisonFull && (
          <p className="detail__compare-limit" role="status">
            {t('card.compareFull', { max: 3 })}
          </p>
        )}

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
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.requiredDownPayment')}</p>
                <p className="stat-card__value">
                  {rawProperty.priceMYR !== null ? formatMYR(rawProperty.priceMYR * 0.1) : 'RM —'}
                </p>
                <p className="stat-card__note">10% standard planning assumption</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('card.estMonthly')}</p>
                <p className="stat-card__value">
                  {rawProperty.priceMYR !== null
                    ? formatMYR(calculateMonthlyMortgage(rawProperty.priceMYR * 0.9, 4.2, 30))
                    : 'RM —'}
                </p>
                <p className="stat-card__note">30 yrs @ 4.2% indicative baseline</p>
              </div>
              <div className="stat-card">
                <p className="stat-card__label">{t('detail.loanPrincipal')}</p>
                <p className="stat-card__value">
                  {rawProperty.priceMYR !== null ? formatMYR(rawProperty.priceMYR * 0.9) : 'RM —'}
                </p>
                <p className="stat-card__note">90% financing baseline</p>
              </div>
            </div>
            <div className="detail__uncalculated-cta surface">
              <div>
                <p className="detail__uncalculated-title">{t('explorer.promptTitle')}</p>
                <p className="detail__uncalculated-text">{t('detail.noAffordability')}</p>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => navigate({ name: 'home' })}
              >
                {t('hero.primaryCta')}
              </button>
            </div>
          </section>
        )}

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.priceOwnership')}</h2>
          {renderFacts([
              [t('detail.priceBasis'), rawProperty.priceBasis ?? null],
              [t('detail.priceRange'), rawProperty.priceMinMYR !== null && rawProperty.priceMinMYR !== undefined
                ? `${formatMYR(rawProperty.priceMinMYR)}${rawProperty.priceMaxMYR != null ? ` – ${formatMYR(rawProperty.priceMaxMYR)}` : ''}`
                : rawProperty.priceMaxMYR != null ? formatMYR(rawProperty.priceMaxMYR) : null],
              [t('detail.tenure'), rawProperty.tenure ?? null],
              [t('detail.landArea'), rawProperty.landArea == null ? null : `${rawProperty.landArea.toLocaleString()} ${rawProperty.landAreaUnit ?? ''}`.trim()],
              [t('detail.completionDate'), rawProperty.completionDate ?? null],
          ])}
        </section>

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.availabilityAndFurnishing')}</h2>
          {renderFacts([
              [t('detail.availability'), rawProperty.availabilityStatus === 'unknown' ? t('detail.availabilityUnknown') : rawProperty.availabilityStatus ?? null],
              [t('detail.availabilityCheckedDate'), rawProperty.availabilityCheckedDate ?? null],
              [t('detail.furnishing'), rawProperty.furnishingStatus ?? null],
              [t('detail.parkingBays'), rawProperty.parkingBays == null ? null : String(rawProperty.parkingBays)],
          ])}
        </section>

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.maintenanceCosts')}</h2>
          {renderFacts([
              [t('detail.maintenance'), rawProperty.monthlyMaintenanceMYR == null ? null : formatMYR(rawProperty.monthlyMaintenanceMYR)],
              [t('detail.sinkingFund'), rawProperty.sinkingFundMYR == null ? null : formatMYR(rawProperty.sinkingFundMYR)],
          ])}
        </section>

        {rawProperty.nearestTransit && (
          <section className="detail__section">
              <h2 className="detail__section-title"><span aria-hidden="true">🚉 </span>{t('detail.nearbyTransport')}</h2>
              <p><strong>{rawProperty.nearestTransit}</strong></p>
              <p className="detail__explanation">
                {rawProperty.transitDistanceKm != null && `${t('detail.reportedDistance')}: ${rawProperty.transitDistanceKm} km`}
                {rawProperty.transitDistanceKm != null && rawProperty.transitTravelTimeMin != null && ' · '}
                {rawProperty.transitTravelTimeMin != null && `${t('detail.reportedTravelTime')}: ${rawProperty.transitTravelTimeMin} min`}
                {(rawProperty.transitDistanceKm != null || rawProperty.transitTravelTimeMin != null) &&
                  ` · ${rawProperty.transitMode ?? t('detail.routeTypeUnknown')}`}
              </p>
          </section>
        )}

        {(rawProperty.amenities?.length ?? 0) > 0 && (
          <section className="detail__section">
            <h2 className="detail__section-title"><span aria-hidden="true">📍 </span>{t('detail.nearbyAmenities')}</h2>
            <p className="detail__amenity-disclaimer">ℹ️ {t('detail.nearbyAmenitiesNote')}</p>
            <div className="detail__amenity-grid">
              {rawProperty.amenities?.map((amenity, index) => {
                const cat = getAmenityCategory(amenity.name);
                return (
                  <div className="detail__amenity-card" key={`${amenity.name}-${index}`}>
                    <span className="detail__amenity-icon" aria-hidden="true">{cat.icon}</span>
                    <div className="detail__amenity-body">
                      <span className="detail__amenity-name">{amenity.name}</span>
                      {amenity.distanceKm != null ? (
                        <span className="detail__amenity-distance-badge">
                          {t('detail.reportedDistance')}: {amenity.distanceKm} km
                        </span>
                      ) : (
                        <span className="detail__amenity-distance-badge detail__amenity-distance-badge--general">
                          {t('detail.routeTypeUnknown')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(rawProperty.facilities?.length ?? 0) > 0 && (
          <section className="detail__section">
              <h2 className="detail__section-title">{t('detail.facilities')}</h2>
              <ul className="detail__facility-grid">
                {rawProperty.facilities?.map((facility) => (
                  <li className="detail__facility-chip" key={facility}>
                    <span aria-hidden="true">{facilityIcon(facility)}</span>{facility}
                  </li>
                ))}
              </ul>
          </section>
        )}

        <section className="detail__section">
          <h2 className="detail__section-title">{t('detail.provenanceTitle')}</h2>
          {renderFacts([
              [t('detail.confidence'), rawProperty.confidenceStatus ?? null],
              [t('detail.verifiedDate'), rawProperty.verifiedDate ?? t('status.notVerified')],
              [t('detail.sourceAccessed'), rawProperty.dateAccessed ?? null],
              [t('detail.source'), rawProperty.sourceName ?? rawProperty.sourceType ?? null],
          ])}
          <p><strong>{t('detail.imagePermission')}:</strong> {rawProperty.imagePermission ?? t('common.unknown')}</p>
          {rawProperty.sourceUrl && isSafeMediaUrl(rawProperty.sourceUrl) && (
              <a className="btn btn--secondary" href={rawProperty.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t('detail.viewSource')} ↗
              </a>
          )}
        </section>

        {rawProperty.notes && (
          <details className="detail__section detail__notes">
              <summary className="detail__section-title">{t('detail.additionalNotes')}</summary>
              <p className="detail__source-notes">{rawProperty.notes}</p>
          </details>
        )}

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
