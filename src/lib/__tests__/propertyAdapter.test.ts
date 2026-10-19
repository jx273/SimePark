import { describe, expect, it } from 'vitest';
import { buildBundledCatalog, parseAmenities, parseFacilities } from '../propertyAdapter';
import { toUncalculatedProperties } from '../../utils/propertyFilter';

describe('authoritative property source adapter', () => {
  const properties = buildBundledCatalog();

  it('adapts exactly the four supplied property records', () => {
    expect(properties.map((property) => property.id)).toEqual([
      'SP-001',
      'SP-002',
      'SP-003',
      'SP-004',
    ]);
    expect(properties.every((property) => !property.isExample)).toBe(true);
  });

  it('keeps uncertainty, conflicting source notes, and reported route data intact', () => {
    const cappella = properties.find((property) => property.id === 'SP-003')!;
    const vogue = properties.find((property) => property.id === 'SP-004')!;

    expect(cappella.tenure).toBe('needs checking');
    expect(cappella.confidenceStatus).toBe('needs checking');
    expect(cappella.notes).toContain('CONFLICTS IN SOURCE');
    expect(cappella.availabilityStatus).toBe('unknown');
    expect(cappella.imagePermission).toBe('unknown');
    expect(cappella.transitDistanceKm).toBe(1.4);
    expect(cappella.transitMode).toBeNull();
    expect(vogue.furnishingStatus).toBe('needs checking');
    expect(vogue.latitude).toBeNull();
    expect(vogue.longitude).toBeNull();
  });

  it('associates the inspected photo sets and floor plans with matching properties', () => {
    const parkView = properties.find((property) => property.id === 'SP-001')!;
    const kemaman = properties.find((property) => property.id === 'SP-002')!;
    const cappella = properties.find((property) => property.id === 'SP-003')!;
    const vogue = properties.find((property) => property.id === 'SP-004')!;

    expect(parkView.media?.filter((item) => item.kind === 'photo')).toHaveLength(5);
    expect(parkView.media?.find((item) => item.isCover)?.url).toContain('/SP-001-photo-1.jpg');
    expect(kemaman.media?.every((item) => item.url.includes('/SP-002/'))).toBe(true);
    expect(cappella.media?.some((item) => item.kind === 'floorplan')).toBe(true);
    expect(vogue.media?.some((item) => item.kind === 'floorplan')).toBe(true);
    expect(properties.flatMap((property) => property.media ?? []).every(
      (item) => item.attribution === 'Property agent' && item.permissionStatus === 'unknown'
    )).toBe(true);
    expect(properties.flatMap((property) => property.media ?? []).every(
      (item) => !item.url.includes('iproperty.com.my')
    )).toBe(true);
  });

  it('normalizes list-like fields without making up missing facilities or distances', () => {
    const parkView = properties.find((property) => property.id === 'SP-001')!;
    const kemaman = properties.find((property) => property.id === 'SP-002')!;

    expect(parkView.facilities).toContain('Swimming Pool');
    expect(kemaman.facilities).not.toContain('Swimming Pool');
    expect(parseAmenities('TMG Mart (0.3km); SMK Banggol')).toEqual([
      { name: 'TMG Mart', distanceKm: 0.3 },
      { name: 'SMK Banggol', distanceKm: null },
    ]);
    expect(parseFacilities('Gym; Gymnasium; Swimming Pool')).toEqual([
      'Gym',
      'Gymnasium',
      'Swimming Pool',
    ]);
  });

  it('leaves budget-dependent values uncalculated until the user submits inputs', () => {
    const [property] = toUncalculatedProperties(properties);
    expect(property.budgetStatus).toBe('uncalculated');
    expect(property.estimatedMonthlyMortgage).toBeNull();
    expect(property.requiredDownPayment).toBeNull();
    expect(property.isAffordable).toBeNull();
  });
});
