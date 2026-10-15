/**
 * Vite dev middleware that mounts the /api/assistant handler locally.
 *
 * Why this exists: a Vite dev server does not execute Vercel Serverless
 * Functions. Rather than asking you to run a second process, this plugin calls
 * the exact same handler the serverless function calls, so local development
 * matches production while staying a single command (`npm run dev`).
 *
 * It also loads non-VITE_ environment variables from `.env*` into process.env
 * so GEMINI_API_KEY is available server-side during local development. Vite
 * only exposes VITE_-prefixed vars to the browser, so the key never reaches
 * client code.
 */

import type { Connect, Plugin, ResolvedConfig } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAssistantRequest } from '../api/_lib/handler.js';

const ENDPOINT = '/api/assistant';

/** Read the raw request body as a UTF-8 string. */
function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Translate a Node request into a standard Web Request for the shared handler. */
async function toWebRequest(req: IncomingMessage, url: string): Promise<Request> {
  const method = req.method ?? 'GET';
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);
  return new Request(url, { method, headers, body });
}

/** Write a standard Web Response back to the Node response. */
async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

export default function assistantDevMiddleware(): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: 'simepark-assistant-dev-middleware',

    configResolved(config) {
      resolvedConfig = config;

      // Load .env, .env.local, .env.development, ... including non-VITE_ vars.
      const env = loadEnv(config.mode, config.envDir ?? process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      if (process.env.GEMINI_API_KEY?.trim()) {
        config.logger.info(
          `  ➜  AI assistant:  ${ENDPOINT} (Gemini, key detected server-side)`
        );
      } else if (config.mode !== 'test') {
        // Stay quiet under Vitest, which loads this config but serves no requests.
        config.logger.warn(
          `  ➜  AI assistant:  ${ENDPOINT} mounted, but GEMINI_API_KEY is not set.\n` +
            `      The chat panel will explain this instead of failing. See .env.example.`
        );
      }
    },

    configureServer(server) {
      const middleware: Connect.NextHandleFunction = (req, res, next) => {
        const requestUrl = req.url ?? '';
        const path = requestUrl.split('?')[0];

        if (path !== ENDPOINT) {
          next();
          return;
        }

        const host = req.headers.host ?? 'localhost';
        const url = `http://${host}${requestUrl}`;
        const mode = resolvedConfig?.mode ?? 'development';

        void (async () => {
          try {
            const webRequest = await toWebRequest(req, url);
            const response = await handleAssistantRequest(webRequest);
            await writeWebResponse(res, response);
          } catch {
            // Never log the request body or anything derived from the key.
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(
              JSON.stringify({
                ok: false,
                reason: 'provider_error',
                message:
                  'The local assistant endpoint hit an unexpected error. Check the terminal for details.',
              })
            );
            server.config.logger.error(
              `[ai-assistant] Unhandled error while serving ${ENDPOINT} (${mode}).`
            );
          }
        })();
      };

      server.middlewares.use(middleware);
    },
  };
}
