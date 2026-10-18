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
    unpriced: 0,
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
    return unavailableCatalog(
      'The property database could not be read. Apply the Supabase migrations and try again.'
    );
  }

  const currentRows = filterPublicCatalogueRows(data);
  if (currentRows.length === 0) {
    return unavailableCatalog(
      'No real property records are available. Review and apply 0004_property_catalogue.sql to import SP-001–SP-004.'
    );
  }
  const pricedRows = currentRows.filter(
    (row): row is PropertyRow => row.price_myr !== null && Number(row.price_myr) > 0
  );
  const mediaResult = await loadMedia(pricedRows.map((row) => row.id));

  return {
    properties: attachMedia(pricedRows, mediaResult.rows),
    unpriced: currentRows.length - pricedRows.length,
    source: 'supabase',
    ...(mediaResult.error ? { error: mediaResult.error } : {}),
  };
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  const client = await getSupabaseClient();
  if (!client) return bundledProperties.find((property) => property.id === id) ?? null;

  const { data, error } = await client
    .from('properties')
    .select('*')
    .eq('id', id)
    .eq('is_published', true)
    .eq('is_example', false)
    .maybeSingle();

  if (error || !data || data.price_myr === null || Number(data.price_myr) <= 0) return null;

  const mediaResult = await loadMedia([id]);
  return attachMedia(
    [data as PropertyRow],
    mediaResult.rows
  )[0] ?? null;
}

export function toUncalculatedCatalog(properties: Property[]): PropertyWithCalculations[] {
  return toUncalculatedProperties(properties);
}

export function isLiveCatalog(): boolean {
  return supabaseAvailable;
}
