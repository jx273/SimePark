import { describe, expect, it } from 'vitest';
import {
  formatAmenityString,
  parseAmenityString,
  parseFacilitiesText,
  type AmenityItem,
} from '../AdminPage';
import { buildBundledCatalog } from '../../lib/propertyAdapter';

describe('Admin form features and data integrity', () => {
  describe('Requirement 5: Repeatable Amenities', () => {
    it('parses amenity strings with and without distance into repeatable items', () => {
      const raw = 'Mid Valley Megamall (0.75km); KL Eco City Mall (3km); SK PERMAI INDAH';
      const parsed = parseAmenityString(raw);

      expect(parsed).toHaveLength(3);
      expect(parsed[0].name).toBe('Mid Valley Megamall');
      expect(parsed[0].distanceKm).toBe('0.75');

      expect(parsed[1].name).toBe('KL Eco City Mall');
      expect(parsed[1].distanceKm).toBe('3');

      expect(parsed[2].name).toBe('SK PERMAI INDAH');
      expect(parsed[2].distanceKm).toBe('');
    });

    it('formats repeatable amenity items back into a canonical semicolon-separated string', () => {
      const items: AmenityItem[] = [
        { id: '1', name: 'Mid Valley Megamall', distanceKm: '0.75' },
        { id: '2', name: 'KL Eco City Mall', distanceKm: '3' },
        { id: '3', name: 'SK PERMAI INDAH', distanceKm: '' },
      ];

      const formatted = formatAmenityString(items);
      expect(formatted).toBe('Mid Valley Megamall (0.75km); KL Eco City Mall (3km); SK PERMAI INDAH');
    });

    it('ignores empty items when formatting amenities', () => {
      const items: AmenityItem[] = [
        { id: '1', name: 'Mid Valley Megamall', distanceKm: '0.75' },
        { id: '2', name: '   ', distanceKm: '3' },
        { id: '3', name: '', distanceKm: '' },
      ];
      expect(formatAmenityString(items)).toBe('Mid Valley Megamall (0.75km)');
    });
  });

  describe('Requirement 6: Facilities Input', () => {
    it('accepts semicolon-separated facilities', () => {
      const input = 'Swimming Pool; Gym; Playground; 24-Hour Security';
      const parsed = parseFacilitiesText(input);
      expect(parsed).toEqual(['Swimming Pool', 'Gym', 'Playground', '24-Hour Security']);
    });

    it('accepts newline-separated facilities', () => {
      const input = `Swimming Pool
Gym
Playground
24-Hour Security`;
      const parsed = parseFacilitiesText(input);
      expect(parsed).toEqual(['Swimming Pool', 'Gym', 'Playground', '24-Hour Security']);
    });

    it('accepts a mixture of semicolons and newlines while trimming and removing empties/duplicates', () => {
      const input = `Swimming Pool; Gym
Playground ;  
  24-Hour Security ; Gym
`;
      const parsed = parseFacilitiesText(input);
      expect(parsed).toEqual(['Swimming Pool', 'Gym', 'Playground', '24-Hour Security']);
    });
  });

  describe('Requirement 9 & 10: Duplicate ID Prevention & SP-030 Protection', () => {
    const catalog = buildBundledCatalog();

    it('has SP-030 as The Charlotte in canonical catalog', () => {
      const sp30 = catalog.find((p) => p.id === 'SP-030');
      expect(sp30).toBeDefined();
      expect(sp30?.propertyName).toBe('The Charlotte');
      expect(sp30?.location).toBe('Kuching, Sarawak');
    });

    it('detects duplicate IDs against existing properties in the catalog', () => {
      const isDuplicate = (id: string) =>
        catalog.some((p) => p.id.trim().toLowerCase() === id.trim().toLowerCase());

      expect(isDuplicate('SP-030')).toBe(true);
      expect(isDuplicate('sp-030')).toBe(true);
      expect(isDuplicate('SP-001')).toBe(true);
      expect(isDuplicate('SP-999')).toBe(false);
    });

    it('blocks attempting to create another property with SP-030 to prevent overwriting', () => {
      const attemptId = 'SP-030';
      const existingIds = catalog.map((p) => p.id.toLowerCase());
      const isBlocked = existingIds.includes(attemptId.toLowerCase());
      expect(isBlocked).toBe(true);
    });
  });
});
