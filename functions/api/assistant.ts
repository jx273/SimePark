/**
 * Cloudflare Pages Function — POST /api/assistant
 *
 * This is the production adapter. It is intentionally thin: all validation,
 * prompt construction, provider handling, and diagnostic logic live in
 * `shared/server/handler.ts`, which the local Vite dev middleware also calls, so
 * local development and production cannot drift apart.
 *
 * Cloudflare specifics handled here:
 *  - Secrets arrive on `context.env`, NOT on `process.env`. They are passed
 *    straight into the handler, which never reads a global itself.
 *  - `GEMINI_API_KEY` must be configured as an encrypted Secret in the Pages
 *    project (Workers & Pages > project > Settings > Variables and Secrets).
 *    It is never bundled: nothing under `src/` imports this file.
 *
 * Single entry point: `onRequest` handles every method, so the handler's own
 * POST-only enforcement (and its structured 405) is what callers see. Adding a
 * separate `onRequestGet` would bypass that validation.
 *
 * Local development does NOT need wrangler: `npm run dev` mounts the same
 * handler as Vite middleware. Use `npm run cf:dev` only to exercise the real
 * Workers runtime locally.
 *
 * Note: this file deliberately contains no `runtime` export. Cloudflare Pages
 * Functions always run on the Workers runtime; specifying a Node.js runtime here
 * would be invalid.
 */

import { handleAssistantRequest } from '../../shared/server/handler.js';

interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleAssistantRequest(context.request, { env: context.env });
}
