/**
 * Private user data access.
 *
 * Every function here operates on the *current* authenticated user's rows. The
 * user id is passed explicitly by callers rather than inferred, but that is not
 * the security boundary: Row Level Security is. Each table has policies keyed on
 * `auth.uid()`, so even a forged user_id in the request cannot read or write
 * another user's data. The explicit id exists so the queries are readable and so
 * inserts satisfy the NOT NULL constraint.
 *
 * No function in this file uses a service key; the browser never holds one.
 */

import { getSupabaseClient } from './supabase';
import type {
  ActivityAction,
  SavedScenarioInsert,
  SavedScenarioRow,
  UserPreferencesRow,
} from './database.types';

export interface RepositoryResult<T> {
  data: T | null;
  error: string | null;
}

/** A short, user-safe error. Upstream messages can name tables and policies. */
const GENERIC_ERROR = 'We could not complete that request. Please try again.';
const NOT_CONFIGURED = 'Saving is unavailable because the database is not configured.';

/** Awaitable accessor for the lazily-imported shared client. */
async function client() {
  return getSupabaseClient();
}

/* ------------------------------------------------------------------ */
/* Saved properties (favourites)                                      */
/* ------------------------------------------------------------------ */

export async function listSavedPropertyIds(userId: string): Promise<RepositoryResult<string[]>> {
  const supabase = await client();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from('saved_properties')
    .select('property_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: GENERIC_ERROR };
  return { data: (data ?? []).map((row) => row.property_id as string), error: null };
}

export async function saveProperty(
  userId: string,
  propertyId: string
): Promise<RepositoryResult<true>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  const { error } = await supabase
    .from('saved_properties')
    .upsert({ user_id: userId, property_id: propertyId }, { onConflict: 'user_id,property_id' });

  if (error) return { data: null, error: GENERIC_ERROR };
  await recordActivity(userId, 'saved', propertyId);
  return { data: true, error: null };
}

export async function unsaveProperty(
  userId: string,
  propertyId: string
): Promise<RepositoryResult<true>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  const { error } = await supabase
    .from('saved_properties')
    .delete()
    .eq('user_id', userId)
    .eq('property_id', propertyId);

  if (error) return { data: null, error: GENERIC_ERROR };
  return { data: true, error: null };
}

/* ------------------------------------------------------------------ */
/* Saved affordability scenarios                                      */
/* ------------------------------------------------------------------ */

export async function listScenarios(userId: string): Promise<RepositoryResult<SavedScenarioRow[]>> {
  const supabase = await client();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from('saved_scenarios')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: GENERIC_ERROR };
  return { data: (data ?? []) as SavedScenarioRow[], error: null };
}

export async function createScenario(
  scenario: SavedScenarioInsert
): Promise<RepositoryResult<SavedScenarioRow>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  const { data, error } = await supabase
    .from('saved_scenarios')
    .insert(scenario)
    .select('*')
    .single();

  if (error) return { data: null, error: GENERIC_ERROR };
  await recordActivity(scenario.user_id, 'scenario_saved', null);
  return { data: data as SavedScenarioRow, error: null };
}

export async function deleteScenario(
  userId: string,
  scenarioId: string
): Promise<RepositoryResult<true>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  const { error } = await supabase
    .from('saved_scenarios')
    .delete()
    .eq('user_id', userId)
    .eq('id', scenarioId);

  if (error) return { data: null, error: GENERIC_ERROR };
  return { data: true, error: null };
}

/* ------------------------------------------------------------------ */
/* Preferences                                                        */
/* ------------------------------------------------------------------ */

export async function getPreferences(
  userId: string
): Promise<RepositoryResult<UserPreferencesRow | null>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { data: null, error: GENERIC_ERROR };
  return { data: (data as UserPreferencesRow | null) ?? null, error: null };
}

export async function upsertPreferences(
  userId: string,
  values: Omit<UserPreferencesRow, 'user_id' | 'created_at' | 'updated_at'>
): Promise<RepositoryResult<true>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...values }, { onConflict: 'user_id' });

  if (error) return { data: null, error: GENERIC_ERROR };
  return { data: true, error: null };
}

/* ------------------------------------------------------------------ */
/* Comparison history                                                 */
/* ------------------------------------------------------------------ */

export async function recordComparison(
  userId: string,
  propertyIds: string[]
): Promise<RepositoryResult<true>> {
  const supabase = await client();
  if (!supabase || propertyIds.length === 0) return { data: true, error: null };

  // One set_id groups the properties compared together, so history can be
  // replayed as sets rather than as an unordered stream.
  const setId = crypto.randomUUID();
  const { error } = await supabase.from('comparison_history').insert(
    propertyIds.map((propertyId) => ({
      user_id: userId,
      property_id: propertyId,
      set_id: setId,
    }))
  );

  if (error) return { data: null, error: GENERIC_ERROR };

  await recordActivity(userId, 'compared', propertyIds[0] ?? null);
  return { data: true, error: null };
}

/* ------------------------------------------------------------------ */
/* Activity log                                                       */
/* ------------------------------------------------------------------ */

/**
 * Append an activity row.
 *
 * Stores no financial values: only which property was acted on and when. A
 * failure here must never break the action the user actually asked for, so
 * errors are swallowed by design.
 */
export async function recordActivity(
  userId: string,
  action: ActivityAction,
  propertyId: string | null
): Promise<void> {
  const supabase = await client();
  if (!supabase) return;

  await supabase.from('activity_log').insert({ user_id: userId, action, property_id: propertyId });
}

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  propertyId: string | null;
  createdAt: string;
}

export async function listActivity(
  userId: string,
  limit = 20
): Promise<RepositoryResult<ActivityEntry[]>> {
  const supabase = await client();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, property_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: GENERIC_ERROR };

  return {
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      action: row.action as ActivityAction,
      propertyId: (row.property_id as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/* Bulk deletion                                                      */
/* ------------------------------------------------------------------ */

/**
 * Delete all of the current user's private data.
 *
 * Calls the `delete_my_data()` SQL function, which is SECURITY INVOKER: RLS
 * still applies inside it, so it can only ever delete the caller's own rows.
 */
export async function deleteAllMyData(userId: string): Promise<RepositoryResult<true>> {
  const supabase = await client();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  const { error } = await supabase.rpc('delete_my_data');

  if (error) {
    // Fall back to explicit deletes in case the function was not installed.
    const tables = [
      'saved_properties',
      'comparison_history',
      'activity_log',
      'saved_scenarios',
      'user_preferences',
    ] as const;

    for (const table of tables) {
      const result = await supabase.from(table).delete().eq('user_id', userId);
      if (result.error) return { data: null, error: GENERIC_ERROR };
    }
  }

  return { data: true, error: null };
}

/* ------------------------------------------------------------------ */
/* Administrator check                                                */
/* ------------------------------------------------------------------ */

/**
 * Ask the database whether the current user is an administrator.
 *
 * This is a convenience for rendering, NOT the security boundary. Every admin
 * write is separately authorised by RLS on `public.properties`, so hiding or
 * showing this UI changes nothing about what a user can actually do.
 */
export async function checkIsAdmin(): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return data === true;
}
