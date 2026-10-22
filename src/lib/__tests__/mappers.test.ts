import { describe, it, expect } from 'vitest';
import {
  formToUpdate,
  hasUsablePreferences,
  localDatasetToCatalog,
  missingFacts,
  provenanceStatus,
  propertyToInsert,
  rowToAdminForm,
  rowToProperty,
  toCatalog,
  toPropertyType,
} from '../mappers';
import type { PropertyRow } from '../database.types';

function row(overrides: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: 'demo-001',
    property_name: 'Residenzi Test',
    location: 'Cheras, Kuala Lumpur',
    address: null,
    price_myr: 320000,
    price_min_myr: null,
    price_max_myr: null,
    price_basis: null,
    property_type: 'Apartment',
    bedrooms: 3,
    bathrooms: 2,
    built_up_sqft: 850,
    land_area: null,
    land_area_unit: null,
    monthly_maintenance_myr: null,
    sinking_fund_myr: null,
    tenure: null,
    completion_date: null,
    parking_bays: null,
    furnishing_status: null,
    availability_status: 'unknown',
    availability_checked_date: null,
    latitude: null,
    longitude: null,
    location_precision: 'unknown',
    nearest_transit: null,
    transit_distance_km: null,
    transit_travel_time_min: null,
    transit_mode: null,
    nearby_amenity: null,
    amenity_distance_km: null,
    facilities: [],
    source_url: null,
    source_type: null,
    source_name: null,
    verified_date: null,
    date_accessed: null,
    confirmed_by_role: null,
    confidence_status: null,
    image_permission: null,
    notes: null,
    is_example: true,
    is_published: true,
    created_by: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('rowToProperty', () => {
  it('maps a complete row', () => {
    const property = rowToProperty(row());

    expect(property).not.toBeNull();
    expect(property!.id).toBe('demo-001');
    expect(property!.priceMYR).toBe(320000);
    expect(property!.bedrooms).toBe(3);
    expect(property!.verifiedDate).toBeNull();
    expect(property!.isExample).toBe(true);
  });

  it('preserves a property without a price for browsing', () => {
    expect(rowToProperty(row({ price_myr: null }))?.priceMYR).toBeNull();
  });

  it('returns null when the price is zero or negative', () => {
    expect(rowToProperty(row({ price_myr: 0 }))).toBeNull();
    expect(rowToProperty(row({ price_myr: -500 }))).toBeNull();
  });

  // NULL must reach the UI as NULL so it can render "Not recorded".
  it('preserves unknown facts as null instead of inventing values', () => {
    const property = rowToProperty(
      row({ bedrooms: null, bathrooms: null, built_up_sqft: null, property_type: null })
    );

    expect(property!.bedrooms).toBeNull();
    expect(property!.bathrooms).toBeNull();
    expect(property!.builtUpSqft).toBeNull();
  });

  it('keeps a real verification date and a real source url', () => {
    const property = rowToProperty(
      row({
        is_example: false,
        verified_date: '2025-03-14',
        source_url: 'https://example.com/listing/1',
      })
    );

    expect(property!.verifiedDate).toBe('2025-03-14');
    expect(property!.sourceUrl).toBe('https://example.com/listing/1');
    expect(property!.isExample).toBe(false);
  });
});

describe('toCatalog', () => {
  it('separates unpriced rows from usable ones and counts them', () => {
    const result = toCatalog([
      row({ id: 'a', price_myr: 300000 }),
      row({ id: 'b', price_myr: null }),
      row({ id: 'c', price_myr: 500000 }),
    ]);

    expect(result.properties.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(result.unpriced).toBe(1);
  });

  it('returns an empty catalogue for no rows', () => {
    expect(toCatalog([])).toEqual({ properties: [], unpriced: 0 });
  });
});

describe('toPropertyType', () => {
  it('accepts known types', () => {
    expect(toPropertyType('Condominium')).toBe('Condominium');
    expect(toPropertyType('Terrace House')).toBe('Terrace House');
  });

  it('returns null for unknown or missing types rather than guessing', () => {
    expect(toPropertyType(null)).toBeNull();
    expect(toPropertyType('')).toBeNull();
    expect(toPropertyType('Castle')).toBeNull();
  });
});

describe('provenanceStatus', () => {
  it('reports verified only when a genuine verification date exists', () => {
    expect(
      provenanceStatus({ isExample: false, verifiedDate: '2025-01-01', sourceUrl: null })
    ).toBe('verified');
  });

  it('reports example records as examples', () => {
    expect(
      provenanceStatus({ isExample: true, verifiedDate: null, sourceUrl: null })
    ).toBe('example');
  });

  it('distinguishes a sourced but unverified record', () => {
    expect(
      provenanceStatus({
        isExample: false,
        verifiedDate: null,
        sourceUrl: 'https://example.com',
      })
    ).toBe('sourceProvided');
  });

  it('reports an unverified record with no source as unverified', () => {
    expect(
      provenanceStatus({ isExample: false, verifiedDate: null, sourceUrl: null })
    ).toBe('unverified');
  });

  // A demo record with a verification date should be impossible (the database
  // constrains it), but if it happened the honest label is still "verified".
  it('prefers a verification date over the example flag', () => {
    expect(
      provenanceStatus({ isExample: true, verifiedDate: '2025-01-01', sourceUrl: null })
    ).toBe('verified');
  });
});

describe('admin form mapping', () => {
  it('round-trips a row through the form', () => {
    const form = rowToAdminForm(row());
    const update = formToUpdate(form);

    expect(update.property_name).toBe('Residenzi Test');
    expect(update.price_myr).toBe(320000);
    expect(update.is_published).toBe(true);
  });

  it('normalises blank optional fields to null rather than empty strings', () => {
    const form = rowToAdminForm(row());
    const update = formToUpdate({ ...form, sourceUrl: '   ', verifiedDate: '  ' });

    expect(update.source_url).toBeNull();
    expect(update.verified_date).toBeNull();
  });

  it('trims text fields', () => {
    const form = rowToAdminForm(row());
    const update = formToUpdate({ ...form, propertyName: '  Spaced  ', location: '  KL  ' });

    expect(update.property_name).toBe('Spaced');
    expect(update.location).toBe('KL');
  });

  it('reports missing facts so an administrator can see gaps', () => {
    const full = rowToAdminForm(row());
    expect(missingFacts(full)).toEqual(['sourceUrl', 'verifiedDate']);

    const sparse = rowToAdminForm(
      row({ price_myr: null, property_type: null, bedrooms: null, bathrooms: null, built_up_sqft: null })
    );
    expect(missingFacts(sparse)).toEqual([
      'priceMYR',
      'propertyType',
      'bedrooms',
      'bathrooms',
      'builtUpSqft',
      'sourceUrl',
      'verifiedDate',
    ]);
  });

  it('builds an insert payload that keeps nulls as null', () => {
    const form = rowToAdminForm(row({ bedrooms: null }));
    const insert = propertyToInsert(form, 'user-1');

    expect(insert.bedrooms).toBeNull();
    expect(insert.created_by).toBe('user-1');
    expect(insert.is_example).toBe(true);
  });

  it('enforces properties_example_not_verified constraint by setting is_example to false when verified_date is present', () => {
    const form = rowToAdminForm(row({ verified_date: '2026-10-21', is_example: true }));
    const insert = propertyToInsert(form, 'user-1');
    expect(insert.verified_date).toBe('2026-10-21');
    expect(insert.is_example).toBe(false);

    const update = formToUpdate(form);
    expect(update.verified_date).toBe('2026-10-21');
    expect(update.is_example).toBe(false);
  });

  it('round-trips the source metadata and uncertainty fields', () => {
    const form = rowToAdminForm(
      row({
        address: 'Project address',
        price_min_myr: 410000,
        price_max_myr: 520000,
        price_basis: 'asking range',
        land_area: 900,
        land_area_unit: 'sqft',
        monthly_maintenance_myr: 280,
        sinking_fund_myr: 25,
        tenure: 'Leasehold',
        completion_date: '2022',
        parking_bays: 2,
        furnishing_status: 'Partially furnished',
        availability_status: 'unknown',
        location_precision: 'approximate',
        latitude: 3.1,
        longitude: 101.6,
        nearest_transit: 'Example station',
        transit_distance_km: 1.2,
        transit_travel_time_min: 16,
        transit_mode: null,
        nearby_amenity: 'School',
        amenity_distance_km: null,
        facilities: ['Gym', 'Pool'],
        source_type: 'listing portal',
        source_name: 'Source name',
        date_accessed: '2025-01-01',
        confidence_status: 'indicative',
        image_permission: 'unknown',
        notes: 'Source conflict retained',
      })
    );
    const update = formToUpdate(form);

    expect(update).toMatchObject({
      address: 'Project address',
      price_min_myr: 410000,
      price_max_myr: 520000,
      land_area: 900,
      monthly_maintenance_myr: 280,
      parking_bays: 2,
      location_precision: 'approximate',
      latitude: 3.1,
      longitude: 101.6,
      transit_mode: null,
      facilities: ['Gym', 'Pool'],
      confidence_status: 'indicative',
      image_permission: 'unknown',
      notes: 'Source conflict retained',
    });
  });
});

describe('localDatasetToCatalog', () => {
  it('keeps records without a price and counts them', () => {
    const result = localDatasetToCatalog([
      {
        id: 'a',
        propertyName: 'A',
        location: 'KL',
        priceMYR: 100,
        propertyType: 'Flat',
        bedrooms: 1,
        bathrooms: 1,
        builtUpSqft: 500,
        sourceUrl: null,
        verifiedDate: null,
        isExample: true,
      },
      {
        id: 'b',
        propertyName: 'B',
        location: 'KL',
        priceMYR: 0,
        propertyType: 'Flat',
        bedrooms: 1,
        bathrooms: 1,
        builtUpSqft: 500,
        sourceUrl: null,
        verifiedDate: null,
        isExample: true,
      },
    ]);

    expect(result.properties).toHaveLength(2);
    expect(result.unpriced).toBe(1);
  });
});

describe('hasUsablePreferences', () => {
  it('is false for an empty object', () => {
    expect(hasUsablePreferences({})).toBe(false);
  });

  it('is true when any value is present', () => {
    expect(hasUsablePreferences({ monthlyIncome: 0 })).toBe(true);
    expect(hasUsablePreferences({ preferredLocation: 'KL' })).toBe(true);
  });

  it('ignores undefined and null entries', () => {
    expect(hasUsablePreferences({ monthlyIncome: undefined, preferredLocation: undefined })).toBe(false);
  });
});
