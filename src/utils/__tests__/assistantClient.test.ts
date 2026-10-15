import { describe, it, expect, vi, afterEach } from 'vitest';
import { askAssistant, ASSISTANT_ENDPOINT } from '../assistantClient';
import { ASSISTANT_LIMITS } from '../../types/assistant';
import type { AssistantContext } from '../../types/assistant';

const context: AssistantContext = {
  hasAffordabilityResult: false,
  inputs: null,
  affordability: null,
  properties: [],
  totalListedProperties: 0,
  selectedProperty: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('askAssistant', () => {
  it('posts to our own endpoint, never to the provider', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, reply: 'Hello', model: 'test-model' })
    );
    vi.stubGlobal('fetch', fetchMock);

    await askAssistant('hi', [], context);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ASSISTANT_ENDPOINT);
    expect(url).not.toContain('generativelanguage');
    expect(init.method).toBe('POST');
    // No key is sent from the browser; the server holds it.
    expect(JSON.stringify(init.headers)).not.toMatch(/api[-_]?key/i);
  });

  it('returns the reply on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: true, reply: 'RM 400,000', model: 'm' }))
    );

    const result = await askAssistant('hi', [], context);
    expect(result).toEqual({ ok: true, reply: 'RM 400,000', model: 'm' });
  });

  it('passes through the friendly server error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ok: false,
          reason: 'not_configured',
          message: 'not configured yet',
        })
      )
    );

    const result = await askAssistant('hi', [], context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_configured');
    expect(result.message).toBe('not configured yet');
  });

  it('explains an unexpected response shape instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ unexpected: true })));

    const result = await askAssistant('hi', [], context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('/api/assistant');
  });

  it('handles a non-JSON response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>404</html>', { status: 404 }))
    );

    const result = await askAssistant('hi', [], context);
    expect(result.ok).toBe(false);
  });

  it('handles a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const result = await askAssistant('hi', [], context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
    expect(result.message).toMatch(/could not reach/i);
  });

  it('reports a timeout as a friendly message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      )
    );

    const result = await askAssistant('hi', [], context, { timeoutMs: 20 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/too long/i);
  });

  it('truncates an over-long message and trims history before sending', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, reply: 'ok', model: 'm' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const history = Array.from({ length: 40 }, (_, index) => ({
      role: 'user' as const,
      content: `turn ${index}`,
    }));

    await askAssistant('x'.repeat(ASSISTANT_LIMITS.maxMessageLength + 500), history, context);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.message.length).toBe(ASSISTANT_LIMITS.maxMessageLength);
    expect(body.history).toHaveLength(ASSISTANT_LIMITS.maxHistoryMessages);
  });
});
