import type { Property, PropertyType } from '../types/property';
import { parseAmenities } from '../lib/propertyAdapter';

/**
 * Localize a property for the given interface language.
 *
 * Rules:
 *  - English ('en') is the primary canonical source of truth and the default fallback.
 *  - If the requested language is 'ms' or 'zh', any available localized field is returned.
 *  - Any missing, empty, or undefined translated field transparently falls back to the English value.
 *  - Non-language fields (id, price, bedrooms, bathrooms, sqft, coordinates, media, sourceUrl, isPublished)
 *    are NEVER altered across languages.
 */
export function getLocalizedProperty<T extends Property>(property: T, lang?: string | null): T {
  if (!property) return property;
  const normalizedLang = lang?.toLowerCase().startsWith('zh')
    ? 'zh'
    : lang?.toLowerCase().startsWith('ms')
    ? 'ms'
    : 'en';

  if (normalizedLang === 'en' || !property.translations) {
    return property;
  }

  const translation = property.translations[normalizedLang];
  if (!translation) {
    return property;
  }

  return {
    ...property,
    propertyName: translation.propertyName?.trim() || property.propertyName,
    location: translation.location?.trim() || property.location,
    address: translation.address?.trim() || property.address,
    propertyType: (translation.propertyType?.trim() as PropertyType) || property.propertyType,
    priceBasis: translation.priceBasis?.trim() || property.priceBasis,
    tenure: translation.tenure?.trim() || property.tenure,
    furnishingStatus: translation.furnishingStatus?.trim() || property.furnishingStatus,
    availabilityStatus: translation.availabilityStatus?.trim() || property.availabilityStatus,
    facilities:
      Array.isArray(translation.facilities) && translation.facilities.length > 0
        ? translation.facilities
        : property.facilities,
    notes: translation.notes?.trim() || property.notes,
    nearbyAmenity: translation.nearbyAmenity?.trim() || property.nearbyAmenity,
    amenities: translation.nearbyAmenity?.trim()
      ? parseAmenities(translation.nearbyAmenity.trim())
      : property.amenities,
    nearestTransit: translation.nearestTransit?.trim() || property.nearestTransit,
    sourceType: translation.sourceType?.trim() || property.sourceType,
    confidenceStatus: translation.confidenceStatus?.trim() || property.confidenceStatus,
    imagePermission: translation.imagePermission?.trim() || property.imagePermission,
    landAreaUnit: translation.landAreaUnit?.trim() || property.landAreaUnit,
  };
}

/**
 * Localize an array of properties for the given interface language.
 */
export function localizeProperties<T extends Property>(properties: T[], lang?: string | null): T[] {
  return properties.map((p) => getLocalizedProperty(p, lang));
}
