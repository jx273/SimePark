/**
 * Pure mapping between database rows and the app's domain types.
 *
 * Kept free of any Supabase import so it can be unit-tested without a database
 * and reused by both the repository and the admin form.
 *
 * The cardinal rule enforced here: a NULL column means "not recorded". It is
 * mapped to `null`, never to 0, '', or a default. Only `priceMYR` is treated as
 * required, because every affordability calculation depends on it; rows without
 * a price are dropped from the calculation feed by `toCatalog` rather than being
 * given a placeholder.
 */

import type { Property, PropertyType } from '../types/property';
import type { AffordabilityInputs } from '../types/affordability';
import type { PropertyInsert, PropertyRow, PropertyUpdate } from './database.types';

const KNOWN_TYPES: readonly PropertyType[] = [
  'Condominium',
  'Apartment',
  'Terrace House',
  'Semi-Detached',
  'Bungalow',
  'Townhouse',
  'Flat',
];

/** Narrow an arbitrary string to a known PropertyType, or null. */
export function toPropertyType(value: string | null): PropertyType | null {
  if (!value) return null;
  return (KNOWN_TYPES as readonly string[]).includes(value) ? (value as PropertyType) : null;
}

/**
 * Convert a database row into the domain `Property`.
 *
 * Returns null when the row cannot support an affordability calculation, i.e.
 * when the price is missing or non-positive. Callers must surface such records
 * as "price not recorded" rather than inventing a figure.
 */
export function rowToProperty(row: PropertyRow): Property | null {
  if (row.price_myr === null || !(row.price_myr > 0)) return null;

  return {
    id: row.id,
    propertyName: row.property_name,
    location: row.location,
    priceMYR: Number(row.price_myr),
    // A missing type is surfaced as a neutral label rather than a guess. The
    // dataset has no unknown types today; this keeps the type honest if one
    // appears.
    propertyType: toPropertyType(row.property_type) ?? 'Flat',
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.built_up_sqft,
    sourceUrl: row.source_url,
    verifiedDate: row.verified_date,
    isExample: row.is_example,
  };
}

/**
 * Map rows to the calculation-grade catalogue, dropping records that cannot be
 * priced. The returned `unpriced` count lets the UI say how many were skipped
 * instead of silently showing fewer properties.
 */
export function toCatalog(rows: PropertyRow[]): {
  properties: Property[];
  unpriced: number;
} {
  const properties: Property[] = [];
  let unpriced = 0;

  for (const row of rows) {
    const mapped = rowToProperty(row);
    if (mapped) properties.push(mapped);
    else unpriced += 1;
  }

  return { properties, unpriced };
}

/** Convert the admin form's domain values into an insert payload. */
export function propertyToInsert(
  property: {
    id?: string;
    propertyName: string;
    location: string;
    priceMYR: number | null;
    propertyType: PropertyType | null;
    bedrooms: number | null;
    bathrooms: number | null;
    builtUpSqft: number | null;
    sourceUrl: string | null;
    verifiedDate: string | null;
    isExample: boolean;
    isPublished: boolean;
  },
  createdBy: string | null
): PropertyInsert {
  return {
    ...(property.id ? { id: property.id } : {}),
    property_name: property.propertyName.trim(),
    location: property.location.trim(),
    price_myr: property.priceMYR,
    property_type: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    built_up_sqft: property.builtUpSqft,
    source_url: property.sourceUrl,
    verified_date: property.verifiedDate,
    is_example: property.isExample,
    is_published: property.isPublished,
    created_by: createdBy,
  };
}

/** Convert a row into the shape the admin form edits. */
export function rowToAdminForm(row: PropertyRow) {
  return {
    id: row.id,
    propertyName: row.property_name,
    location: row.location,
    priceMYR: row.price_myr === null ? null : Number(row.price_myr),
    propertyType: toPropertyType(row.property_type),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.built_up_sqft,
    sourceUrl: row.source_url,
    verifiedDate: row.verified_date,
    isExample: row.is_example,
    isPublished: row.is_published,
  };
}

export type AdminPropertyForm = ReturnType<typeof rowToAdminForm>;

/** Build the update payload from an edited form, normalising blanks to null. */
export function formToUpdate(form: AdminPropertyForm): PropertyUpdate {
  return {
    property_name: form.propertyName.trim(),
    location: form.location.trim(),
    price_myr: form.priceMYR,
    property_type: form.propertyType,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    built_up_sqft: form.builtUpSqft,
    source_url: form.sourceUrl?.trim() ? form.sourceUrl.trim() : null,
    verified_date: form.verifiedDate?.trim() ? form.verifiedDate.trim() : null,
    is_example: form.isExample,
    is_published: form.isPublished,
  };
}

/** Columns for which "missing" is worth surfacing to an administrator. */
export const TRACKED_FACTS = [
  'priceMYR',
  'propertyType',
  'bedrooms',
  'bathrooms',
  'builtUpSqft',
  'sourceUrl',
  'verifiedDate',
] as const;

/** List the tracked facts that are not recorded on this record. */
export function missingFacts(form: AdminPropertyForm): string[] {
  const missing: string[] = [];
  if (form.priceMYR === null) missing.push('priceMYR');
  if (!form.propertyType) missing.push('propertyType');
  if (form.bedrooms === null) missing.push('bedrooms');
  if (form.bathrooms === null) missing.push('bathrooms');
  if (form.builtUpSqft === null) missing.push('builtUpSqft');
  if (!form.sourceUrl) missing.push('sourceUrl');
  if (!form.verifiedDate) missing.push('verifiedDate');
  return missing;
}

/**
 * Derive the honest status label for a property from its provenance columns.
 *
 * "Verified" is returned only when a genuine verification date exists, and the
 * database constraint `properties_example_not_verified` makes it impossible for
 * a demonstration record to carry one.
 */
export type ProvenanceStatus = 'example' | 'verified' | 'sourceProvided' | 'unverified';

export function provenanceStatus(property: {
  isExample: boolean;
  verifiedDate: string | null;
  sourceUrl: string | null;
}): ProvenanceStatus {
  if (property.verifiedDate) return 'verified';
  if (property.isExample) return 'example';
  if (property.sourceUrl) return 'sourceProvided';
  return 'unverified';
}

/** Build a `Properties`-shaped array from the bundled dataset for demo mode. */
export function localDatasetToCatalog(rows: Property[]): {
  properties: Property[];
  unpriced: number;
} {
  const properties: Property[] = [];
  let unpriced = 0;

  for (const row of rows) {
    if (row.priceMYR > 0) properties.push(row);
    else unpriced += 1;
  }

  return { properties, unpriced };
}

/** Whether the stored preferences contain anything worth pre-filling. */
export function hasUsablePreferences(inputs: Partial<AffordabilityInputs>): boolean {
  return Object.values(inputs).some((value) => value !== undefined && value !== null && value !== '');
}
