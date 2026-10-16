/**
 * Server configuration and runtime-environment resolution.
 *
 * Why this exists: Cloudflare Pages Functions do NOT expose secrets through
 * `process.env`. They arrive on the function context as `context.env`, populated
 * from the project's Variables and Secrets. Node (used by the local Vite dev
 * middleware and by unit tests) exposes them through `process.env`.
 *
 * The core handler therefore never reads a global itself. It receives an `env`
 * record that the runtime-specific adapter supplies, so the same code is correct
 * in both places without branching on the platform.
 *
 * Secret handling rules enforced here:
 *  - values are only ever read, never logged or returned to the browser;
 *  - a missing key is reported as "not configured", never echoed;
 *  - whitespace-only values count as missing.
 */

import { DEFAULT_GEMINI_MODEL } from '../contract/assistant.js';

/** A bag of runtime bindings: Cloudflare `context.env`, or `process.env`. */
export type RuntimeEnv = Record<string, unknown>;

export interface ServerConfig {
  apiKey: string;
  model: string;
  isConfigured: boolean;
}

function readString(env: RuntimeEnv | undefined, key: string): string {
  const raw = env?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Resolve server configuration from an explicit binding bag.
 *
 * `env` must be supplied by the adapter. There is deliberately no implicit
 * fallback to a global here: that is what made the previous Vercel-shaped code
 * unsafe to reuse on Cloudflare.
 */
export function resolveServerConfig(env: RuntimeEnv | undefined): ServerConfig {
  const apiKey = readString(env, 'GEMINI_API_KEY');
  const model = readString(env, 'GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  return { apiKey, model, isConfigured: apiKey.length > 0 };
}

/**
 * Read the Node `process.env` bag when one is available.
 *
 * Used by the local dev middleware and tests only. Cloudflare adapters pass
 * `context.env` instead and never reach this function.
 */
export function readNodeEnv(): RuntimeEnv {
  const proc = (globalThis as { process?: { env?: RuntimeEnv } }).process;
  return proc?.env ?? {};
}

/**
 * Build an `env` bag from an explicit override, falling back to Node's
 * environment when present. Test-only convenience so existing unit tests can
 * keep injecting an apiKey/model directly.
 */
export function mergeEnv(
  explicit: RuntimeEnv | undefined,
  fallback: RuntimeEnv | undefined
): RuntimeEnv {
  return { ...(fallback ?? {}), ...(explicit ?? {}) };
}
