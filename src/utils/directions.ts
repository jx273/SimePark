/**
 * Build an external map-search or directions URL from recorded facts only.
 *
 * Coordinates are used only when present. Otherwise the recorded address or
 * location string is used as a search query. That is a search, not a verified
 * pin, and callers must label it as such.
 */

import type { Property } from '../types/property';

export interface DirectionsTarget {
  url: string;
  mode: 'verified-coordinates' | 'approximate-coordinates' | 'recorded-address';
}

export function directionsTarget(property: Pick<
  Property,
  'latitude' | 'longitude' | 'locationPrecision' | 'address' | 'location' | 'propertyName'
>): DirectionsTarget | null {
  const { latitude, longitude, locationPrecision } = property;
  if (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude)
  ) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    return {
      url,
      mode: locationPrecision === 'verified' ? 'verified-coordinates' : 'approximate-coordinates',
    };
  }

  const query = [property.propertyName, property.address, property.location]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ');
  if (!query) return null;

  return {
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    mode: 'recorded-address',
  };
}
