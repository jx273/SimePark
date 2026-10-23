import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  getLocalizedPropertyType,
  toCanonicalPropertyType,
} from '../utils/propertyFilter';
import PropertyCard from './PropertyCard';
import './PropertyExplorer.css';

const PropertyMap = lazy(() => import('./PropertyMap'));

const GRID_ROWS = 3;

export function getResponsiveColumns(
  width = typeof window !== 'undefined' ? window.innerWidth : 1024
): number {
  if (width < 640) return 1;
  if (width < 1024) return 2;
  return 3;
}

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

const EXPLORER_STATE_KEY = 'simepark_explorer_state';

function loadSavedExplorerState(): {
  filters?: PropertyFilters;
  sortBy?: SortOption;
  view?: 'list' | 'map';
  page?: number;
} | null {
  try {
    const raw = sessionStorage.getItem(EXPLORER_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
  const { t, i18n } = useTranslation();
  const savedState = useMemo(() => loadSavedExplorerState(), []);

  // Seed with saved state if available, otherwise submitted preferences
  const [filters, setFilters] = useState<PropertyFilters>(() =>
    savedState?.filters ?? filtersFromPreferences(preferences)
  );
  const [sortBy, setSortBy] = useState<SortOption>(() => savedState?.sortBy ?? 'match');
  const [view, setView] = useState<'list' | 'map'>(() => savedState?.view ?? 'list');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [page, setPage] = useState<number>(() => savedState?.page ?? 1);
  const [columns, setColumns] = useState<number>(getResponsiveColumns);
  const pageSize = columns * GRID_ROWS;
  const facilityDetailsRef = useRef<HTMLDetailsElement>(null);
  const paginationRef = useRef<HTMLElement>(null);
  const paginationAnchorRef = useRef<{ prevTop: number } | null>(null);
  const isFirstMount = useRef(true);

  // Adapt columns to screen size changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const nextCols = getResponsiveColumns();
      setColumns((current) => (current !== nextCols ? nextCols : current));
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist explorer state so returning from details restores position
  useEffect(() => {
    try {
      sessionStorage.setItem(
        EXPLORER_STATE_KEY,
        JSON.stringify({ filters, sortBy, view, page })
      );
    } catch {
      // safe fallback
    }
  }, [filters, sortBy, view, page]);

  const handleViewDetails = (property: PropertyWithCalculations) => {
    try {
      sessionStorage.setItem('simepark_explorer_scroll_y', window.scrollY.toString());
    } catch {
      // safe fallback
    }
    onViewDetails(property);
  };

  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem('simepark_explorer_scroll_y', window.scrollY.toString());
      } catch {
        // safe fallback
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        facilityDetailsRef.current &&
        facilityDetailsRef.current.open &&
        !facilityDetailsRef.current.contains(event.target as Node)
      ) {
        facilityDetailsRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!preferences) return;
    setFilters((current) => ({
      ...current,
      location: preferences.preferredLocation?.trim() || '',
      minBedrooms: preferences.minBedrooms ? Math.floor(preferences.minBedrooms) : 0,
    }));
  }, [preferences?.preferredLocation, preferences?.minBedrooms]);

  // Dropdown options come from the full catalogue, mapping each type to its stable canonical category
  const locations = useMemo(
    () => ['All', ...Array.from(new Set(properties.map((p) => p.location))).sort()],
    [properties]
  );
  const propertyTypes = useMemo(() => {
    const canonicalSet = new Set<string>();
    for (const property of properties) {
      const canonical = toCanonicalPropertyType(property.propertyType);
      if (canonical) canonicalSet.add(canonical);
    }
    return ['All', ...Array.from(canonicalSet).sort()];
  }, [properties]);
  const facilities = useMemo(() => availableFacilities(properties), [properties]);

  const { properties: matching, hiddenUnknownBedrooms } = filterPropertiesWithMeta(
    properties,
    filters
  );

  const filtered = sortProperties(matching, sortBy);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleProperties = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handlePageChange = (newPage: number) => {
    if (paginationRef.current) {
      paginationAnchorRef.current = {
        prevTop: paginationRef.current.getBoundingClientRect().top,
      };
    }
    setPage(newPage);
  };

  useLayoutEffect(() => {
    if (!paginationAnchorRef.current || !paginationRef.current) return;
    const { prevTop } = paginationAnchorRef.current;
    paginationAnchorRef.current = null;

    const currentTop = paginationRef.current.getBoundingClientRect().top;
    const delta = currentTop - prevTop;
    if (
      Math.abs(delta) > 1 &&
      typeof window !== 'undefined' &&
      typeof window.scrollBy === 'function'
    ) {
      window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
    }
  }, [page]);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setPage(1);
  }, [filters, sortBy]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const hasActiveFilters =
    filters.search !== DEFAULT_FILTERS.search ||
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

        <button
          type="button"
          className="btn btn--secondary explorer__filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="property-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? t('explorer.hideFilters') : t('explorer.showFilters')}
        </button>

        {filtersOpen && <div className="explorer__filters surface" id="property-filters">
          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-search">
              {t('explorer.search')}
            </label>
            <input
              id="filter-search"
              className="form-input"
              type="search"
              value={filters.search}
              onChange={(event) => change('search', event.target.value)}
            />
          </div>

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
              value={toCanonicalPropertyType(filters.propertyType) || filters.propertyType}
              onChange={(event) => change('propertyType', event.target.value)}
            >
              {propertyTypes.map((canonical) => (
                <option key={canonical} value={canonical}>
                  {canonical === 'All'
                    ? t('common.all')
                    : getLocalizedPropertyType(canonical, i18n.language)}
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
            <details
              ref={facilityDetailsRef}
              className="explorer__facility-filter"
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.currentTarget.open = false;
              }}
            >
              <summary className="explorer__facility-trigger">
                <span className="explorer__facility-trigger-text">
                  <strong>{t('explorer.facilities')}</strong>
                  <span className="explorer__facility-trigger-count">
                    {filters.facilities.length > 0
                      ? t('explorer.countSelected', { count: filters.facilities.length })
                      : t('explorer.selectAllAndApply')}
                  </span>
                </span>
                <span className="explorer__facility-chevron" aria-hidden="true">▾</span>
              </summary>
              <div className="explorer__facility-panel">
                <div className="explorer__facility-toolbar">
                  <div className="explorer__facility-toolbar-actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setFilters((current) => ({ ...current, facilities: [...facilities] }))}
                    >
                      ✓ {t('explorer.selectAll')}
                    </button>
                    {filters.facilities.length > 0 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setFilters((current) => ({ ...current, facilities: [] }))}
                      >
                        ✕ {t('explorer.clearFacilities')}
                      </button>
                    )}
                  </div>
                  <span className="explorer__facility-count-badge">
                    {t('explorer.selectedOfTotal', {
                      selected: filters.facilities.length,
                      total: facilities.length,
                    })}
                  </span>
                </div>
                <div className="explorer__facility-list" role="group" aria-label={t('explorer.facilities')}>
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
                <div className="explorer__facility-footer">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      if (facilityDetailsRef.current) {
                        facilityDetailsRef.current.open = false;
                      }
                    }}
                  >
                    {t('explorer.apply')}
                  </button>
                </div>
              </div>
            </details>
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
        </div>}

        <p className="explorer__count" aria-live="polite">
          {t('explorer.showing', { shown: filtered.length, total: totalCount })}
          {' · '}{t('explorer.matchCount', { count: filtered.length })}
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
              <PropertyMap properties={filtered} onViewDetails={handleViewDetails} />
            </Suspense>
          </div>
        ) : filtered.length > 0 ? (
          <div className="explorer__grid">
            {visibleProperties.map((property, index) => (
              <div
                key={property.id}
                className={`reveal is-visible reveal--d${(index % 4) + 1}`}
              >
                <PropertyCard
                  property={property}
                  onViewDetails={handleViewDetails}
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

        {view === 'list' && filtered.length > 0 && pageCount > 1 && (
          <nav
            ref={paginationRef}
            className="explorer__pagination"
            aria-label={t('explorer.pagination')}
          >
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={page === 1}
              onClick={() => handlePageChange(Math.max(1, page - 1))}
            >
              {t('explorer.previous')}
            </button>
            <span aria-live="polite">
              {t('explorer.pageOf', { page, pages: pageCount })}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={page === pageCount}
              onClick={() => handlePageChange(Math.min(pageCount, page + 1))}
            >
              {t('explorer.next')}
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
