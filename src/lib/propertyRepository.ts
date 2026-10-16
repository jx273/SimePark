/**
 * Property catalogue access.
 *
 * Two sources are supported and the choice is automatic:
 *   1. Supabase `public.properties`, when the project is configured.
 *   2. The bundled `src/data/properties.json`, when it is not.
 *
 * This is what lets the guest experience work on a fresh clone with no database:
 * browsing, filtering and the calculator are unaffected. Saving requires an
 * account, which requires Supabase.
 *
 * Admin reads use the same table. RLS decides what each caller can see and do, so
 * there is no client-side privilege check that could be bypassed.
 */

import { getSupabaseClient, supabaseAvailable } from './supabase';
import { toCatalog } from './mappers';
import type { Property } from '../types/property';
import type { PropertyRow } from './database.types';
import localProperties from '../data/properties.json';

export interface CatalogResult {
  properties: Property[];
  /**
   * Rows present in the database but missing a usable price, so they were
   * excluded from the calculation feed. Surfaced so the UI can mention them
   * rather than quietly showing fewer properties.
   */
  unpriced: number;
  /** Where the data came from, for honest display in the UI and tests. */
  source: 'supabase' | 'bundled-demo';
  /** Populated when the database was expected but could not be read. */
  error?: string;
}

const bundledRows = localProperties as Property[];

/** The bundled catalogue, used when no database is configured or a read fails. */
export function bundledCatalog(): CatalogResult {
  const { properties, unpriced } = toCatalog(
    // The bundled JSON already matches the domain shape; run it through the same
    // price-validation path so both sources behave identically.
    bundledRows.map((row) => ({
      id: row.id,
      property_name: row.propertyName,
      location: row.location,
      price_myr: row.priceMYR,
      property_type: row.propertyType,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      built_up_sqft: row.builtUpSqft,
      source_url: row.sourceUrl,
      verified_date: row.verifiedDate,
      is_example: row.isExample,
      is_published: true,
      created_by: null,
      created_at: '',
      updated_at: '',
    })) satisfies PropertyRow[]
  );

  return { properties, unpriced, source: 'bundled-demo' };
}

/** Columns needed by the calculator. Selecting explicitly keeps payloads small. */
const CATALOG_COLUMNS =
  'id, property_name, location, price_myr, property_type, bedrooms, bathrooms, built_up_sqft, source_url, verified_date, is_example, is_published, created_by, created_at, updated_at';

/**
 * Load the public catalogue.
 *
 * Only published rows are visible to anonymous and ordinary signed-in users; the
 * RLS policy enforces that, so this query does not filter by hand. An
 * administrator additionally sees unpublished rows, which is intentional: the
 * public list must not show them, but the admin screen must.
 */
export async function fetchCatalog(options: { includeUnpublished?: boolean } = {}): Promise<CatalogResult> {
  const client = await getSupabaseClient();
  if (!client) return bundledCatalog();

  let query = client.from('properties').select(CATALOG_COLUMNS).order('price_myr', {
    ascending: true,
    nullsFirst: false,
  });

  if (!options.includeUnpublished) {
    // Explicit filter as well as the RLS policy: defence in depth, and it keeps
    // anonymous results identical regardless of policy changes.
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;

  if (error || !data) {
    // Fall back rather than breaking the page. The message is deliberately
    // generic: Supabase errors can name tables and policies.
    return {
      ...bundledCatalog(),
      error: 'The property database could not be read, so bundled demo data is shown.',
    };
  }

  const { properties, unpriced } = toCatalog(data as PropertyRow[]);
  return { properties, unpriced, source: 'supabase' };
}

/** Fetch a single property by id, or null when it is not visible to this user. */
export async function fetchPropertyById(id: string): Promise<Property | null> {
  const client = await getSupabaseClient();
  if (!client) {
    const found = bundledRows.find((property) => property.id === id);
    return found && found.priceMYR > 0 ? found : null;
  }

  const { data, error } = await client
    .from('properties')
    .select(CATALOG_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    const found = bundledRows.find((property) => property.id === id);
    return found && found.priceMYR > 0 ? found : null;
  }

  const { properties } = toCatalog([data as PropertyRow]);
  return properties[0] ?? null;
}

/** True when the app is reading the live catalogue rather than demo data. */
export function isLiveCatalog(): boolean {
  return supabaseAvailable;
}
