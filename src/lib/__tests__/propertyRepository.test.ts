import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  bundledCatalog,
  fetchCatalog,
  fetchPropertyById,
  filterPublicCatalogueRows,
  keepLoadedMedia,
} from '../propertyRepository';
import * as supabaseModule from '../supabase';
import type { PropertyRow } from '../database.types';

describe('bundledCatalog', () => {
  it('reports all supplied records and counts the unknown prices', () => {
    const catalog = bundledCatalog();
    expect(catalog.properties).toHaveLength(30);
    expect(catalog.unpriced).toBe(2);
  });
});

describe('filterPublicCatalogueRows', () => {
  it('excludes demonstration rows and retains non-example property rows', () => {
    const rows = [
      { id: 'demo-001', is_example: true },
      { id: 'SP-001', is_example: false },
      { id: 'SP-005', is_example: false },
    ];

    expect(filterPublicCatalogueRows(rows)).toEqual([
      { id: 'SP-001', is_example: false },
      { id: 'SP-005', is_example: false },
    ]);
  });
});

describe('keepLoadedMedia', () => {
  it('keeps usable gallery rows when some signed URLs fail', () => {
    const rows = [
      { id: 'photo-1', url: '/media/photo-1.jpg' },
      null,
      { id: 'photo-3', url: 'https://signed.example/photo-3.jpg' },
    ];

    expect(keepLoadedMedia(rows)).toEqual([
      { id: 'photo-1', url: '/media/photo-1.jpg' },
      { id: 'photo-3', url: 'https://signed.example/photo-3.jpg' },
    ]);
  });
});

describe('fetchCatalog & fetchPropertyById — Issue 2: Publication & Fallback rules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockDbRow = (overrides: Partial<PropertyRow> = {}): PropertyRow => ({
    id: 'SP-001',
    property_name: 'Vogue Suites One',
    location: 'KL Eco City, Kuala Lumpur',
    address: 'KL Eco City',
    price_myr: 850000,
    price_min_myr: null,
    price_max_myr: null,
    price_basis: 'asking price',
    property_type: 'Apartment',
    bedrooms: 1,
    bathrooms: 1,
    built_up_sqft: 732,
    land_area: null,
    land_area_unit: null,
    monthly_maintenance_myr: null,
    sinking_fund_myr: null,
    tenure: 'Leasehold',
    completion_date: '2017',
    parking_bays: 1,
    furnishing_status: 'Fully furnished',
    availability_status: 'Available',
    availability_checked_date: '2026-10-17',
    latitude: 3.11687,
    longitude: 101.67147,
    location_precision: 'verified',
    nearest_transit: 'Abdullah Hukum LRT',
    transit_distance_km: 0.2,
    transit_travel_time_min: 3,
    transit_mode: 'walk',
    nearby_amenity: 'Mid Valley Megamall',
    amenity_distance_km: 0.5,
    facilities: ['Gym', 'Swimming Pool'],
    source_url: 'https://www.iproperty.com.my/sale-101578223/',
    source_type: 'listing portal',
    source_name: 'iProperty',
    verified_date: '2026-10-17',
    date_accessed: '2026-10-17',
    confirmed_by_role: 'analyst',
    confidence_status: 'high',
    image_permission: 'unknown',
    notes: 'Test note',
    is_example: false,
    is_published: true,
    created_by: null,
    created_at: '2026-10-17T00:00:00Z',
    updated_at: '2026-10-17T00:00:00Z',
    ...overrides,
  });

  it('excludes properties marked as unpublished in the database from public listings without fallback revival', async () => {
    // Database has SP-001 (published) and SP-002 (explicitly unpublished)
    const dbRows: PropertyRow[] = [
      mockDbRow({ id: 'SP-001', property_name: 'Vogue Suites One', is_published: true }),
      mockDbRow({ id: 'SP-002', property_name: 'Park View @ Taman Juru Setia', is_published: false }),
    ];

    const fakeClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'properties') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
            }),
          };
        }
        if (table === 'property_media') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseClient').mockResolvedValue(fakeClient as any);

    const publicCatalog = await fetchCatalog({ includeUnpublished: false });

    // SP-001 must be present (published)
    expect(publicCatalog.properties.some((p) => p.id === 'SP-001')).toBe(true);

    // SP-002 must NOT be present in public catalog (it was unpublished in DB)
    expect(publicCatalog.properties.some((p) => p.id === 'SP-002')).toBe(false);

    // Missing properties (e.g. SP-005) not in DB may fall back if published
    expect(publicCatalog.properties.some((p) => p.id === 'SP-005')).toBe(true);
  });

  it('includes unpublished properties when includeUnpublished: true is explicitly requested (Admin view)', async () => {
    const dbRows: PropertyRow[] = [
      mockDbRow({ id: 'SP-001', property_name: 'Vogue Suites One', is_published: true }),
      mockDbRow({ id: 'SP-002', property_name: 'Park View @ Taman Juru Setia', is_published: false }),
    ];

    const fakeClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'properties') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
            }),
          };
        }
        if (table === 'property_media') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseClient').mockResolvedValue(fakeClient as any);

    const adminCatalog = await fetchCatalog({ includeUnpublished: true });

    // Both must be present in admin view
    expect(adminCatalog.properties.some((p) => p.id === 'SP-001' && p.isPublished === true)).toBe(true);
    expect(adminCatalog.properties.some((p) => p.id === 'SP-002' && p.isPublished === false)).toBe(true);
  });

  it('handles database failures safely without leaking unpublished properties', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection timeout' } }),
        }),
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseClient').mockResolvedValue(fakeClient as any);

    const catalog = await fetchCatalog();
    expect(catalog.error).toContain('could not be loaded');
    expect(catalog.properties).toHaveLength(0);
  });

  it('prevents an unpublished database property from being fetched by ID, even across simulated page refreshes', async () => {
    const unpublishedRow = mockDbRow({ id: 'SP-002', is_published: false });

    const fakeClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'properties') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: unpublishedRow, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseClient').mockResolvedValue(fakeClient as any);

    // First fetch
    const firstAttempt = await fetchPropertyById('SP-002');
    expect(firstAttempt).toBeNull();

    // Simulated refresh (second fetch)
    const secondAttempt = await fetchPropertyById('SP-002');
    expect(secondAttempt).toBeNull();
  });

  it('returns null on database errors when fetching by ID', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
          }),
        }),
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseClient').mockResolvedValue(fakeClient as any);

    const result = await fetchPropertyById('SP-001');
    expect(result).toBeNull();
  });

  it('allows fallback only for records completely missing from the database', async () => {
    // SP-999 is not in the database at all (data is null, error is null)
    const fakeClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseClient').mockResolvedValue(fakeClient as any);

    // SP-005 exists in bundledProperties and is published
    const result = await fetchPropertyById('SP-005');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('SP-005');
  });
});
