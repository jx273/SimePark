/**
 * Vercel Serverless Function — POST /api/assistant
 *
 * This is the production deployment adapter. It is intentionally thin: all
 * logic, validation, prompt construction, and provider handling live in
 * `./_lib/handler.ts` so the local dev server and production behave identically.
 *
 * The Gemini API key is read inside `./_lib/handler.ts` from
 * `process.env.GEMINI_API_KEY`, which exists only in the server runtime. It is
 * never inlined into the browser bundle because nothing under `src/` imports it.
 *
 * Local development does NOT need Vercel: `npm run dev` mounts the same handler
 * as Vite middleware. Use `npx vercel dev` only if you want to exercise the
 * real serverless runtime locally.
 */

import { handleAssistantRequest } from './_lib/handler.js';

/** Keep a hung request from occupying the function for the full platform maximum. */
export const config = {
  maxDuration: 30,
};

export default async function assistant(request: Request): Promise<Response> {
  return handleAssistantRequest(request);
}
