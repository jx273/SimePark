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
import { parseAmenities, parseFacilities } from './propertyAdapter';
import type {
  PropertyInsert,
  PropertyMediaRow,
  PropertyRow,
  PropertyUpdate,
} from './database.types';

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
  if (row.price_myr !== null && !(row.price_myr > 0)) return null;

  return {
    id: row.id,
    propertyName: row.property_name,
    location: row.location,
    address: row.address,
    priceMYR: row.price_myr === null ? null : Number(row.price_myr),
    priceMinMYR: row.price_min_myr === null ? null : Number(row.price_min_myr),
    priceMaxMYR: row.price_max_myr === null ? null : Number(row.price_max_myr),
    priceBasis: row.price_basis,
    propertyType: toPropertyType(row.property_type),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.built_up_sqft,
    landArea: row.land_area === null ? null : Number(row.land_area),
    landAreaUnit: row.land_area_unit,
    monthlyMaintenanceMYR:
      row.monthly_maintenance_myr === null ? null : Number(row.monthly_maintenance_myr),
    sinkingFundMYR: row.sinking_fund_myr === null ? null : Number(row.sinking_fund_myr),
    tenure: row.tenure,
    completionDate: row.completion_date,
    parkingBays: row.parking_bays,
    furnishingStatus: row.furnishing_status,
    availabilityStatus: row.availability_status,
    availabilityCheckedDate: row.availability_checked_date,
    latitude: row.latitude,
    longitude: row.longitude,
    locationPrecision:
      row.location_precision === 'verified' || row.location_precision === 'approximate'
        ? row.location_precision
        : 'unknown',
    nearestTransit: row.nearest_transit,
    transitDistanceKm:
      row.transit_distance_km === null ? null : Number(row.transit_distance_km),
    transitTravelTimeMin: row.transit_travel_time_min,
    transitMode: row.transit_mode,
    nearbyAmenity: row.nearby_amenity,
    amenityDistanceKm:
      row.amenity_distance_km === null ? null : Number(row.amenity_distance_km),
    amenities: parseAmenities(row.nearby_amenity),
    facilities: Array.isArray(row.facilities) ? row.facilities : parseFacilities(null),
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    sourceName: row.source_name,
    verifiedDate: row.verified_date,
    dateAccessed: row.date_accessed,
    confirmedByRole: row.confirmed_by_role,
    confidenceStatus: row.confidence_status,
    imagePermission: row.image_permission,
    notes: row.notes,
    isPublished: row.is_published,
    isExample: row.is_example,
    media: [],
  };
}

/** Convert a database media row without inferring permission or image content. */
export function rowToPropertyMedia(row: PropertyMediaRow) {
  return {
    id: row.id,
    propertyId: row.property_id,
    url: row.watermarked_url ?? row.url,
    kind: row.kind === 'floorplan' ? 'floorplan' as const : row.kind === 'video' ? 'video' as const : 'photo' as const,
    sourceKind: row.source_kind,
    externalUrl: row.external_url,
    sourceUrl: row.source_url,
    storagePath: row.storage_path,
    visibility: row.visibility,
    caption: row.caption,
    altText: row.alt_text,
    isCover: row.is_cover,
    sortOrder: row.sort_order,
    attribution: row.attribution,
    permissionStatus: row.permission_status,
    watermarkStatus: row.watermark_status,
    adminNotes: row.admin_notes,
    watermarkedUrl: row.watermarked_url,
    originalUrl: row.original_url,
  };
}

/**
 * Map every usable row into the catalogue. Unpriced properties remain browsable
 * but are counted so the UI can explain why they have no affordability estimate.
 */
export function toCatalog(rows: PropertyRow[]): {
  properties: Property[];
  unpriced: number;
} {
  const properties: Property[] = [];
  let unpriced = 0;

  for (const row of rows) {
    const mapped = rowToProperty(row);
    if (mapped) {
      properties.push(mapped);
      if (mapped.priceMYR === null) unpriced += 1;
    } else unpriced += 1;
  }

  return { properties, unpriced };
}

/** Convert the admin form's domain values into an insert payload. */
export function propertyToRow(property: Property): PropertyRow {
  return {
    id: property.id,
    property_name: property.propertyName,
    location: property.location,
    address: property.address ?? null,
    price_myr: property.priceMYR,
    price_min_myr: property.priceMinMYR ?? null,
    price_max_myr: property.priceMaxMYR ?? null,
    price_basis: property.priceBasis ?? null,
    property_type: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    built_up_sqft: property.builtUpSqft,
    land_area: property.landArea ?? null,
    land_area_unit: property.landAreaUnit ?? null,
    monthly_maintenance_myr: property.monthlyMaintenanceMYR ?? null,
    sinking_fund_myr: property.sinkingFundMYR ?? null,
    tenure: property.tenure ?? null,
    completion_date: property.completionDate ?? null,
    parking_bays: property.parkingBays ?? null,
    furnishing_status: property.furnishingStatus ?? null,
    availability_status: property.availabilityStatus ?? 'Available',
    availability_checked_date: property.availabilityCheckedDate ?? null,
    latitude: property.latitude ?? null,
    longitude: property.longitude ?? null,
    location_precision: property.locationPrecision ?? 'verified',
    nearest_transit: property.nearestTransit ?? null,
    transit_distance_km: property.transitDistanceKm ?? null,
    transit_travel_time_min: property.transitTravelTimeMin ?? null,
    transit_mode: property.transitMode ?? null,
    nearby_amenity: property.nearbyAmenity ?? null,
    amenity_distance_km: property.amenityDistanceKm ?? null,
    facilities: property.facilities ?? [],
    source_url: property.sourceUrl ?? null,
    source_type: property.sourceType ?? null,
    source_name: property.sourceName ?? null,
    verified_date: property.verifiedDate ?? null,
    date_accessed: property.dateAccessed ?? null,
    confirmed_by_role: property.confirmedByRole ?? null,
    confidence_status: property.confidenceStatus ?? null,
    image_permission: property.imagePermission ?? null,
    notes: property.notes ?? null,
    is_example: property.isExample ?? false,
    is_published: property.isPublished ?? true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Convert the admin form's domain values into an insert payload. */
export function propertyToInsert(
  property: AdminPropertyForm,
  createdBy: string | null
): PropertyInsert {
  return {
    ...(property.id ? { id: property.id } : {}),
    property_name: property.propertyName.trim(),
    location: property.location.trim(),
    address: nullableText(property.address),
    price_myr: property.priceMYR,
    price_min_myr: property.priceMinMYR,
    price_max_myr: property.priceMaxMYR,
    price_basis: nullableText(property.priceBasis),
    property_type: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    built_up_sqft: property.builtUpSqft,
    land_area: property.landArea,
    land_area_unit: nullableText(property.landAreaUnit),
    monthly_maintenance_myr: property.monthlyMaintenanceMYR,
    sinking_fund_myr: property.sinkingFundMYR,
    tenure: nullableText(property.tenure),
    completion_date: nullableText(property.completionDate),
    parking_bays: property.parkingBays,
    furnishing_status: nullableText(property.furnishingStatus),
    availability_status: property.availabilityStatus,
    availability_checked_date: nullableText(property.availabilityCheckedDate),
    latitude: property.latitude,
    longitude: property.longitude,
    location_precision: property.locationPrecision,
    nearest_transit: nullableText(property.nearestTransit),
    transit_distance_km: property.transitDistanceKm,
    transit_travel_time_min: property.transitTravelTimeMin,
    transit_mode: nullableText(property.transitMode),
    nearby_amenity: nullableText(property.nearbyAmenity),
    amenity_distance_km: property.amenityDistanceKm,
    facilities: property.facilities,
    source_url: property.sourceUrl,
    source_type: nullableText(property.sourceType),
    source_name: nullableText(property.sourceName),
    verified_date: property.verifiedDate,
    date_accessed: nullableText(property.dateAccessed),
    confirmed_by_role: nullableText(property.confirmedByRole),
    confidence_status: nullableText(property.confidenceStatus),
    image_permission: nullableText(property.imagePermission),
    notes: nullableText(property.notes),
    is_example: property.verifiedDate ? false : Boolean(property.isExample),
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
    address: row.address,
    priceMYR: row.price_myr === null ? null : Number(row.price_myr),
    priceMinMYR: row.price_min_myr === null ? null : Number(row.price_min_myr),
    priceMaxMYR: row.price_max_myr === null ? null : Number(row.price_max_myr),
    priceBasis: row.price_basis,
    propertyType: toPropertyType(row.property_type),
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.built_up_sqft,
    landArea: row.land_area === null ? null : Number(row.land_area),
    landAreaUnit: row.land_area_unit,
    monthlyMaintenanceMYR:
      row.monthly_maintenance_myr === null ? null : Number(row.monthly_maintenance_myr),
    sinkingFundMYR: row.sinking_fund_myr === null ? null : Number(row.sinking_fund_myr),
    tenure: row.tenure,
    completionDate: row.completion_date,
    parkingBays: row.parking_bays,
    furnishingStatus: row.furnishing_status,
    availabilityStatus: row.availability_status,
    availabilityCheckedDate: row.availability_checked_date,
    latitude: row.latitude,
    longitude: row.longitude,
    locationPrecision:
      row.location_precision === 'verified' || row.location_precision === 'approximate'
        ? row.location_precision
        : 'unknown',
    nearestTransit: row.nearest_transit,
    transitDistanceKm:
      row.transit_distance_km === null ? null : Number(row.transit_distance_km),
    transitTravelTimeMin: row.transit_travel_time_min,
    transitMode: row.transit_mode,
    nearbyAmenity: row.nearby_amenity,
    amenityDistanceKm:
      row.amenity_distance_km === null ? null : Number(row.amenity_distance_km),
    facilities: Array.isArray(row.facilities) ? row.facilities : [],
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    sourceName: row.source_name,
    verifiedDate: row.verified_date,
    dateAccessed: row.date_accessed,
    confirmedByRole: row.confirmed_by_role,
    confidenceStatus: row.confidence_status,
    imagePermission: row.image_permission,
    notes: row.notes,
    isExample: row.is_example,
    isPublished: row.is_published,
  };
}

export type AdminPropertyForm = ReturnType<typeof rowToAdminForm>;

function nullableText(value: string | null): string | null {
  return value?.trim() || null;
}

/** Build the update payload from an edited form, normalising blanks to null. */
export function formToUpdate(form: AdminPropertyForm): PropertyUpdate {
  return {
    property_name: form.propertyName.trim(),
    location: form.location.trim(),
    address: nullableText(form.address),
    price_myr: form.priceMYR,
    price_min_myr: form.priceMinMYR,
    price_max_myr: form.priceMaxMYR,
    price_basis: nullableText(form.priceBasis),
    property_type: form.propertyType,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    built_up_sqft: form.builtUpSqft,
    land_area: form.landArea,
    land_area_unit: nullableText(form.landAreaUnit),
    monthly_maintenance_myr: form.monthlyMaintenanceMYR,
    sinking_fund_myr: form.sinkingFundMYR,
    tenure: nullableText(form.tenure),
    completion_date: nullableText(form.completionDate),
    parking_bays: form.parkingBays,
    furnishing_status: nullableText(form.furnishingStatus),
    availability_status: form.availabilityStatus,
    availability_checked_date: nullableText(form.availabilityCheckedDate),
    latitude: form.latitude,
    longitude: form.longitude,
    location_precision: form.locationPrecision,
    nearest_transit: nullableText(form.nearestTransit),
    transit_distance_km: form.transitDistanceKm,
    transit_travel_time_min: form.transitTravelTimeMin,
    transit_mode: nullableText(form.transitMode),
    nearby_amenity: nullableText(form.nearbyAmenity),
    amenity_distance_km: form.amenityDistanceKm,
    facilities: form.facilities,
    source_url: form.sourceUrl?.trim() ? form.sourceUrl.trim() : null,
    source_type: nullableText(form.sourceType),
    source_name: nullableText(form.sourceName),
    verified_date: form.verifiedDate?.trim() ? form.verifiedDate.trim() : null,
    date_accessed: nullableText(form.dateAccessed),
    confirmed_by_role: nullableText(form.confirmedByRole),
    confidence_status: nullableText(form.confidenceStatus),
    image_permission: nullableText(form.imagePermission),
    notes: nullableText(form.notes),
    is_example: form.verifiedDate?.trim() ? false : Boolean(form.isExample),
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
    properties.push(row);
    if (row.priceMYR === null || row.priceMYR <= 0) unpriced += 1;
  }

  return { properties, unpriced };
}

/** Whether the stored preferences contain anything worth pre-filling. */
export function hasUsablePreferences(inputs: Partial<AffordabilityInputs>): boolean {
  return Object.values(inputs).some((value) => value !== undefined && value !== null && value !== '');
}
