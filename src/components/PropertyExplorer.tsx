import { useState } from 'react';
import { PropertyWithCalculations } from '../types/property';
import { AffordabilityInputs } from '../types/affordability';
import {
  PropertyFilters,
  SortOption,
  DEFAULT_FILTERS,
  filtersFromPreferences,
  filterPropertiesWithMeta,
  sortProperties,
} from '../utils/propertyFilter';
import PropertyCard from './PropertyCard';
import './PropertyExplorer.css';

interface PropertyExplorerProps {
  properties: PropertyWithCalculations[];
  /** Preferences submitted with the affordability form, used to seed filters */
  preferences?: AffordabilityInputs | null;
  onViewDetails: (property: PropertyWithCalculations) => void;
}

export default function PropertyExplorer({
  properties,
  preferences,
  onViewDetails,
}: PropertyExplorerProps) {
  // Seed with the preferences from the form so a chosen location and minimum
  // bedrooms actually filter the list, not just the match score.
  const [filters, setFilters] = useState<PropertyFilters>(() =>
    filtersFromPreferences(preferences)
  );
  const [sortBy, setSortBy] = useState<SortOption>('match');

  // Extract unique locations and property types for filter dropdowns
  const locations = ['All', ...Array.from(new Set(properties.map((p) => p.location))).sort()];
  const propertyTypes = ['All', ...Array.from(new Set(properties.map((p) => p.propertyType))).sort()];

  const { properties: matchingProperties, hiddenUnknownBedrooms } = filterPropertiesWithMeta(
    properties,
    filters
  );

  const filteredProperties = sortProperties(matchingProperties, sortBy);

  const hasActiveFilters =
    filters.location !== DEFAULT_FILTERS.location ||
    filters.propertyType !== DEFAULT_FILTERS.propertyType ||
    filters.minBedrooms !== DEFAULT_FILTERS.minBedrooms ||
    filters.maxPrice !== DEFAULT_FILTERS.maxPrice ||
    filters.affordableOnly !== DEFAULT_FILTERS.affordableOnly;

  const handleFilterChange = (key: keyof PropertyFilters, value: string | number | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="explorer section section--alt" id="properties">
      <div className="container">
        <h2 className="section__title">Explore Properties</h2>
        <p className="section__subtitle">
          Properties are filtered by the location and bedrooms you selected, and ranked by how
          well they match your estimated budget.
        </p>

        {/* Filters */}
        <div className="explorer__filters">
          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-sort">Sort By</label>
            <select
              id="filter-sort"
              className="form-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="match">Best Match</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="mortgage-asc">Monthly Payment: Low to High</option>
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-location">Location</label>
            <select
              id="filter-location"
              className="form-select"
              value={filters.location}
              onChange={(e) => handleFilterChange('location', e.target.value)}
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-type">Property Type</label>
            <select
              id="filter-type"
              className="form-select"
              value={filters.propertyType}
              onChange={(e) => handleFilterChange('propertyType', e.target.value)}
            >
              {propertyTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-bedrooms">Min Bedrooms</label>
            <select
              id="filter-bedrooms"
              className="form-select"
              value={filters.minBedrooms}
              onChange={(e) => handleFilterChange('minBedrooms', parseInt(e.target.value) || 0)}
            >
              <option value="0">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </div>

          <div className="explorer__filter">
            <label className="form-label" htmlFor="filter-maxprice">Max Price (RM)</label>
            <input
              id="filter-maxprice"
              type="number"
              className="form-input"
              placeholder="No limit"
              value={filters.maxPrice || ''}
              onChange={(e) => handleFilterChange('maxPrice', parseInt(e.target.value) || 0)}
              min="0"
              step="50000"
            />
          </div>

          <div className="explorer__filter explorer__filter--checkbox">
            <label className="explorer__checkbox-label">
              <input
                type="checkbox"
                checked={filters.affordableOnly}
                onChange={(e) => handleFilterChange('affordableOnly', e.target.checked)}
              />
              <span>Affordable only</span>
            </label>
          </div>
        </div>

        {/* Results count */}
        <p className="explorer__count">
          Showing {filteredProperties.length} of {properties.length} properties
        </p>

        {hasActiveFilters && (
          <div className="explorer__active-filters">
            <span className="explorer__active-filters-text">
              Filters applied from your preferences
              {filters.location !== DEFAULT_FILTERS.location && ` · ${filters.location}`}
              {filters.minBedrooms > 0 && ` · ${filters.minBedrooms}+ bedrooms`}
            </span>
            <button
              className="btn btn--secondary"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Reset Filters
            </button>
          </div>
        )}

        {hiddenUnknownBedrooms > 0 && (
          <p className="explorer__note">
            {hiddenUnknownBedrooms} propert{hiddenUnknownBedrooms === 1 ? 'y was' : 'ies were'}{' '}
            hidden because the bedroom count is unknown and your minimum-bedroom filter is
            active. Clear the bedroom filter to see them.
          </p>
        )}

        {/* Property grid */}
        {filteredProperties.length > 0 ? (
          <div className="explorer__grid">
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon">🏘️</div>
            <h3 className="empty-state__title">No properties match your criteria</h3>
            <p className="empty-state__text">
              Try adjusting your budget, location, or filter preferences to see more options.
            </p>
            <button
              className="btn btn--secondary mt-lg"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
