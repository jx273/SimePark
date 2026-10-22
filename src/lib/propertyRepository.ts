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
  if (!client) {
    const list = options.includeUnpublished
      ? bundledProperties
      : bundledProperties.filter((p) => p.isPublished);
    return {
      properties: list,
      unpriced: list.filter((property) => property.priceMYR === null).length,
      source: 'bundled-source',
    };
  }

  const { data, error } = await client
    .from('properties')
    .select('*')
    .order('price_myr', {
      ascending: true,
      nullsFirst: false,
    });

  if (error || !data) {
    // Database failure: return error state safely without leaking unpublished properties
    return unavailableCatalog('Property catalogue could not be loaded.');
  }

  const allDbRows = (data ?? []) as PropertyRow[];
  const knownDbIds = new Set(allDbRows.map((row) => row.id));

  // Determine eligible rows based on publication status
  const eligibleRows = options.includeUnpublished
    ? allDbRows
    : allDbRows.filter((row) => row.is_published);

  const currentRows = filterPublicCatalogueRows(eligibleRows);
  const mediaResult = await loadMedia(currentRows.map((row) => row.id));
  const dbProperties = attachMedia(currentRows as PropertyRow[], mediaResult.rows);

  // Fallback for legitimate demo properties or unmigrated source records not in database.
  // CRITICAL: If a property exists in the database, its database publication status is final.
  // It must NEVER be revived through fallback data if unpublished in the database.
  const missingProperties = bundledProperties.filter((p) => {
    if (knownDbIds.has(p.id)) {
      return false;
    }
    return options.includeUnpublished || p.isPublished;
  });

  const allProperties = [...dbProperties, ...missingProperties];

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
        .maybeSingle();

      if (error) {
        // Database failure: return null safely; do not fall back and expose unpublished properties
        return null;
      }

      if (data) {
        // Authoritative record in database
        if (!data.is_published) {
          // Explicitly unpublished in database: keep hidden
          return null;
        }
        if (data.is_example) {
          return null;
        }
        if (data.price_myr !== null && !(Number(data.price_myr) > 0)) {
          return null;
        }

        const mediaResult = await loadMedia([id]);
        const matched = attachMedia([data as PropertyRow], mediaResult.rows)[0];
        return matched ?? null;
      }

      // Record does not exist in the database at all: check legitimate demo / bundled records
      const bundled = bundledProperties.find((property) => property.id === id);
      if (bundled && bundled.isPublished && !bundled.isExample) {
        return bundled;
      }
      return null;
    } catch {
      // Catch unexpected errors and fail safe
      return null;
    }
  }

  // Supabase not configured: local bundled mode
  const bundled = bundledProperties.find((property) => property.id === id);
  if (bundled && bundled.isPublished && !bundled.isExample) {
    return bundled;
  }
  return null;
}

export function toUncalculatedCatalog(properties: Property[]): PropertyWithCalculations[] {
  return toUncalculatedProperties(properties);
}

export function isLiveCatalog(): boolean {
  return supabaseAvailable;
}
