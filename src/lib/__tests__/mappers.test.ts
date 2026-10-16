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
    price_myr: 320000,
    property_type: 'Apartment',
    bedrooms: 3,
    bathrooms: 2,
    built_up_sqft: 850,
    source_url: null,
    verified_date: null,
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

  // An unpriced record cannot support any affordability maths, so it is excluded
  // rather than being given a placeholder price.
  it('returns null when the price is missing', () => {
    expect(rowToProperty(row({ price_myr: null }))).toBeNull();
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

    expect(result.properties.map((p) => p.id)).toEqual(['a', 'c']);
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
});

describe('localDatasetToCatalog', () => {
  it('drops records without a usable price and counts them', () => {
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

    expect(result.properties).toHaveLength(1);
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
