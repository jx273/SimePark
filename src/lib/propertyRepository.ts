/**
 * The catalogue is read from Supabase whenever the application is configured.
 * The bundled source dataset is only used for an unconfigured local preview; a
 * live database error is surfaced instead of silently showing stale properties.
 */

import { getSupabaseClient, supabaseAvailable } from './supabase';
import { rowToProperty, rowToPropertyMedia } from './mappers';
import { buildBundledCatalog } from './propertyAdapter';
import type { Property, PropertyWithCalculations } from '../types/property';
import type { PropertyRow } from './database.types';
import { toUncalculatedProperties } from '../utils/propertyFilter';

export interface CatalogResult {
  properties: Property[];
  unpriced: number;
  source: 'supabase' | 'bundled-source';
  error?: string;
}

export function filterPublicCatalogueRows<T extends { is_example: boolean }>(rows: T[]): T[] {
  return rows.filter((row) => !row.is_example);
}

const bundledProperties = buildBundledCatalog();

export function bundledCatalog(): CatalogResult {
  return {
    properties: bundledProperties,
    unpriced: bundledProperties.filter((property) => property.priceMYR === null).length,
    source: 'bundled-source',
  };
}

function unavailableCatalog(message: string): CatalogResult {
  return { properties: [], unpriced: 0, source: 'supabase', error: message };
}

export function keepLoadedMedia<T>(rows: Array<T | null>): T[] {
  return rows.filter((row): row is T => row !== null);
}

async function loadMedia(propertyIds: string[]) {
  if (propertyIds.length === 0) return { rows: [], error: null };
  const client = await getSupabaseClient();
  if (!client) return { rows: [], error: 'Property media could not be loaded.' };

  const { data, error } = await client
    .from('property_media')
    .select('*')
    .in('property_id', propertyIds)
    .order('sort_order', { ascending: true });

  if (error) return { rows: [], error: 'Property media could not be loaded.' };

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      if (!row.storage_path) return row;
      const { data: signed, error: signedError } = await client.storage
        .from('property-media')
        .createSignedUrl(row.storage_path, 60 * 15);
      return signedError || !signed ? null : { ...row, url: signed.signedUrl };
    })
  );

  const failedRows = rows.some((row) => row === null);
  return {
    rows: keepLoadedMedia(rows),
    ...(failedRows ? { error: 'Some property media could not be loaded.' } : { error: null }),
  };
}

function attachMedia(
  rows: PropertyRow[],
  mediaRows: Awaited<ReturnType<typeof loadMedia>>['rows']
): Property[] {
  const mediaByProperty = new Map<string, ReturnType<typeof rowToPropertyMedia>[]>();
  for (const media of mediaRows) {
    const current = mediaByProperty.get(media.property_id) ?? [];
    current.push(rowToPropertyMedia(media));
    mediaByProperty.set(media.property_id, current);
  }

  return rows.flatMap((row) => {
    const property = rowToProperty(row);
    if (!property) return [];
    return [{ ...property, media: mediaByProperty.get(row.id) ?? [] }];
  });
}

export async function fetchCatalog(
  options: { includeUnpublished?: boolean } = {}
): Promise<CatalogResult> {
  const client = await getSupabaseClient();
  if (!client) return bundledCatalog();

  let query = client.from('properties').select('*').order('price_myr', {
    ascending: true,
    nullsFirst: false,
  });

  if (!options.includeUnpublished) query = query.eq('is_published', true);

  const { data, error } = await query;
  if (error || !data) {
    // If the database cannot be reached, fallback gracefully to the complete bundled catalog
    return bundledCatalog();
  }

  const currentRows = filterPublicCatalogueRows(data);
  const mediaResult = await loadMedia(currentRows.map((row) => row.id));
  const dbProperties = attachMedia(currentRows as PropertyRow[], mediaResult.rows);
  const dbIds = new Set(dbProperties.map((p) => p.id));

  // Merge so all 30 properties from the complete source dataset are present.
  // Database records take precedence over bundled source records.
  const allProperties = [
    ...dbProperties,
    ...bundledProperties.filter((p) => !dbIds.has(p.id) && (options.includeUnpublished || p.isPublished)),
  ];

  return {
    properties: allProperties,
    unpriced: allProperties.filter((row) => row.priceMYR === null).length,
    source: dbProperties.length > 0 ? 'supabase' : 'bundled-source',
    ...(mediaResult.error ? { error: mediaResult.error } : {}),
  };
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  const client = await getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('properties')
        .select('*')
        .eq('id', id)
        .eq('is_published', true)
        .eq('is_example', false)
        .maybeSingle();

      if (!error && data && (data.price_myr === null || Number(data.price_myr) > 0)) {
        const mediaResult = await loadMedia([id]);
        const matched = attachMedia([data as PropertyRow], mediaResult.rows)[0];
        if (matched) return matched;
      }
    } catch {
      // Fall through to bundled properties on any network or database issue
    }
  }

  return bundledProperties.find((property) => property.id === id) ?? null;
}

export function toUncalculatedCatalog(properties: Property[]): PropertyWithCalculations[] {
  return toUncalculatedProperties(properties);
}

export function isLiveCatalog(): boolean {
  return supabaseAvailable;
}
