/**
 * Supabase browser client.
 *
 * SECURITY
 *  - Only the PUBLISHABLE key is used here. It is designed to be public: it
 *    identifies the project and relies on Row Level Security to protect data.
 *  - A secret key / legacy service_role key must NEVER be placed here or in any
 *    `VITE_*` variable. Those keys bypass RLS entirely. Nothing in this project
 *    reads or needs one, and there is no server route that uses one.
 *  - Values come from `import.meta.env`, which Vite inlines at build time. They
 *    are intentionally public artefacts; the README states this clearly.
 *
 * The client is created lazily and only when both values are present, so the app
 * runs in "no database" mode with the bundled demo dataset rather than throwing
 * on startup. Every consumer must handle `isSupabaseConfigured === false`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

function readEnv(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const url = readEnv(import.meta.env.VITE_SUPABASE_URL);
const publishableKey = readEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

/**
 * True when the app has enough configuration to talk to Supabase.
 *
 * When false the app still works: sign-in and saving are unavailable, and the
 * property catalogue falls back to the bundled demonstration dataset.
 */
export const isSupabaseConfigured = url.length > 0 && publishableKey.length > 0;

/**
 * Decode the `role` claim from a legacy Supabase JWT key, or null.
 *
 * Legacy anon and service_role keys are JWTs whose payload carries
 * `{"role":"anon"}` or `{"role":"service_role"}`. The claim has to be DECODED:
 * base64url encodes "service_role" as "c2VydmljZV9yb2xl", so searching the raw
 * key text for the literal string would never match. Returns null for anything
 * that is not a decodable three-part JWT.
 */
export function readJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;

  try {
    // atob is available in browsers and in the Node versions this project targets.
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload === 'object' && payload !== null && 'role' in payload) {
      const role = (payload as { role?: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect a key that must never be used in a browser: a modern secret key, a bare
 * service_role value, or a legacy JWT carrying the service_role claim. Those
 * bypass Row Level Security completely, so shipping one would expose every user's
 * data.
 *
 * Not throwing is deliberate — the app must still run — but the key is refused
 * and a clear error is logged.
 */
export function isSecretKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith('sb_secret_') || key.startsWith('service_role')) return true;
  return readJwtRole(key) === 'service_role';
}

export const looksLikeSecretKey = isSecretKey(publishableKey);

export const supabaseAvailable = isSupabaseConfigured && !looksLikeSecretKey;

if (isSupabaseConfigured && looksLikeSecretKey) {
  // Deliberately does not print the value.
  console.error(
    '[simepark] VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret or service_role key. ' +
      'Database access has been disabled. Use the publishable/anon key for the browser and ' +
      'keep secret keys server-side only. See README.'
  );
}

let clientPromise: Promise<SupabaseClient<Database>> | null = null;

/**
 * The shared browser client, or null when not configured.
 *
 * The Supabase library is imported DYNAMICALLY. It is roughly 227 kB, and a guest
 * who only browses properties and uses the calculator should never download it —
 * auth and saving are optional extras. Vite emits it as a separate chunk that is
 * fetched on first use.
 *
 * Session handling is left at the defaults (persist to localStorage, refresh in
 * the background, detect the session in the URL) because that is exactly the
 * behaviour required: sessions survive a page reload, and the email-confirmation
 * and password-reset links work, because Supabase returns those tokens in the URL
 * fragment.
 */
export async function getSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  if (!supabaseAvailable) return null;

  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient<Database>(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    );
  }

  return clientPromise;
}

/** The configured project URL, or null. Safe to display; it is public. */
export function supabaseProjectUrl(): string | null {
  return supabaseAvailable ? url : null;
}
