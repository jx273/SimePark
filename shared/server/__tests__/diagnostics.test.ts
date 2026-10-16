import { describe, it, expect, vi } from 'vitest';
import {
  REDACTED,
  logProviderDiagnostics,
  redactSecrets,
  sanitizeProviderError,
} from '../diagnostics';

const SECRET = 'AIzaSyFAKEKEYFORTESTING1234567890';

describe('redactSecrets', () => {
  it('replaces the supplied secret with a placeholder', () => {
    const result = redactSecrets(`key ${SECRET} failed`, [SECRET]);

    expect(result).not.toContain(SECRET);
    expect(result).toContain(REDACTED);
  });

  it('replaces every occurrence', () => {
    const result = redactSecrets(`${SECRET} and ${SECRET}`, [SECRET]);
    expect(result.match(/\[redacted\]/g)).toHaveLength(2);
  });

  it('ignores missing, empty, and very short values', () => {
    expect(redactSecrets('some text', [undefined, '', '   ', 'ab'])).toBe('some text');
  });

  it('tolerates surrounding whitespace on the secret', () => {
    const result = redactSecrets(`x${SECRET}x`, [`  ${SECRET}  `]);
    expect(result).toBe(`x${REDACTED}x`);
  });
});

describe('sanitizeProviderError', () => {
  it("parses Google's error envelope", () => {
    const details = sanitizeProviderError(
      400,
      JSON.stringify({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
        },
      })
    );

    expect(details.httpStatus).toBe(400);
    expect(details.code).toBe(400);
    expect(details.status).toBe('INVALID_ARGUMENT');
    expect(details.message).toBe('API key not valid. Please pass a valid API key.');
  });

  it('unwraps an array-wrapped envelope and reads error.details[].reason', () => {
    // This is the exact shape Google returned in practice for an invalid key:
    // the whole envelope arrives inside a single-element array.
    const details = sanitizeProviderError(
      400,
      JSON.stringify([
        {
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'API_KEY_INVALID',
                domain: 'googleapis.com',
                metadata: { service: 'generativelanguage.googleapis.com' },
              },
            ],
          },
        },
      ])
    );

    expect(details.code).toBe(400);
    expect(details.status).toBe('INVALID_ARGUMENT');
    expect(details.reason).toBe('API_KEY_INVALID');
    expect(details.message).toBe('API key not valid. Please pass a valid API key.');
  });

  it('does not dump raw JSON when the body has no usable fields', () => {
    const details = sanitizeProviderError(400, JSON.stringify([1, 2, 3]));

    expect(details.message).toBe('[1,2,3]');
    expect(details.code).toBeNull();
    expect(details.reason).toBeNull();
  });

  it('handles a top-level error object without the wrapper', () => {
    const details = sanitizeProviderError(
      403,
      JSON.stringify({ code: 403, status: 'PERMISSION_DENIED', message: 'denied' })
    );

    expect(details.code).toBe(403);
    expect(details.status).toBe('PERMISSION_DENIED');
    expect(details.message).toBe('denied');
  });

  it('reports missing fields as null rather than inventing them', () => {
    const details = sanitizeProviderError(500, JSON.stringify({ error: {} }));

    expect(details.code).toBeNull();
    expect(details.status).toBeNull();
    expect(details.reason).toBeNull();
    expect(details.message).toBe('no error details in the response body');
  });

  it('falls back to a clipped excerpt for a non-JSON body', () => {
    const details = sanitizeProviderError(
      502,
      '<html><body><h1>502 Bad Gateway</h1></body></html>'
    );

    expect(details.code).toBeNull();
    expect(details.status).toBeNull();
    expect(details.message).toContain('502 Bad Gateway');
  });

  it('never throws on malformed input', () => {
    expect(() => sanitizeProviderError(400, 'not json at all')).not.toThrow();
    expect(() => sanitizeProviderError(400, '')).not.toThrow();
    expect(() => sanitizeProviderError(400, '[]')).not.toThrow();
    expect(() => sanitizeProviderError(400, 'null')).not.toThrow();
    expect(() => sanitizeProviderError(400, undefined as unknown as string)).not.toThrow();
  });

  it('caps an oversized message so a verbose body cannot flood the log', () => {
    const details = sanitizeProviderError(
      400,
      JSON.stringify({ error: { code: 400, message: 'x'.repeat(5000) } })
    );

    expect(details.message!.length).toBeLessThanOrEqual(301);
    expect(details.message).toMatch(/…$/);
  });

  it('collapses newlines so one diagnostic stays on one line', () => {
    const details = sanitizeProviderError(
      400,
      JSON.stringify({ error: { message: 'line one\nline two' } })
    );

    expect(details.message).toBe('line one line two');
  });

  it('redacts the api key if the provider echoes it back', () => {
    const details = sanitizeProviderError(
      400,
      JSON.stringify({ error: { message: `API key ${SECRET} is invalid` } }),
      [SECRET]
    );

    expect(details.message).not.toContain(SECRET);
    expect(details.message).toContain(REDACTED);
  });
});

describe('logProviderDiagnostics', () => {
  it('logs status, code, provider status, sanitised message and model', () => {
    const logger = { warn: vi.fn() };

    logProviderDiagnostics(
      {
        httpStatus: 400,
        code: 400,
        status: 'INVALID_ARGUMENT',
        reason: 'API_KEY_INVALID',
        message: 'API key not valid',
        model: 'gemini-3.5-flash',
      },
      logger
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const line = logger.warn.mock.calls[0][0];
    expect(line).toContain('http_status=400');
    expect(line).toContain('provider_code=400');
    expect(line).toContain('provider_status=INVALID_ARGUMENT');
    expect(line).toContain('provider_reason=API_KEY_INVALID');
    expect(line).toContain('provider_message="API key not valid"');
    expect(line).toContain('model=gemini-3.5-flash');
  });

  it('renders absent fields as n/a', () => {
    const logger = { warn: vi.fn() };

    logProviderDiagnostics(
      { httpStatus: 503, code: null, status: null, reason: null, message: null, model: 'm' },
      logger
    );

    const line = logger.warn.mock.calls[0][0];
    expect(line).toContain('provider_code=n/a');
    expect(line).toContain('provider_status=n/a');
    expect(line).toContain('provider_reason=n/a');
    expect(line).toContain('provider_message="n/a"');
  });

  it('never logs a key value, headers, or request payload text', () => {
    const logger = { warn: vi.fn() };

    logProviderDiagnostics(
      {
        httpStatus: 400,
        code: 400,
        status: 'INVALID_ARGUMENT',
        reason: 'API_KEY_INVALID',
        message: 'bad request',
        model: 'gemini-3.5-flash',
      },
      logger
    );

    const line = logger.warn.mock.calls[0][0];
    expect(line).not.toContain(SECRET);
    expect(line).not.toMatch(/x-goog-api-key/i);
    expect(line).not.toMatch(/system_instruction/);
    expect(line).not.toMatch(/monthlyIncome/);
  });
});
