/**
 * Core, platform-agnostic handler for POST /api/assistant.
 *
 * Written once against the Web `Request`/`Response` standard so the same code
 * runs in every runtime without duplication:
 *  - in production, as a Cloudflare Pages Function (functions/api/assistant.ts)
 *  - locally, mounted as Vite dev middleware (server/assistantDevMiddleware.ts)
 *
 * Security notes:
 *  - GEMINI_API_KEY arrives as a runtime binding and is never returned or logged.
 *  - Nothing in this file is imported by browser code except the request and
 *    response *types*, which contain no secrets.
 *  - The client's context is untrusted: every field is validated and rebuilt
 *    before it reaches the model, and size is capped.
 */

import {
  ASSISTANT_LIMITS,
  DEFAULT_GEMINI_MODEL,
  type AssistantApiResponse,
  type AssistantContext,
  type AssistantContextAffordability,
  type AssistantContextInputs,
  type AssistantContextProperty,
  type AssistantErrorReason,
  type AssistantLanguage,
  type AssistantMessage,
  type AssistantRequestPayload,
} from '../contract/assistant.js';
import { buildSystemInstruction } from './prompt.js';
import {
  mergeEnv,
  readNodeEnv,
  resolveServerConfig,
  type RuntimeEnv,
} from './config.js';
import {
  logProviderDiagnostics,
  sanitizeProviderError,
  type DiagnosticsLogger,
  type ProviderErrorDetails,
} from './diagnostics.js';

/** The Gemini Interactions endpoint. Verified against the published API reference. */
export const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

const MAX_TEXT_FIELD = 200;
const VALID_LIMITING_FACTORS = ['repayment', 'downPayment', 'none'] as const;
const VALID_BINDING_CONSTRAINTS = [
  'repayment',
  'downPayment',
  'preferredMaxMonthlyPayment',
  'none',
] as const;
const VALID_BUDGET_STATUSES = [
  'affordable',
  'overMonthlyBudget',
  'insufficientDownPayment',
] as const;

/* ------------------------------------------------------------------ */
/* Environment                                                        */
/* ------------------------------------------------------------------ */

export interface HandlerOptions {
  /**
   * Runtime bindings for this request.
   *
   * Cloudflare Pages Functions pass `context.env`; the local dev middleware and
   * tests pass `process.env`. This is the ONLY source of the Gemini credentials:
   * the handler never reads a global itself, because Cloudflare does not expose
   * secrets through `process.env`.
   */
  env?: RuntimeEnv;
  /** Test-only override for the API key. Takes precedence over `env`. */
  apiKey?: string;
  /** Test-only override for the model. Takes precedence over `env`. */
  model?: string;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Injectable timeout in ms (tests). */
  timeoutMs?: number;
  /**
   * Where upstream-failure diagnostics go. Defaults to `console` (the server
   * terminal); tests inject a capturing logger.
   */
  logger?: DiagnosticsLogger;
}

/**
 * Read configuration from the supplied runtime bindings.
 *
 * Test-only `apiKey`/`model` options override the bindings. Node's `process.env`
 * is merged in as a fallback so the local dev middleware and tests keep working
 * without threading an env object everywhere.
 *
 * Never log the returned key.
 */
export function readConfig(options: HandlerOptions = {}) {
  const env = mergeEnv(
    {
      ...(options.apiKey !== undefined ? { GEMINI_API_KEY: options.apiKey } : {}),
      ...(options.model !== undefined ? { GEMINI_MODEL: options.model } : {}),
    },
    { ...readNodeEnv(), ...(options.env ?? {}) }
  );

  return resolveServerConfig(env);
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                 */
/* ------------------------------------------------------------------ */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accept a finite number only, clamped to a sane range. */
export function readNumber(
  value: unknown,
  { min = -1e12, max = 1e12 }: { min?: number; max?: number } = {}
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

export function readText(value: unknown, maxLength = MAX_TEXT_FIELD): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Rebuild the user's inputs field-by-field. Returns null if the essential
 * numeric fields are absent, so the model is never handed a half-built context.
 */
export function sanitizeInputs(value: unknown): AssistantContextInputs | null {
  if (!isPlainObject(value)) return null;

  const monthlyIncome = readNumber(value.monthlyIncome, { min: 0 });
  const monthlyDebts = readNumber(value.monthlyDebts, { min: 0 });
  const downPayment = readNumber(value.downPayment, { min: 0 });
  const annualInterestRate = readNumber(value.annualInterestRate, { min: 0, max: 100 });
  const loanTenureYears = readNumber(value.loanTenureYears, { min: 0, max: 60 });

  if (
    monthlyIncome === undefined ||
    monthlyDebts === undefined ||
    downPayment === undefined ||
    annualInterestRate === undefined ||
    loanTenureYears === undefined
  ) {
    return null;
  }

  const inputs: AssistantContextInputs = {
    monthlyIncome,
    monthlyDebts,
    downPayment,
    annualInterestRate,
    loanTenureYears,
  };

  const preferredMaxMonthlyPayment = readNumber(value.preferredMaxMonthlyPayment, {
    min: 0,
  });
  if (preferredMaxMonthlyPayment !== undefined) {
    inputs.preferredMaxMonthlyPayment = preferredMaxMonthlyPayment;
  }

  const preferredLocation = readText(value.preferredLocation);
  if (preferredLocation) inputs.preferredLocation = preferredLocation;

  const minBedrooms = readNumber(value.minBedrooms, { min: 0, max: 20 });
  if (minBedrooms !== undefined) inputs.minBedrooms = minBedrooms;

  return inputs;
}

export function sanitizeAffordability(
  value: unknown
): AssistantContextAffordability | null {
  if (!isPlainObject(value)) return null;

  const estimatedMaxPropertyPrice = readNumber(value.estimatedMaxPropertyPrice, { min: 0 });
  const maxPropertyPriceByRepayment = readNumber(value.maxPropertyPriceByRepayment, { min: 0 });
  const maxPropertyPriceByCash = readNumber(value.maxPropertyPriceByCash, { min: 0 });
  const estimatedMortgageBudget = readNumber(value.estimatedMortgageBudget, { min: 0 });
  const estimatedMaxLoanPrincipal = readNumber(value.estimatedMaxLoanPrincipal, { min: 0 });
  const currentDSR = readNumber(value.currentDSR, { min: 0, max: 1000 });
  const illustrativeDSRCap = readNumber(value.illustrativeDSRCap, { min: 0, max: 100 });
  const requiredDownPaymentPercentage = readNumber(value.requiredDownPaymentPercentage, {
    min: 0,
    max: 100,
  });

  const limitingFactor = VALID_LIMITING_FACTORS.includes(
    value.limitingFactor as (typeof VALID_LIMITING_FACTORS)[number]
  )
    ? (value.limitingFactor as AssistantContextAffordability['limitingFactor'])
    : 'none';

  const bindingConstraint = VALID_BINDING_CONSTRAINTS.includes(
    value.bindingConstraint as (typeof VALID_BINDING_CONSTRAINTS)[number]
  )
    ? (value.bindingConstraint as AssistantContextAffordability['bindingConstraint'])
    : 'none';

  if (
    estimatedMaxPropertyPrice === undefined ||
    maxPropertyPriceByRepayment === undefined ||
    maxPropertyPriceByCash === undefined ||
    estimatedMortgageBudget === undefined ||
    estimatedMaxLoanPrincipal === undefined ||
    currentDSR === undefined ||
    illustrativeDSRCap === undefined ||
    requiredDownPaymentPercentage === undefined
  ) {
    return null;
  }

  return {
    estimatedMaxPropertyPrice,
    maxPropertyPriceByRepayment,
    maxPropertyPriceByCash,
    limitingFactor,
    bindingConstraint,
    estimatedMortgageBudget,
    estimatedMaxLoanPrincipal,
    currentDSR,
    illustrativeDSRCap,
    requiredDownPaymentPercentage,
    hasViableBudget: readBoolean(value.hasViableBudget) ?? false,
    limitedReason: readText(value.limitedReason, 300) ?? null,
  };
}

export function sanitizeProperty(value: unknown): AssistantContextProperty | null {
  if (!isPlainObject(value)) return null;

  const id = readText(value.id, 64);
  const propertyName = readText(value.propertyName);
  const location = readText(value.location);
  const priceMYR = readNumber(value.priceMYR, { min: 0 });
  const propertyType = readText(value.propertyType, 64);
  const estimatedMonthlyMortgage = readNumber(value.estimatedMonthlyMortgage, { min: 0 });
  const requiredDownPayment = readNumber(value.requiredDownPayment, { min: 0 });
  const matchScore = readNumber(value.matchScore, { min: 0, max: 100 });

  if (
    !id ||
    !propertyName ||
    !location ||
    priceMYR === undefined ||
    !propertyType ||
    estimatedMonthlyMortgage === undefined ||
    requiredDownPayment === undefined ||
    matchScore === undefined
  ) {
    return null;
  }

  const rawBedrooms = readNumber(value.bedrooms, { min: 0, max: 50 });
  const bedrooms = rawBedrooms === undefined ? null : Math.floor(rawBedrooms);

  const budgetStatus = VALID_BUDGET_STATUSES.includes(
    value.budgetStatus as (typeof VALID_BUDGET_STATUSES)[number]
  )
    ? (value.budgetStatus as AssistantContextProperty['budgetStatus'])
    : 'overMonthlyBudget';

  const sourceUrl = readText(value.sourceUrl, 500);

  return {
    id,
    propertyName,
    location,
    priceMYR,
    propertyType,
    bedrooms,
    builtUpSqft: readNumber(value.builtUpSqft, { min: 0, max: 1e7 }) ?? null,
    estimatedMonthlyMortgage,
    requiredDownPayment,
    cashShortfall: readNumber(value.cashShortfall, { min: 0 }) ?? 0,
    estimatedDSR: readNumber(value.estimatedDSR, { min: 0, max: 1000 }) ?? 0,
    isAffordable: readBoolean(value.isAffordable) ?? false,
    budgetStatus,
    matchScore,
    matchExplanation: readText(value.matchExplanation, 600) ?? '',
    // Only pass through URLs that are plainly https, so the model cannot be
    // nudged into repeating a javascript: or data: payload back to the user.
    sourceUrl: sourceUrl && /^https:\/\//i.test(sourceUrl) ? sourceUrl : null,
    isExample: readBoolean(value.isExample) ?? true,
    // Provenance. Only an ISO-like date string is accepted; anything else is
    // null so the model can never be told a property is verified when it is not.
    verifiedDate: /^\d{4}-\d{2}-\d{2}/.test(readText(value.verifiedDate, 32) ?? '')
      ? (readText(value.verifiedDate, 32) ?? '').slice(0, 10)
      : null,
  };
}

/** Rebuild the whole context, dropping anything malformed and capping size. */
export function sanitizeContext(value: unknown): AssistantContext {
  const source = isPlainObject(value) ? value : {};

  const rawProperties = Array.isArray(source.properties) ? source.properties : [];
  // Filter before capping, so a malformed record cannot consume one of the
  // available slots and shrink the context unnecessarily.
  const properties = rawProperties
    .map(sanitizeProperty)
    .filter((property): property is AssistantContextProperty => property !== null)
    .slice(0, ASSISTANT_LIMITS.maxContextProperties);

  const rawComparison = Array.isArray(source.comparisonProperties)
    ? source.comparisonProperties
    : [];
  const comparisonProperties = rawComparison
    .map(sanitizeProperty)
    .filter((property): property is AssistantContextProperty => property !== null)
    .slice(0, ASSISTANT_LIMITS.maxComparisonProperties);

  const inputs = sanitizeInputs(source.inputs);
  const affordability = sanitizeAffordability(source.affordability);

  return {
    hasAffordabilityResult: (readBoolean(source.hasAffordabilityResult) ?? false) && !!affordability,
    inputs,
    affordability,
    properties,
    totalListedProperties:
      readNumber(source.totalListedProperties, { min: 0, max: 100000 }) ?? properties.length,
    selectedProperty: sanitizeProperty(source.selectedProperty),
    comparisonProperties,
  };
}

export function sanitizeHistory(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return [];

  // Drop malformed entries first, then keep the most recent valid turns. Slicing
  // before filtering would let a bad entry displace a usable one.
  const valid = value
    .map((entry): AssistantMessage | null => {
      if (!isPlainObject(entry)) return null;
      const content = readText(entry.content, ASSISTANT_LIMITS.maxHistoryMessageLength);
      if (!content) return null;
      const role = entry.role === 'assistant' ? 'assistant' : 'user';
      return { role, content };
    })
    .filter((message): message is AssistantMessage => message !== null);

  return valid.slice(-ASSISTANT_LIMITS.maxHistoryMessages);
}

export interface ValidatedRequest {
  message: string;
  history: AssistantMessage[];
  context: AssistantContext;
  /** Reply language requested by the UI. Defaults to English. */
  language: AssistantLanguage;
}

export type ValidationResult =
  | { ok: true; value: ValidatedRequest }
  | { ok: false; message: string };

/**
 * Parse and validate a request body. Strings are treated as data only; no
 * extracted instruction is ever executed.
 */
export function validateRequestPayload(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  if (typeof raw.message !== 'string') {
    return { ok: false, message: 'A "message" string is required.' };
  }

  const message = raw.message.trim();

  if (!message) {
    return { ok: false, message: 'Your message cannot be empty.' };
  }

  if (message.length > ASSISTANT_LIMITS.maxMessageLength) {
    return {
      ok: false,
      message: `Your message is too long. Please keep it under ${ASSISTANT_LIMITS.maxMessageLength} characters.`,
    };
  }

  return {
    ok: true,
    value: {
      message,
      history: sanitizeHistory(raw.history),
      context: sanitizeContext(raw.context),
      language: sanitizeLanguage(raw.language),
    },
  };
}

/**
 * Accept only the languages the UI actually offers. Anything else falls back to
 * English rather than being interpolated into the system instruction.
 */
export function sanitizeLanguage(value: unknown): AssistantLanguage {
  return value === 'ms' || value === 'zh' ? value : 'en';
}

/* ------------------------------------------------------------------ */
/* Provider call                                                      */
/* ------------------------------------------------------------------ */

export interface ProviderOutcome {
  ok: boolean;
  reply?: string;
  reason?: AssistantErrorReason;
  message?: string;
}

const KEY_HEADER = 'x-goog-api-key';

/** HTTP 400 means the request itself was refused before it could be processed. */
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/**
 * Map an upstream failure to a user-safe reason and message.
 *
 * `details` is the sanitised upstream error that was just logged server-side.
 * It may refine which likely cause we NAME, but Google's raw text is never
 * interpolated into the response: only these fixed phrasings reach the browser.
 *
 * The hint matters because HTTP 400 covers several distinct causes. Google
 * reports an invalid credential as 400 + reason API_KEY_INVALID, which is not a
 * model problem, so naming the model there would mislead the operator.
 */
export function mapProviderStatus(
  status: number,
  details?: ProviderErrorDetails
): ProviderOutcome {
  if (
    status === HTTP_BAD_REQUEST ||
    status === HTTP_UNAUTHORIZED ||
    status === HTTP_FORBIDDEN
  ) {
    const reason = details?.reason ?? '';
    const providerStatus = details?.status ?? '';
    const isCredentialProblem =
      reason === 'API_KEY_INVALID' ||
      reason === 'API_KEY_NOT_VALID' ||
      providerStatus === 'UNAUTHENTICATED';

    if (isCredentialProblem) {
      return {
        ok: false,
        reason: 'provider_rejected',
        message: `The AI service rejected the API key (HTTP ${status}). Replace the server-side GEMINI_API_KEY with a valid key from https://aistudio.google.com/apikey and restart; the server terminal logs the specific reason.`,
      };
    }

    if (status === HTTP_UNAUTHORIZED) {
      return {
        ok: false,
        reason: 'provider_rejected',
        message: `The AI service rejected the API key (HTTP ${status}). Check that the server-side GEMINI_API_KEY is set correctly and belongs to an enabled project; the server terminal logs the specific reason.`,
      };
    }

    if (status === HTTP_FORBIDDEN) {
      return {
        ok: false,
        reason: 'provider_rejected',
        message: `The AI service refused access (HTTP ${status}). The API key may lack permission, or the Generative Language API may not be enabled for its project; the server terminal logs the specific reason.`,
      };
    }

    return {
      ok: false,
      reason: 'provider_rejected',
      message: `The AI service did not accept the request (HTTP ${status}). This usually means the configured GEMINI_MODEL is not available to your key, or a request parameter is unsupported; the server terminal logs the specific reason.`,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      reason: 'provider_rejected',
      message:
        'The configured Gemini model was not found. Check the server-side GEMINI_MODEL value.',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      reason: 'rate_limited',
      message:
        'The AI service is rate limited right now. Free-tier quotas are limited, so please wait a moment and try again.',
    };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'The AI service is temporarily unavailable. Please try again shortly.',
    };
  }
  return {
    ok: false,
    reason: 'provider_error',
    message: `The AI service returned an unexpected response (status ${status}).`,
  };
}

/** Walk the Interactions response and collect the model's text output. */
export function extractReply(payload: unknown): string {
  if (!isPlainObject(payload)) return '';
  const steps = Array.isArray(payload.steps) ? payload.steps : [];

  const chunks: string[] = [];
  for (const step of steps) {
    if (!isPlainObject(step)) continue;
    if (step.type !== 'model_output') continue;
    const content = Array.isArray(step.content) ? step.content : [];
    for (const block of content) {
      if (!isPlainObject(block)) continue;
      if (block.type !== 'text') continue;
      if (typeof block.text === 'string' && block.text.trim()) {
        chunks.push(block.text.trim());
      }
    }
  }

  return chunks.join('\n\n').trim();
}

/**
 * Call Gemini once. Deliberately no automatic retries: a retry loop on a
 * free-tier key burns quota, so transient failures are surfaced to the user.
 */
export async function callGemini(
  validated: ValidatedRequest,
  config: { apiKey: string; model: string },
  options: HandlerOptions = {}
): Promise<ProviderOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? ASSISTANT_LIMITS.providerTimeoutMs;

  const body = {
    model: config.model,
    system_instruction: buildSystemInstruction(validated.context, validated.language),
    input: buildConversationInput(validated.history, validated.message),
    generation_config: {
      max_output_tokens: ASSISTANT_LIMITS.maxOutputTokens,
      thinking_level: 'low',
    },
    // Do not retain this conversation on Google's servers.
    store: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [KEY_HEADER]: config.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Read the upstream body for SERVER-SIDE diagnosis only. It is sanitised
      // and logged, then discarded: the browser receives the generic
      // `mapProviderStatus` message and never Google's raw error text.
      const rawError = await response.text().catch(() => '');
      const details = sanitizeProviderError(response.status, rawError, [config.apiKey]);

      logProviderDiagnostics(
        { ...details, model: config.model },
        options.logger ?? console
      );

      return mapProviderStatus(response.status, details);
    }

    const payload: unknown = await response.json().catch(() => null);
    const reply = extractReply(payload);

    if (!reply) {
      return {
        ok: false,
        reason: 'empty_response',
        message:
          'The AI service returned an empty answer. Try rephrasing your question or asking something more specific.',
      };
    }

    return { ok: true, reply };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: 'unavailable',
      message: aborted
        ? 'The AI service took too long to respond. Please try again.'
        : 'Could not reach the AI service. Check the server connection and try again.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Convert session history plus the new message into Interactions API steps. */
export function buildConversationInput(
  history: AssistantMessage[],
  message: string
): Array<Record<string, unknown>> {
  const steps = history.map((entry) => ({
    type: entry.role === 'assistant' ? 'model_output' : 'user_input',
    content: [{ type: 'text', text: entry.content }],
  }));

  steps.push({ type: 'user_input', content: [{ type: 'text', text: message }] });
  return steps;
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                      */
/* ------------------------------------------------------------------ */

function jsonResponse(body: AssistantApiResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function errorResponse(
  reason: AssistantErrorReason,
  message: string,
  status = 200
): Response {
  return jsonResponse({ ok: false, reason, message }, status);
}

/** Read the body with a hard byte cap so a huge payload cannot be buffered. */
export async function readBodyWithLimit(
  request: Request
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declaredLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > ASSISTANT_LIMITS.maxBodyBytes) {
    return { ok: false };
  }

  const raw = await request.text();
  if (raw.length > ASSISTANT_LIMITS.maxBodyBytes) {
    return { ok: false };
  }
  return { ok: true, text: raw };
}

/**
 * Handle a POST /api/assistant request.
 *
 * Status codes are kept at 200 for application-level failures (missing config,
 * provider trouble) so the client always receives the structured, friendly
 * `message` it should display. Only malformed HTTP requests get 4xx codes.
 */
export async function handleAssistantRequest(
  request: Request,
  options: HandlerOptions = {}
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(
      'invalid_request',
      'Only POST requests are supported. Send { "message": "..." } to this endpoint.',
      405
    );
  }

  const body = await readBodyWithLimit(request);
  if (!body.ok) {
    return errorResponse(
      'invalid_request',
      'The request was too large. Please send a shorter message.',
      413
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return errorResponse('invalid_request', 'Request body must be valid JSON.', 400);
  }

  const validation = validateRequestPayload(parsed);
  if (!validation.ok) {
    return errorResponse('invalid_request', validation.message, 400);
  }

  const config = readConfig(options);

  if (!config.isConfigured) {
    return errorResponse(
      'not_configured',
      'The AI assistant is not configured on this server yet. Add a GEMINI_API_KEY environment variable on the server (see .env.example and the README) and restart. The rest of SimePark works without it.'
    );
  }

  const outcome = await callGemini(validation.value, config, options);

  if (!outcome.ok || !outcome.reply) {
    return errorResponse(
      outcome.reason ?? 'provider_error',
      outcome.message ?? 'The AI assistant could not answer that. Please try again.'
    );
  }

  return jsonResponse({
    ok: true,
    reply: outcome.reply,
    model: config.model,
  });
}
