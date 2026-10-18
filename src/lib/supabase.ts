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
 * runs in "no database" mode with the supplied local source fixture rather than
 * throwing on startup. Every consumer must handle `isSupabaseConfigured === false`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

function readEnv(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reduce whatever is configured to the Supabase PROJECT ROOT URL.
 *
 * This is the root cause of a real production bug: `VITE_SUPABASE_URL` was set to
 * `https://<ref>.supabase.co/rest/v1/`. `createClient()` appends `/auth/v1` for
 * authentication and `/rest/v1` for data, so the configured suffix produced
 * `https://<ref>.supabase.co/rest/v1/auth/v1/signup` — a 404 that made every
 * registration attempt fail.
 *
 * The Supabase client requires the project root. Normalising here means the app
 * is correct even if an operator pastes the REST or Auth endpoint by mistake, and
 * it is why this class of misconfiguration cannot silently break sign-up again.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Strip any known API path suffix (with or without a trailing slash) and any
  // trailing slashes, leaving the origin.
  return trimmed
    .replace(/\/(rest|auth|storage|realtime|functions)\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

/** True when the configured value must be corrected (used for a clear warning). */
export function looksLikeApiEndpoint(raw: string): boolean {
  return /\/(rest|auth|storage|realtime|functions)\/v1\/?$/i.test(raw.trim());
}

const rawUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const url = normalizeSupabaseUrl(rawUrl);
const publishableKey = readEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

if (looksLikeApiEndpoint(rawUrl)) {
  // Names the variable, never its value. Surfaces a fixable misconfiguration
  // instead of letting every auth request 404.
  console.warn(
    '[simepark] VITE_SUPABASE_URL should be the project root (https://<ref>.supabase.co), ' +
      'not an API endpoint. The "/rest/v1" style suffix has been ignored; correct the value ' +
      'in your environment and rebuild.'
  );
}

/**
 * True when the app has enough configuration to talk to Supabase.
 *
 * When false the app still works: sign-in and saving are unavailable, and local
 * development may use the supplied four-record fixture as its catalogue.
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
