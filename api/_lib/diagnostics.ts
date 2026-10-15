/**
 * Diagnosis helpers for upstream (Gemini) failures.
 *
 * The goal is narrow: when the provider rejects a request, give the operator
 * enough detail in the SERVER TERMINAL to fix it, without ever putting that
 * detail in front of a user or into a log line alongside a secret.
 *
 * Guarantees upheld here:
 *  - the API key is redacted from anything we log, even if the provider echoes
 *    it back in an error message;
 *  - request headers and the request payload are never logged;
 *  - logged fields are individually length-capped;
 *  - the browser still receives only the safe, generic `ProviderOutcome.message`.
 */

/** Minimal logger surface, so tests can capture output without touching console. */
export interface DiagnosticsLogger {
  warn: (message: string) => void;
}

/** Redacted stand-in for any secret we detect in a string. */
export const REDACTED = '[redacted]';

/**
 * Replace every supplied secret with a placeholder.
 *
 * Applied to any upstream text before it is logged. The API key travels in a
 * header, so it should never appear in a body — this is defence in depth for
 * the case where an error message quotes the credential back at us.
 */
export function redactSecrets(text: string, secrets: Array<string | undefined> = []): string {
  let result = text;

  for (const secret of secrets) {
    const trimmed = secret?.trim();
    // Ignore very short values: replacing them would mangle ordinary words.
    if (!trimmed || trimmed.length < 8) continue;
    result = result.split(trimmed).join(REDACTED);
  }

  return result;
}

/** Google's error envelope: { "error": { "code", "message", "status", "details" } } */
export interface ProviderErrorDetails {
  /** HTTP status we received. */
  httpStatus: number;
  /** Google's numeric error code, if present. */
  code: number | null;
  /** Google's grpc-style status, e.g. "INVALID_ARGUMENT" or "PERMISSION_DENIED". */
  status: string | null;
  /**
   * Google's machine-readable reason from error.details[].reason, e.g.
   * "API_KEY_INVALID". This is the most useful field for diagnosis because it
   * distinguishes causes that share an HTTP status.
   */
  reason: string | null;
  /** Sanitised, length-capped error message. */
  message: string | null;
}

export interface ProviderDiagnostics extends ProviderErrorDetails {
  /** The model we actually asked for. */
  model: string;
}

/** Per-field caps so one hostile or verbose field cannot flood the log. */
const MAX_STATUS_CHARS = 60;
const MAX_MESSAGE_CHARS = 300;

function clip(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/**
 * Parse an upstream error body into safe, loggable fields.
 *
 * Handles Google's JSON envelope, a bare JSON object that uses `message`, and
 * non-JSON bodies (for example an HTML error page from an intermediary) by
 * falling back to a clipped plain-text excerpt. Never throws.
 */
export function sanitizeProviderError(
  httpStatus: number,
  rawBody: string,
  secrets: Array<string | undefined> = []
): ProviderErrorDetails {
  const details: ProviderErrorDetails = {
    httpStatus,
    code: null,
    status: null,
    reason: null,
    message: null,
  };

  const safeBody = redactSecrets(rawBody ?? '', secrets).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(safeBody);
  } catch {
    // Not JSON: keep a clipped excerpt so an HTML/proxy error is still visible.
    details.message = safeBody ? clip(safeBody, MAX_MESSAGE_CHARS) : null;
    return details;
  }

  // Google sometimes wraps the envelope in a single-element array
  // (observed: [{"error":{...}}]), so unwrap before reading.
  if (Array.isArray(parsed) && parsed.length === 1) {
    parsed = parsed[0];
  }

  if (!isRecord(parsed)) {
    // A multi-element array or a scalar carries no envelope we recognise.
    details.message = safeBody ? clip(safeBody, MAX_MESSAGE_CHARS) : null;
    return details;
  }

  const error = isRecord(parsed.error) ? parsed.error : parsed;

  if (typeof error.code === 'number' && Number.isFinite(error.code)) {
    details.code = error.code;
  }

  if (typeof error.status === 'string' && error.status.trim()) {
    details.status = clip(error.status, MAX_STATUS_CHARS);
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    details.message = clip(error.message, MAX_MESSAGE_CHARS);
  }

  // error.details is an array of typed detail objects; the machine-readable
  // reason lives in the first one that carries it.
  if (Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (!isRecord(detail)) continue;
      const reason = typeof detail.reason === 'string' ? detail.reason.trim() : '';
      if (reason) {
        details.reason = clip(reason, MAX_STATUS_CHARS);
        break;
      }
    }
  }

  if (details.message || details.status || details.code !== null || details.reason) {
    return details;
  }

  // Parsed as JSON but carried no usable fields. Do not dump the raw JSON into
  // the log: state plainly that there was nothing to read.
  details.message = 'no error details in the response body';
  return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Emit one structured diagnostic line.
 *
 * Logged fields: HTTP status, Google's error code, Google's error status,
 * the sanitised message, and the configured model. Nothing else — no headers,
 * no request payload, no key.
 */
export function logProviderDiagnostics(
  diagnostics: ProviderDiagnostics,
  logger: DiagnosticsLogger
): void {
  const parts = [
    `http_status=${diagnostics.httpStatus}`,
    `provider_code=${diagnostics.code ?? 'n/a'}`,
    `provider_status=${diagnostics.status ?? 'n/a'}`,
    `provider_reason=${diagnostics.reason ?? 'n/a'}`,
    `provider_message="${diagnostics.message ?? 'n/a'}"`,
    `model=${diagnostics.model}`,
  ];

  logger.warn(
    `[ai-assistant] Gemini request rejected. ${parts.join(' ')}\n` +
      '             Check the server-side GEMINI_API_KEY and that GEMINI_MODEL is ' +
      'available to your key. The browser only receives a generic message.'
  );
}
