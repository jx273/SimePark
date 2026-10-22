import { describe, expect, it } from 'vitest';
import { buildBundledCatalog } from '../propertyAdapter';
import { fetchCatalog } from '../propertyRepository';
import { getLocalizedProperty, localizeProperties } from '../../utils/propertyLocalization';
import { formToUpdate, propertyToInsert, propertyToRow, rowToAdminForm, rowToProperty } from '../mappers';
import type { Property, PropertyTranslation } from '../../types/property';
import type { PropertyRow } from '../database.types';

describe('Multilingual Property Data & Dynamic Switching', () => {
  it('loads bundled properties with ms and zh translations from the dataset', () => {
    const catalog = buildBundledCatalog();
    expect(catalog.length).toBe(30);

    const first = catalog[0];
    expect(first.id).toBe('SP-001');
    expect(first.translations).toBeDefined();
    expect(first.translations?.zh).toBeDefined();
    expect(first.translations?.ms).toBeDefined();

    // Chinese translation checks
    expect(first.translations?.zh?.propertyType).toBe('公寓');
    // Malay translation checks (Apartment -> Pangsapuri)
    expect(first.translations?.ms?.propertyType).toBe('Pangsapuri');
  });

  it('localizes properties dynamically based on the requested language', () => {
    const catalog = buildBundledCatalog();
    const prop = catalog.find((p) => p.id === 'SP-001')!;

    const en = getLocalizedProperty(prop, 'en');
    expect(en.propertyName).toBe('Vogue Suites One');
    expect(en.propertyType).toBe('Apartment');

    const zh = getLocalizedProperty(prop, 'zh');
    expect(zh.propertyType).toBe('公寓');
    // Numeric and structural fields remain identical
    expect(zh.priceMYR).toBe(prop.priceMYR);
    expect(zh.bedrooms).toBe(prop.bedrooms);
    expect(zh.latitude).toBe(prop.latitude);

    const ms = getLocalizedProperty(prop, 'ms');
    expect(ms.propertyType).toBe('Pangsapuri');
    expect(ms.priceMYR).toBe(prop.priceMYR);
  });

  it('gracefully falls back to English when a translation or field is missing', () => {
    const sampleProperty: Property = {
      id: 'SP-TEST',
      propertyName: 'English Name',
      location: 'Kuala Lumpur',
      address: '123 Test Street',
      priceMYR: 500000,
      propertyType: 'Condominium',
      bedrooms: 3,
      bathrooms: 2,
      builtUpSqft: 1000,
      sourceUrl: 'https://example.com',
      verifiedDate: '2026-01-01',
      isExample: false,
      translations: {
        zh: {
          propertyName: '中文名称',
          // location and other fields omitted
        },
      },
    };

    const localizedZh = getLocalizedProperty(sampleProperty, 'zh');
    // Translated field
    expect(localizedZh.propertyName).toBe('中文名称');
    // Untranslated field falls back to English
    expect(localizedZh.location).toBe('Kuala Lumpur');
    expect(localizedZh.address).toBe('123 Test Street');
    expect(localizedZh.propertyType).toBe('Condominium');

    // Language with no translations defined falls back to English completely
    const localizedMs = getLocalizedProperty(sampleProperty, 'ms');
    expect(localizedMs.propertyName).toBe('English Name');
    expect(localizedMs.location).toBe('Kuala Lumpur');
  });

  it('keeps canonical property ID and non-translatable facts unified', () => {
    const catalog = buildBundledCatalog();
    for (const prop of catalog) {
      const zh = getLocalizedProperty(prop, 'zh');
      const ms = getLocalizedProperty(prop, 'ms');

      expect(zh.id).toBe(prop.id);
      expect(ms.id).toBe(prop.id);
      expect(zh.priceMYR).toBe(prop.priceMYR);
      expect(ms.priceMYR).toBe(prop.priceMYR);
      expect(zh.builtUpSqft).toBe(prop.builtUpSqft);
      expect(ms.builtUpSqft).toBe(prop.builtUpSqft);
      expect(zh.bedrooms).toBe(prop.bedrooms);
      expect(ms.bedrooms).toBe(prop.bedrooms);
    }
  });

  it('localizes an entire list of properties using localizeProperties', () => {
    const catalog = buildBundledCatalog();
    const localized = localizeProperties(catalog, 'zh');
    expect(localized.length).toBe(catalog.length);
    expect(localized[0].id).toBe(catalog[0].id);
  });

  it('verifies all 30 properties have rich translations for ms and zh across all metadata fields', () => {
    const catalog = buildBundledCatalog();
    expect(catalog.length).toBe(30);

    for (const prop of catalog) {
      expect(prop.translations).toBeDefined();
      expect(prop.translations?.zh).toBeDefined();
      expect(prop.translations?.ms).toBeDefined();

      const zh = getLocalizedProperty(prop, 'zh');
      const ms = getLocalizedProperty(prop, 'ms');

      // Check Chinese translations are active and localized
      expect(zh.propertyType).not.toBeNull();
      expect(zh.tenure).not.toBeNull();
      expect(zh.priceBasis).not.toBeNull();
      expect(zh.furnishingStatus).not.toBeNull();
      expect(zh.sourceType).not.toBeNull();
      expect(zh.confidenceStatus).not.toBeNull();
      expect(zh.imagePermission).not.toBeNull();

      // Check Malay translations are active and localized
      expect(ms.propertyType).not.toBeNull();
      expect(ms.tenure).not.toBeNull();
      expect(ms.priceBasis).not.toBeNull();
      expect(ms.furnishingStatus).not.toBeNull();
      expect(ms.sourceType).not.toBeNull();
      expect(ms.confidenceStatus).not.toBeNull();
      expect(ms.imagePermission).not.toBeNull();
    }
  });

  it('verifies fetchCatalog returns properties with attached multilingual translations', async () => {
    const res = await fetchCatalog({ includeUnpublished: true });
    expect(res.properties.length).toBeGreaterThanOrEqual(30);
    const sp1 = res.properties.find((p) => p.id === 'SP-001')!;
    expect(sp1).toBeDefined();
    expect(sp1.translations?.zh?.propertyType).toBe('公寓');
    expect(sp1.translations?.ms?.propertyType).toBe('Pangsapuri');

    const localizedZh = getLocalizedProperty(sp1, 'zh');
    expect(localizedZh.propertyType).toBe('公寓');
    const localizedMs = getLocalizedProperty(sp1, 'ms');
    expect(localizedMs.propertyType).toBe('Pangsapuri');
  });
});

describe('Database & Admin Mappings with Translations', () => {
  it('maps translations between database row and domain Property', () => {
    const row: PropertyRow = {
      id: 'SP-999',
      property_name: 'Test Residence',
      location: 'Penang',
      address: null,
      price_myr: 450000,
      price_min_myr: null,
      price_max_myr: null,
      price_basis: null,
      property_type: 'Condominium',
      bedrooms: 2,
      bathrooms: 2,
      built_up_sqft: 850,
      land_area: null,
      land_area_unit: null,
      monthly_maintenance_myr: null,
      sinking_fund_myr: null,
      tenure: 'Freehold',
      completion_date: null,
      parking_bays: 1,
      furnishing_status: 'Fully Furnished',
      availability_status: 'Available',
      availability_checked_date: null,
      latitude: 5.4,
      longitude: 100.3,
      location_precision: 'verified',
      nearest_transit: null,
      transit_distance_km: null,
      transit_travel_time_min: null,
      transit_mode: null,
      nearby_amenity: null,
      amenity_distance_km: null,
      facilities: ['Pool', 'Gym'],
      source_url: 'https://example.com',
      source_type: 'Agent',
      source_name: 'Test',
      verified_date: '2026-01-01',
      date_accessed: null,
      confirmed_by_role: null,
      confidence_status: 'High',
      image_permission: 'granted',
      notes: null,
      is_example: false,
      is_published: true,
      translations: {
        zh: {
          propertyName: '测试公寓',
          tenure: '永久地契',
        },
        ms: {
          propertyName: 'Kediaman Ujian',
          tenure: 'Pegangan Bebas',
        },
      },
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const prop = rowToProperty(row);
    expect(prop).not.toBeNull();
    expect(prop?.translations?.zh?.propertyName).toBe('测试公寓');
    expect(prop?.translations?.ms?.propertyName).toBe('Kediaman Ujian');

    const mappedRow = propertyToRow(prop!);
    expect((mappedRow.translations as any)?.zh?.propertyName).toBe('测试公寓');
    expect((mappedRow.translations as any)?.ms?.propertyName).toBe('Kediaman Ujian');
  });

  it('maps admin form to update payload with optional translations', () => {
    const adminForm = {
      id: 'SP-100',
      propertyName: 'New Tower',
      location: 'KL',
      address: null,
      priceMYR: 600000,
      priceMinMYR: null,
      priceMaxMYR: null,
      priceBasis: null,
      propertyType: 'Condominium' as const,
      bedrooms: 3,
      bathrooms: 2,
      builtUpSqft: 1100,
      landArea: null,
      landAreaUnit: null,
      monthlyMaintenanceMYR: null,
      sinkingFundMYR: null,
      tenure: null,
      completionDate: null,
      parkingBays: 1,
      furnishingStatus: null,
      availabilityStatus: 'Available',
      availabilityCheckedDate: null,
      latitude: 3.1,
      longitude: 101.6,
      locationPrecision: 'verified' as const,
      nearestTransit: null,
      transitDistanceKm: null,
      transitTravelTimeMin: null,
      transitMode: null,
      nearbyAmenity: null,
      amenityDistanceKm: null,
      facilities: ['BBQ'],
      sourceUrl: 'https://example.com/listing',
      sourceType: null,
      sourceName: null,
      verifiedDate: '2026-02-01',
      dateAccessed: null,
      confirmedByRole: null,
      confidenceStatus: null,
      imagePermission: null,
      notes: null,
      isExample: false,
      isPublished: true,
      translations: {
        zh: {
          propertyName: '新大厦',
        },
      },
    };

    const updatePayload = formToUpdate(adminForm);
    expect((updatePayload.translations as any)?.zh?.propertyName).toBe('新大厦');

    const insertPayload = propertyToInsert(adminForm, 'user-123');
    expect((insertPayload.translations as any)?.zh?.propertyName).toBe('新大厦');
  });

  it('allows saving with English only (translations omitted/undefined)', () => {
    const adminFormEnglishOnly = {
      id: 'SP-ENG',
      propertyName: 'English Only Tower',
      location: 'KL',
      address: null,
      priceMYR: 700000,
      priceMinMYR: null,
      priceMaxMYR: null,
      priceBasis: null,
      propertyType: 'Condominium' as const,
      bedrooms: 3,
      bathrooms: 2,
      builtUpSqft: 1200,
      landArea: null,
      landAreaUnit: null,
      monthlyMaintenanceMYR: null,
      sinkingFundMYR: null,
      tenure: null,
      completionDate: null,
      parkingBays: null,
      furnishingStatus: null,
      availabilityStatus: 'Available',
      availabilityCheckedDate: null,
      latitude: null,
      longitude: null,
      locationPrecision: 'unknown' as const,
      nearestTransit: null,
      transitDistanceKm: null,
      transitTravelTimeMin: null,
      transitMode: null,
      nearbyAmenity: null,
      amenityDistanceKm: null,
      facilities: [],
      sourceUrl: null,
      sourceType: null,
      sourceName: null,
      verifiedDate: null,
      dateAccessed: null,
      confirmedByRole: null,
      confidenceStatus: null,
      imagePermission: null,
      notes: null,
      isExample: false,
      isPublished: true,
      translations: undefined,
    };

    const updatePayload = formToUpdate(adminFormEnglishOnly);
    expect(updatePayload.translations).toBeNull();
  });
});

describe('Canonical Data Integrity (SP-001..SP-030)', () => {
  it('confirms SP-030 is The Charlotte and not KLCC', () => {
    const catalog = buildBundledCatalog();
    const sp30 = catalog.find((p) => p.id === 'SP-030');
    expect(sp30).toBeDefined();
    expect(sp30?.propertyName).toBe('The Charlotte');
    expect(sp30?.propertyName.toLowerCase().includes('klcc')).toBe(false);
  });
});
