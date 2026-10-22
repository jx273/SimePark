/**
 * Adapter from the authoritative source dataset to the SimePark domain model.
 *
 * WHY AN ADAPTER
 * The supplied JSON uses source-oriented field names and packs several facts into
 * semicolon-separated strings. Translating it here — once, with tests — avoids
 * scattering parsing logic through components and keeps the original wording
 * available. The raw source file remains committed as `properties.source.json`,
 * so nothing is lost in translation.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *  - It never invents a value. A missing field stays null.
 *  - It never derives coordinates, distances, rates or certifications.
 *  - It does not "clean up" conflicting source notes. Those stay in `notes`.
 */

import type {
  LocationPrecision,
  Property,
  PropertyAmenity,
  PropertyMedia,
  PropertyTranslation,
  PropertyType,
  PropertyMediaKind,
} from '../types/property';
import { PROPERTY_TYPES } from '../types/property';
import sourceRecords from '../data/properties.source.json';
import multilingualRecords from '../data/properties.multilingual.json';

/** One record exactly as supplied in the source JSON. */
export interface SourcePropertyRecord {
  id: string;
  propertyName: string;
  location: string;
  address?: string | null;
  priceMYR: number | null;
  propertyType: string | null;
  isExample?: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  sourceUrl: string | null;
  verifiedDate: string | null;
  priceMinMYR?: number | null;
  priceMaxMYR?: number | null;
  priceBasis?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  monthlyMaintenanceMYR?: number | null;
  sinkingFundMYR?: number | null;
  availabilityStatus?: string | null;
  availabilityCheckedDate?: string | null;
  tenure?: string | null;
  completionDate?: string | null;
  parkingBays?: number | null;
  furnishingStatus?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nearestTransit?: string | null;
  transitDistanceKm?: number | null;
  transitTravelTimeMin?: number | null;
  nearbyAmenity?: string | null;
  amenityDistanceKm?: number | null;
  facilityList?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  dateAccessed?: string | null;
  confirmedByRole?: string | null;
  confidenceStatus?: string | null;
  imagePermission?: string | null;
  notes?: string | null;
  /** Optional: only when the source explicitly states a travel mode. */
  transitMode?: string | null;
  imageUrls?: string[] | null;
  floorPlanUrls?: string[] | null;
  videoUrls?: string[] | null;
  translations?: {
    ms?: PropertyTranslation;
    zh?: PropertyTranslation;
  };
}

/* ------------------------------------------------------------------ */
/* Pure parsers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a semicolon-separated facility string into a de-duplicated array.
 *
 * The source uses "; " as the separator (e.g. "Gym; Jogging Track; Swimming
 * Pool"). Splitting defensively on any semicolon-like separator means an odd
 * source does not silently collapse into one giant facility name.
 */
export function parseFacilities(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of raw.split(/[;；]/)) {
    const cleaned = part.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

/**
 * Parse the semicolon-separated amenity string, extracting any distance written
 * inline in the same entry, e.g. "TMG Mart Mak Lagam (0.3km)".
 *
 * The distance is kept exactly as reported. No distance is inferred for entries
 * that do not carry one.
 */
export function parseAmenities(raw: string | null | undefined): PropertyAmenity[] {
  if (!raw) return [];

  const result: PropertyAmenity[] = [];

  for (const part of raw.split(/[;；]/)) {
    const entry = part.replace(/\s+/g, ' ').trim();
    if (!entry) continue;

    const match = entry.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*km\s*\)?/i);
    if (match) {
      const distance = Number.parseFloat(match[1]);
      const name = entry
        .replace(match[0], '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name) {
        result.push({
          name,
          distanceKm: Number.isFinite(distance) && distance >= 0 ? distance : null,
        });
      }
    } else {
      result.push({ name: entry, distanceKm: null });
    }
  }

  return result;
}

/**
 * Extract a project address recorded inside the source notes.
 *
 * Only an explicit "Address: ..." prefix is accepted; nothing is inferred from
 * the property name or the location string.
 */
export function extractAddress(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/(?:^|\s)Address:\s*([^.;]+(?:[^.;]*?))\.\s/);
  if (!match) return null;
  const address = match[1].trim();
  return address || null;
}

/** Coordinates are only usable when both are finite and in valid range. */
export function normalizeCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): { latitude: number | null; longitude: number | null; precision: LocationPrecision } {
  const lat = typeof latitude === 'number' && Number.isFinite(latitude) ? latitude : null;
  const lng = typeof longitude === 'number' && Number.isFinite(longitude) ? longitude : null;

  const validLat = lat !== null && lat >= -90 && lat <= 90;
  const validLng = lng !== null && lng >= -180 && lng <= 180;

  if (!validLat || !validLng) {
    // Never substitute a city centre or any other fallback point.
    return { latitude: null, longitude: null, precision: 'unknown' };
  }

  return { latitude: lat, longitude: lng, precision: 'verified' };
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function isSafeMediaUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isPubliclyDisplayableMedia(
  media: PropertyMedia
): boolean {
  if (media.visibility !== 'public') {
    return false;
  }

  const permission = media.permissionStatus?.toLowerCase();
  // Do not hide supplied images solely because their permission metadata is marked as unknown.
  // For this hackathon demo, the provided dataset is intended to display its supplied images,
  // with source attribution visible to users. Suppress only if explicitly restricted.
  if (permission === 'restricted') {
    return false;
  }

  return isSafeMediaUrl(
    media.watermarkedUrl ?? media.externalUrl ?? media.url ?? media.originalUrl
  );
}

/** Map source wording onto a known property type, or null. */
export function toPropertyType(value: string | null | undefined): PropertyType | null {
  if (!value) return null;
  const match = PROPERTY_TYPES.find(
    (type) => type.toLowerCase() === value.trim().toLowerCase()
  );
  return match ?? null;
}

/* ------------------------------------------------------------------ */
/* Record adaptation                                                  */
/* ------------------------------------------------------------------ */

export interface AdaptOptions {
  media?: PropertyMedia[];
  isPublished?: boolean;
  translations?: {
    ms?: PropertyTranslation;
    zh?: PropertyTranslation;
  };
}

function sourceMedia(
  record: SourcePropertyRecord
): PropertyMedia[] {
  const entries: Array<{ kind: PropertyMediaKind; urls: string[] | null | undefined }> = [
    { kind: 'photo', urls: record.imageUrls },
    { kind: 'floorplan', urls: record.floorPlanUrls },
    { kind: 'video', urls: record.videoUrls },
  ];

  return entries.flatMap(({ kind, urls }) =>
    (urls ?? []).flatMap((url, index) => {
      if (typeof url !== 'string' || !url.trim()) return [];
      const cleanUrl = url.trim();
      return [{
        id: `${record.id}-${kind}-${index + 1}`,
        propertyId: record.id,
        url: cleanUrl,
        kind,
        sourceKind: 'external' as const,
        externalUrl: cleanUrl,
        sourceUrl: asStringOrNull(record.sourceUrl),
        storagePath: null,
        visibility: 'public' as const,
        caption: null,
        altText: null,
        isCover: kind === 'photo' && index === 0,
        sortOrder: index + 1,
        attribution: asStringOrNull(record.sourceName) ?? 'Source listing',
        permissionStatus: asStringOrNull(record.imagePermission) ?? 'unknown',
        watermarkStatus: 'not_applied' as const,
        adminNotes: null,
        watermarkedUrl: null,
        originalUrl: cleanUrl,
      }];
    })
  );
}

/**
 * Convert one source record into the domain model.
 *
 * Returns null only when the record cannot be identified at all. A record with no
 * price is still adapted: it simply cannot take part in affordability maths, and
 * the catalogue layer decides how to surface that.
 */
export function adaptSourceRecord(
  record: SourcePropertyRecord,
  options: AdaptOptions = {}
): Property | null {
  if (!record.id || !record.propertyName) return null;

  const price = asNumberOrNull(record.priceMYR);
  if (price !== null && price <= 0) return null;

  const propertyType = toPropertyType(record.propertyType);
  const coords = normalizeCoordinates(record.latitude, record.longitude);
  const notes = asStringOrNull(record.notes);
  const address = extractAddress(notes);

  return {
    id: record.id,
    propertyName: record.propertyName.trim(),
    location: (record.location ?? '').trim(),
    address,

    priceMYR: price,
    priceMinMYR: asNumberOrNull(record.priceMinMYR),
    priceMaxMYR: asNumberOrNull(record.priceMaxMYR),
    priceBasis: asStringOrNull(record.priceBasis),

    // An unknown type is a data gap, not a reason to drop the property. The
    // catalogue keeps it and the UI shows the raw source wording.
    propertyType,
    bedrooms: asNumberOrNull(record.bedrooms),
    bathrooms: asNumberOrNull(record.bathrooms),
    builtUpSqft: asNumberOrNull(record.builtUpSqft),
    landArea: asNumberOrNull(record.landArea),
    landAreaUnit: asStringOrNull(record.landAreaUnit),

    monthlyMaintenanceMYR: asNumberOrNull(record.monthlyMaintenanceMYR),
    sinkingFundMYR: asNumberOrNull(record.sinkingFundMYR),

    tenure: asStringOrNull(record.tenure),
    completionDate: asStringOrNull(record.completionDate),
    parkingBays: asNumberOrNull(record.parkingBays),
    furnishingStatus: asStringOrNull(record.furnishingStatus),

    // Availability is never upgraded from "unknown" here. A verification date is
    // not an availability confirmation.
    availabilityStatus: asStringOrNull(record.availabilityStatus) ?? 'unknown',
    availabilityCheckedDate: asStringOrNull(record.availabilityCheckedDate),

    latitude: coords.latitude,
    longitude: coords.longitude,
    locationPrecision: coords.precision,

    nearestTransit: asStringOrNull(record.nearestTransit),
    transitDistanceKm: asNumberOrNull(record.transitDistanceKm),
    transitTravelTimeMin: asNumberOrNull(record.transitTravelTimeMin),
    // Only an explicit source field sets this; otherwise the route mode is unknown.
    transitMode: asStringOrNull(record.transitMode),

    nearbyAmenity: asStringOrNull(record.nearbyAmenity),
    amenityDistanceKm: asNumberOrNull(record.amenityDistanceKm),
    amenities: parseAmenities(record.nearbyAmenity),

    facilities: parseFacilities(record.facilityList),

    sourceUrl: asStringOrNull(record.sourceUrl),
    sourceType: asStringOrNull(record.sourceType),
    sourceName: asStringOrNull(record.sourceName),
    verifiedDate: asStringOrNull(record.verifiedDate),
    dateAccessed: asStringOrNull(record.dateAccessed),
    confirmedByRole: asStringOrNull(record.confirmedByRole),
    confidenceStatus: asStringOrNull(record.confidenceStatus),
    imagePermission: asStringOrNull(record.imagePermission),
    notes,

    isPublished: options.isPublished ?? true,
    isExample: record.isExample === true,
    media: options.media ?? sourceMedia(record),
    translations: options.translations ?? record.translations,
  };
}

/**
 * Build the bundled development catalogue from the committed source fixture and
 * media manifest.
 *
 * This is a DEVELOPMENT FALLBACK only. When Supabase is configured the app reads
 * the database, so admin edits are never overridden by this file.
 */
export function buildBundledCatalog(): Property[] {
  const records = sourceRecords as unknown as SourcePropertyRecord[];
  const multilingual = multilingualRecords as unknown as [
    SourcePropertyRecord[],
    SourcePropertyRecord[],
    SourcePropertyRecord[]
  ];

  const msList = Array.isArray(multilingual[1]) ? multilingual[1] : [];
  const zhList = Array.isArray(multilingual[2]) ? multilingual[2] : [];

  const msMap = new Map(msList.map((p) => [p.id, p]));
  const zhMap = new Map(zhList.map((p) => [p.id, p]));

  const properties: Property[] = [];

  for (const record of records) {
    const msItem = msMap.get(record.id);
    const zhItem = zhMap.get(record.id);

    const translations: { ms?: PropertyTranslation; zh?: PropertyTranslation } = {
      ...(msItem
        ? {
            ms: {
              propertyName: asStringOrNull(msItem.propertyName),
              location: asStringOrNull(msItem.location),
              address: asStringOrNull(msItem.address),
              propertyType: asStringOrNull(msItem.propertyType),
              priceBasis: asStringOrNull(msItem.priceBasis),
              availabilityStatus: asStringOrNull(msItem.availabilityStatus),
              tenure: asStringOrNull(msItem.tenure),
              furnishingStatus: asStringOrNull(msItem.furnishingStatus),
              facilities: parseFacilities(msItem.facilityList),
              notes: asStringOrNull(msItem.notes),
              nearbyAmenity: asStringOrNull(msItem.nearbyAmenity),
              nearestTransit: asStringOrNull(msItem.nearestTransit),
              sourceType: asStringOrNull(msItem.sourceType),
              confidenceStatus: asStringOrNull(msItem.confidenceStatus),
              imagePermission: asStringOrNull(msItem.imagePermission),
              landAreaUnit: asStringOrNull(msItem.landAreaUnit),
            },
          }
        : {}),
      ...(zhItem
        ? {
            zh: {
              propertyName: asStringOrNull(zhItem.propertyName),
              location: asStringOrNull(zhItem.location),
              address: asStringOrNull(zhItem.address),
              propertyType: asStringOrNull(zhItem.propertyType),
              priceBasis: asStringOrNull(zhItem.priceBasis),
              availabilityStatus: asStringOrNull(zhItem.availabilityStatus),
              tenure: asStringOrNull(zhItem.tenure),
              furnishingStatus: asStringOrNull(zhItem.furnishingStatus),
              facilities: parseFacilities(zhItem.facilityList),
              notes: asStringOrNull(zhItem.notes),
              nearbyAmenity: asStringOrNull(zhItem.nearbyAmenity),
              nearestTransit: asStringOrNull(zhItem.nearestTransit),
              sourceType: asStringOrNull(zhItem.sourceType),
              confidenceStatus: asStringOrNull(zhItem.confidenceStatus),
              imagePermission: asStringOrNull(zhItem.imagePermission),
              landAreaUnit: asStringOrNull(zhItem.landAreaUnit),
            },
          }
        : {}),
    };

    const adapted = adaptSourceRecord(record, { isPublished: true, translations });
    if (adapted) properties.push(adapted);
  }

  return properties;
}
