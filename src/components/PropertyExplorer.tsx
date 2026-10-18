import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PropertyWithCalculations } from '../types/property';
import { AffordabilityInputs } from '../types/affordability';
import {
  PropertyFilters,
  SortOption,
  DEFAULT_FILTERS,
  filtersFromPreferences,
  filterPropertiesWithMeta,
  sortProperties,
  availableFacilities,
} from '../utils/propertyFilter';
import PropertyCard from './PropertyCard';
import './PropertyExplorer.css';

const PropertyMap = lazy(() => import('./PropertyMap'));

interface PropertyExplorerProps {
  /** Enriched records. Empty before a personalized calculation exists. */
  properties: PropertyWithCalculations[];
  /** Raw catalogue count, used for the "showing X of Y" line. */
  totalCount: number;
  preferences?: AffordabilityInputs | null;
  onViewDetails: (property: PropertyWithCalculations) => void;
  isSaved: (propertyId: string) => boolean;
  isCompared: (propertyId: string) => boolean;
  onToggleSaved: (propertyId: string) => void;
  onToggleCompared: (propertyId: string) => void;
  comparisonFull: boolean;
  /** False for guests who have not yet personalised the estimate. */
  hasPersonalisedEstimate: boolean;
  onGoToAffordability: () => void;
}

export default function PropertyExplorer({
  properties,
  totalCount,
  preferences,
  onViewDetails,
  isSaved,
  isCompared,
  onToggleSaved,
  onToggleCompared,
  comparisonFull,
  hasPersonalisedEstimate,
  onGoToAffordability,
}: PropertyExplorerProps) {
  const { t } = useTranslation();

  // Seed with the submitted preferences so location and bedrooms actually filter.
  const [filters, setFilters] = useState<PropertyFilters>(() =>
    filtersFromPreferences(preferences)
  );
  const [sortBy, setSortBy] = useState<SortOption>('match');
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      location: preferences
        ? preferences.preferredLocation?.trim() || ''
        : current.location,
      minBedrooms: preferences?.minBedrooms ? Math.floor(preferences.minBedrooms) : 0,
    }));
  }, [preferences?.preferredLocation, preferences?.minBedrooms]);

  // Dropdown options come from the full catalogue, not the filtered subset, so a
  // filter can never remove its own options.
  const locations = useMemo(
    () => ['All', ...Array.from(new Set(properties.map((p) => p.location))).sort()],
    [properties]
  );
  const propertyTypes = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(
          properties
            .map((property) => property.propertyType)
            .filter(
              (type): type is NonNullable<PropertyWithCalculations['propertyType']> =>
                typeof type === 'string'
            )
        )
      ).sort(),
    ],
    [properties]
  );
  const facilities = useMemo(() => availableFacilities(properties), [properties]);

  const { properties: matching, hiddenUnknownBedrooms } = filterPropertiesWithMeta(
    properties,
    filters
  );

  const filtered = sortProperties(matching, sortBy);

  const hasActiveFilters =
    filters.location !== DEFAULT_FILTERS.location ||
    filters.propertyType !== DEFAULT_FILTERS.propertyType ||
    filters.minBedrooms !== DEFAULT_FILTERS.minBedrooms ||
    filters.minBathrooms !== DEFAULT_FILTERS.minBathrooms ||
    filters.minBuiltUpSqft !== DEFAULT_FILTERS.minBuiltUpSqft ||
    filters.facilities.length > 0 ||
    filters.minPrice !== DEFAULT_FILTERS.minPrice ||
    filters.maxPrice !== DEFAULT_FILTERS.maxPrice ||
    filters.affordableOnly !== DEFAULT_FILTERS.affordableOnly;

  const change = (key: keyof PropertyFilters, value: string | number | boolean) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  return (
    <section className="explorer section section--alt" id="properties">
      <div className="container">
        <h2 className="section__title">{t('explorer.title')}</h2>
        <p className="section__subtitle">{t('explorer.subtitle')}</p>

        {!hasPersonalisedEstimate && properties.length > 0 && (
          <div className="explorer__prompt surface" role="status">
            <div>
              <p className="explorer__prompt-title">{t('explorer.promptTitle')}</p>
              <p className="explorer__prompt-text">{t('explorer.promptText')}</p>
            </div>
            <button type="button" className="btn btn--primary" onClick={onGoToAffordability}>
              {t('hero.primaryCta')}
            </button>
          </div>
        )}

        <div className="explorer__filters surface">
          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-sort">
              {t('explorer.sortBy')}
            </label>
            <select
              id="filter-sort"
              className="form-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
            >
              <option value="match">{t('explorer.sortMatch')}</option>
              <option value="price-asc">{t('explorer.sortPriceAsc')}</option>
              <option value="price-desc">{t('explorer.sortPriceDesc')}</option>
              <option value="mortgage-asc">{t('explorer.sortMortgageAsc')}</option>
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-location">
              {t('explorer.location')}
            </label>
            <input
              id="filter-location"
              className="form-input"
              list="filter-locations"
              placeholder={t('explorer.anyLocation')}
              value={filters.location}
              onChange={(event) => change('location', event.target.value)}
            />
            <datalist id="filter-locations">
              {locations.map((location) => (
                <option key={location} value={location === 'All' ? '' : location} />
              ))}
            </datalist>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-type">
              {t('explorer.propertyType')}
            </label>
            <select
              id="filter-type"
              className="form-select"
              value={filters.propertyType}
              onChange={(event) => change('propertyType', event.target.value)}
            >
              {propertyTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'All' ? t('common.all') : type}
                </option>
              ))}
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-bedrooms">
              {t('explorer.minBedrooms')}
            </label>
            <select
              id="filter-bedrooms"
              className="form-select"
              value={filters.minBedrooms}
              onChange={(event) => change('minBedrooms', parseInt(event.target.value, 10) || 0)}
            >
              <option value="0">{t('affordability.anyBedrooms')}</option>
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {t('affordability.bedroomsPlus', { count })}
                </option>
              ))}
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-bathrooms">
              {t('explorer.minBathrooms')}
            </label>
            <select
              id="filter-bathrooms"
              className="form-select"
              value={filters.minBathrooms}
              onChange={(event) => change('minBathrooms', parseInt(event.target.value, 10) || 0)}
            >
              <option value="0">{t('affordability.anyBedrooms')}</option>
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {t('explorer.bathroomsPlus', { count })}
                </option>
              ))}
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-builtup">
              {t('explorer.minBuiltUp')}
            </label>
            <input
              id="filter-builtup"
              type="number"
              className="form-input"
              placeholder={t('explorer.noLimit')}
              value={filters.minBuiltUpSqft || ''}
              onChange={(event) => change('minBuiltUpSqft', parseInt(event.target.value, 10) || 0)}
              min="0"
              step="100"
            />
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-minprice">
              {t('explorer.minPrice')}
            </label>
            <input
              id="filter-minprice"
              type="number"
              className="form-input"
              placeholder={t('explorer.noLimit')}
              value={filters.minPrice || ''}
              onChange={(event) => change('minPrice', parseInt(event.target.value, 10) || 0)}
              min="0"
              step="50000"
            />
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-maxprice">
              {t('explorer.maxPrice')}
            </label>
            <input
              id="filter-maxprice"
              type="number"
              className="form-input"
              placeholder={t('explorer.noLimit')}
              value={filters.maxPrice || ''}
              onChange={(event) => change('maxPrice', parseInt(event.target.value, 10) || 0)}
              min="0"
              step="50000"
            />
          </div>

          {facilities.length > 0 && (
            <fieldset className="explorer__facility-filter">
              <legend className="form-label">{t('explorer.facilities')}</legend>
              <div className="explorer__facility-list">
                {facilities.map((facility) => (
                  <label className="explorer__checkbox-label" key={facility}>
                    <input
                      type="checkbox"
                      checked={filters.facilities.includes(facility)}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          facilities: event.target.checked
                            ? [...current.facilities, facility]
                            : current.facilities.filter((item) => item !== facility),
                        }))
                      }
                    />
                    <span>{facility}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="explorer__filter explorer__filter--checkbox">
            <label className="explorer__checkbox-label">
              <input
                type="checkbox"
                checked={filters.affordableOnly}
                onChange={(event) => change('affordableOnly', event.target.checked)}
              />
              <span>{t('explorer.affordableOnly')}</span>
            </label>
          </div>
        </div>

        <p className="explorer__count">
          {t('explorer.showing', { shown: filtered.length, total: totalCount })}
        </p>

        <div className="explorer__view-toggle" role="group" aria-label={t('explorer.view')}>
          <button
            type="button"
            className={`btn btn--sm ${view === 'list' ? 'btn--primary' : 'btn--secondary'}`}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            {t('explorer.list')}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${view === 'map' ? 'btn--primary' : 'btn--secondary'}`}
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            {t('explorer.map')}
          </button>
        </div>

        {hasActiveFilters && (
          <div className="explorer__active-filters">
            <span className="explorer__active-filters-text">{t('explorer.filtersApplied')}</span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              {t('explorer.resetFilters')}
            </button>
          </div>
        )}

        {hiddenUnknownBedrooms > 0 && (
          <p className="explorer__note">
            {t('explorer.hiddenUnknownBedrooms', { count: hiddenUnknownBedrooms })}
          </p>
        )}

        {view === 'map' ? (
          <div className="explorer__map surface" role="region" aria-label={t('explorer.map')}>
            <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
              <PropertyMap properties={filtered} onViewDetails={onViewDetails} />
            </Suspense>
          </div>
        ) : filtered.length > 0 ? (
          <div className="explorer__grid">
            {filtered.map((property, index) => (
              <div
                key={property.id}
                className={`reveal is-visible reveal--d${(index % 4) + 1}`}
              >
                <PropertyCard
                  property={property}
                  onViewDetails={onViewDetails}
                  isSaved={isSaved(property.id)}
                  isCompared={isCompared(property.id)}
                  onToggleSaved={onToggleSaved}
                  onToggleCompared={onToggleCompared}
                  comparisonFull={comparisonFull}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">
              🏘️
            </div>
            <h3 className="empty-state__title">
              {filters.location !== DEFAULT_FILTERS.location
                ? t('explorer.emptyLocation', { location: filters.location })
                : t('explorer.emptyTitle')}
            </h3>
            <p className="empty-state__text">{t('explorer.emptyText')}</p>
            <button
              className="btn btn--secondary mt-lg"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              {t('explorer.resetFilters')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
