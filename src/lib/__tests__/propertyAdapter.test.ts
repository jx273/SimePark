import { describe, expect, it } from 'vitest';
import {
  buildBundledCatalog,
  isPubliclyDisplayableMedia,
  isSafeMediaUrl,
  parseAmenities,
  parseFacilities,
} from '../propertyAdapter';
import { toUncalculatedProperties } from '../../utils/propertyFilter';

describe('authoritative property source adapter', () => {
  const properties = buildBundledCatalog();

  it('adapts all 30 supplied property records without dropping unknown prices', () => {
    expect(properties).toHaveLength(30);
    expect(properties[0].id).toBe('SP-001');
    expect(properties[29].id).toBe('SP-030');
    expect(properties.every((property) => !property.isExample)).toBe(true);
    expect(properties.filter((property) => property.priceMYR === null)).toHaveLength(2);
  });

  it('keeps uncertainty, conflicting source notes, and reported route data intact', () => {
    const cappella = properties.find((property) => property.id === 'SP-004')!;
    const vogue = properties.find((property) => property.id === 'SP-001')!;

    expect(cappella.imagePermission).toBe('unknown');
    expect(cappella.availabilityStatus).toBe('unknown');
    expect(vogue.furnishingStatus).toBe('needs checking');
    expect(vogue.latitude).toBeCloseTo(3.116876553335637);
    expect(vogue.longitude).toBeCloseTo(101.67147161124345);
    expect(properties.find((property) => property.id === 'SP-003')?.latitude).toBeNull();
  });

  it('associates external photos, floor plans, and videos by their JSON property id', () => {
    const vogue = properties.find((property) => property.id === 'SP-001')!;
    const cappella = properties.find((property) => property.id === 'SP-004')!;
    const videoProperty = properties.find((property) => property.id === 'SP-009')!;

    expect(vogue.media?.filter((item) => item.kind === 'photo')).toHaveLength(10);
    expect(vogue.media?.find((item) => item.isCover)?.externalUrl).toContain('https://');
    expect(vogue.media?.find((item) => item.kind === 'floorplan')?.sourceUrl).toBe(vogue.sourceUrl);
    expect(cappella.media?.filter((item) => item.kind === 'floorplan')).toHaveLength(7);
    expect(videoProperty.media?.filter((item) => item.kind === 'video')).toHaveLength(1);
    expect(vogue.media?.every((item) => item.sourceKind === 'external' && item.storagePath === null)).toBe(true);
    expect(vogue.media?.every((item) => item.permissionStatus === 'unknown')).toBe(true);
    expect(vogue.media?.every((item) => isPubliclyDisplayableMedia(item))).toBe(true);
  });

  it('rejects unsafe media links and suppresses restricted media', () => {
    const photo = properties[0].media![0];
    expect(isSafeMediaUrl('https://example.com/image.jpg')).toBe(true);
    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false);
    expect(isPubliclyDisplayableMedia({
      ...photo,
      permissionStatus: 'unknown',
      visibility: 'public',
    })).toBe(true);
    expect(isPubliclyDisplayableMedia({
      ...photo,
      permissionStatus: 'restricted',
      visibility: 'public',
    })).toBe(false);
    expect(isPubliclyDisplayableMedia({
      ...photo,
      permissionStatus: 'confirmed',
      visibility: 'internal',
    })).toBe(false);
  });

  it('normalizes list-like fields without making up missing facilities or distances', () => {
    const parkView = properties.find((property) => property.id === 'SP-002')!;
    const kemaman = properties.find((property) => property.id === 'SP-003')!;

    expect(parkView.facilities).toContain('Swimming Pool');
    expect(kemaman.facilities).not.toContain('Swimming Pool');
    expect(parseAmenities('TMG Mart (0.3km); SMK Banggol')).toEqual([
      { name: 'TMG Mart', distanceKm: 0.3 },
      { name: 'SMK Banggol', distanceKm: null },
    ]);
    expect(parseAmenities('Mall (-0.3km); (0km); School (distance unknown); ;')).toEqual([
      { name: 'Mall', distanceKm: null },
      { name: 'School (distance unknown)', distanceKm: null },
    ]);
    expect(parseFacilities('Gym; Gymnasium; Swimming Pool')).toEqual([
      'Gym',
      'Gymnasium',
      'Swimming Pool',
    ]);
  });

  it('parses every non-empty amenity entry in the supplied catalogue', () => {
    for (const property of properties) {
      const rawEntries = (property.nearbyAmenity ?? '')
        .split(/[;；]/)
        .filter((entry) => entry.trim().length > 0);
      expect(property.amenities).toHaveLength(rawEntries.length);
      expect(property.amenities?.every((amenity) =>
        amenity.name.trim().length > 0 &&
        (amenity.distanceKm === null || (Number.isFinite(amenity.distanceKm) && amenity.distanceKm >= 0))
      )).toBe(true);
    }
  });

  it('leaves budget-dependent values uncalculated until the user submits inputs', () => {
    const [property] = toUncalculatedProperties(properties);
    expect(property.budgetStatus).toBe('uncalculated');
    expect(property.estimatedMonthlyMortgage).toBeNull();
    expect(property.requiredDownPayment).toBeNull();
    expect(property.isAffordable).toBeNull();
  });
});
