/**
 * Browser-side caller for POST /api/assistant.
 *
 * This never touches the Gemini API directly and never sees the API key: it
 * only talks to our own server endpoint.
 */

import {
  ASSISTANT_LIMITS,
  type AssistantApiResponse,
  type AssistantContext,
  type AssistantMessage,
} from '../types/assistant';

export const ASSISTANT_ENDPOINT = '/api/assistant';

/** How long the browser waits before giving up on our own endpoint. */
export const CLIENT_TIMEOUT_MS = 30_000;

export type AssistantCallResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; reason: string; message: string };

function isApiResponse(value: unknown): value is AssistantApiResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true) return typeof candidate.reply === 'string';
  if (candidate.ok === false) return typeof candidate.message === 'string';
  return false;
}

/**
 * Send one question. Returns a friendly failure instead of throwing, so the UI
 * can always render an explanation.
 *
 * There is deliberately no retry logic: repeated automatic attempts would burn
 * through free-tier quota.
 */
export async function askAssistant(
  message: string,
  history: AssistantMessage[],
  context: AssistantContext,
  options: { timeoutMs?: number } = {}
): Promise<AssistantCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? CLIENT_TIMEOUT_MS
  );

  try {
    const response = await fetch(ASSISTANT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.slice(0, ASSISTANT_LIMITS.maxMessageLength),
        history: history.slice(-ASSISTANT_LIMITS.maxHistoryMessages),
        context,
      }),
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!isApiResponse(payload)) {
      return {
        ok: false,
        reason: 'unavailable',
        message:
          'The assistant endpoint returned an unexpected response. If you are viewing a static build, the /api/assistant server function is not running — see the README.',
      };
    }

    if (payload.ok) {
      return { ok: true, reply: payload.reply, model: payload.model };
    }

    return { ok: false, reason: payload.reason, message: payload.message };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: 'unavailable',
      message: aborted
        ? 'That took too long to come back. Please try a shorter question.'
        : 'Could not reach the assistant endpoint. Check that the dev server or deployed function is running.',
    };
  } finally {
    clearTimeout(timer);
  }
}
