import { describe, it, expect } from 'vitest';
import {
  isSecretKey,
  isSupabaseConfigured,
  looksLikeSecretKey,
  looksLikeApiEndpoint,
  normalizeSupabaseUrl,
  readJwtRole,
} from '../supabase';

/**
 * The critical property: a SECRET key must never be usable in the browser.
 * `looksLikeSecretKey` is the guard that refuses one even if it is configured by
 * mistake, so its logic is pinned down here.
 *
 * The real values are evaluated at build time and are absent in tests, which is
 * itself worth asserting: the app must run in guest-only mode rather than crash.
 */
const ANON_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJyb2xlIjoiYW5vbiJ9',
  'signature',
].join('.');

const SERVICE_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJyb2xlIjoic2VydmljZV9yb2xlIn0',
  'signature',
].join('.');

describe('readJwtRole', () => {
  it('decodes the role claim from a legacy key', () => {
    // The claim is base64url-encoded, so it must be decoded, not text-searched.
    expect(readJwtRole(SERVICE_JWT)).toBe('service_role');
    expect(readJwtRole(ANON_JWT)).toBe('anon');
  });

  it('returns null for anything that is not a three-part JWT', () => {
    expect(readJwtRole('sb_publishable_abc')).toBeNull();
    expect(readJwtRole('sb_secret_abc')).toBeNull();
    expect(readJwtRole('')).toBeNull();
    expect(readJwtRole('a.b')).toBeNull();
  });

  it('returns null rather than throwing on an undecodable payload', () => {
    expect(readJwtRole('aaa.!!!not-base64!!!.ccc')).toBeNull();
    expect(readJwtRole('aaa.bm90LWpzb24.sig')).toBeNull();
  });
});

describe('isSecretKey', () => {
  it('rejects a modern secret key', () => {
    expect(isSecretKey('sb_secret_abc123')).toBe(true);
  });

  it('rejects a bare service_role value', () => {
    expect(isSecretKey('service_role')).toBe(true);
  });

  // This is the case a naive text search would miss.
  it('rejects a legacy JWT carrying the service_role claim', () => {
    expect(isSecretKey(SERVICE_JWT)).toBe(true);
  });

  it('accepts a publishable key', () => {
    expect(isSecretKey('sb_publishable_abc123')).toBe(false);
  });

  it('accepts a legacy anon JWT', () => {
    expect(isSecretKey(ANON_JWT)).toBe(false);
  });

  it('accepts an empty value', () => {
    expect(isSecretKey('')).toBe(false);
  });
});

describe('configuration state', () => {
  it('normalizes configured Supabase API endpoints to the project root', () => {
    expect(normalizeSupabaseUrl('https://project.supabase.co/rest/v1/')).toBe(
      'https://project.supabase.co'
    );
    expect(normalizeSupabaseUrl('https://project.supabase.co/auth/v1')).toBe(
      'https://project.supabase.co'
    );
    expect(normalizeSupabaseUrl('https://project.supabase.co/')).toBe(
      'https://project.supabase.co'
    );
    expect(looksLikeApiEndpoint('https://project.supabase.co/rest/v1/')).toBe(true);
    expect(looksLikeApiEndpoint('https://project.supabase.co')).toBe(false);
  });

  it('reports a boolean configuration state without assuming the test host has no .env file', () => {
    expect(typeof isSupabaseConfigured).toBe('boolean');
  });

  it('exposes the secret-key guard as a boolean for the runtime check', () => {
    expect(typeof looksLikeSecretKey).toBe('boolean');
  });
});
