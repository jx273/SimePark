/**
 * Runtime-agnostic contract shared by the browser, the Cloudflare Pages
 * Function, and the local Vite dev middleware.
 *
 * IMPORTANT: nothing in this file may reference `import.meta.env`, `process.env`,
 * or any `VITE_*` value. The Gemini API key is read by server code only.
 *
 * The affordability numbers in `AssistantContext` are produced by the
 * deterministic utilities in `src/utils/*`. The language model receives them as
 * READ-ONLY facts so it can explain them; it must never recompute or override
 * them.
 */

/** One turn of the current browser session's conversation. */
export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The user's financial inputs, as submitted to the affordability form. */
export interface AssistantContextInputs {
  monthlyIncome: number;
  monthlyDebts: number;
  downPayment: number;
  annualInterestRate: number;
  loanTenureYears: number;
  preferredMaxMonthlyPayment?: number;
  preferredLocation?: string;
  minBedrooms?: number;
}

/**
 * The authoritative affordability figures computed by `calculateAffordability()`
 * in the browser. Sent verbatim, never inferred.
 */
export interface AssistantContextAffordability {
  estimatedMaxPropertyPrice: number;
  maxPropertyPriceByRepayment: number;
  maxPropertyPriceByCash: number;
  limitingFactor: 'repayment' | 'downPayment' | 'none';
  /**
   * Which input is really binding, including a user-entered
   * preferredMaxMonthlyPayment. Produced by the affordability utility; the
   * assistant reports it rather than inferring a cause from the raw numbers.
   */
  bindingConstraint:
    | 'repayment'
    | 'downPayment'
    | 'preferredMaxMonthlyPayment'
    | 'none';
  estimatedMortgageBudget: number;
  estimatedMaxLoanPrincipal: number;
  currentDSR: number;
  illustrativeDSRCap: number;
  requiredDownPaymentPercentage: number;
  hasViableBudget: boolean;
  limitedReason: string | null;
}

/** A real property record, already enriched by the app. */
export interface AssistantContextProperty {
  id: string;
  propertyName: string;
  location: string;
  priceMYR: number;
  propertyType: string;
  bedrooms: number | null;
  builtUpSqft: number | null;
  estimatedMonthlyMortgage: number;
  requiredDownPayment: number;
  cashShortfall: number;
  estimatedDSR: number;
  isAffordable: boolean;
  budgetStatus: 'affordable' | 'overMonthlyBudget' | 'insufficientDownPayment';
  matchScore: number;
  matchExplanation: string;
  sourceUrl: string | null;
  isExample: boolean;
  /** Provenance, so the model can label status without guessing. */
  verifiedDate: string | null;
}

/** Everything the model is allowed to know about this user's session. */
export interface AssistantContext {
  /** True once the user has submitted the affordability form. */
  hasAffordabilityResult: boolean;
  inputs: AssistantContextInputs | null;
  affordability: AssistantContextAffordability | null;
  /** Real records, already filtered/ranked by the app. May be empty. */
  properties: AssistantContextProperty[];
  /** How many properties the app currently lists. */
  totalListedProperties: number;
  /** The property the user currently has open in the detail view, if any. */
  selectedProperty: AssistantContextProperty | null;
  /**
   * Up to three properties the user has explicitly selected for comparison, so
   * the assistant can compare them using real data only.
   */
  comparisonProperties?: AssistantContextProperty[];
}

/** Supported assistant reply languages. */
export type AssistantLanguage = 'en' | 'ms' | 'zh';

export interface AssistantRequestPayload {
  message: string;
  history: AssistantMessage[];
  context: AssistantContext;
  /** The UI language the reply should use unless the user asks otherwise. */
  language?: AssistantLanguage;
}

/** Success response from `/api/assistant`. */
export interface AssistantSuccessResponse {
  ok: true;
  reply: string;
  /** The model actually used, echoed for transparency. */
  model: string;
}

export type AssistantErrorReason =
  /** GEMINI_API_KEY is not set on the server. */
  | 'not_configured'
  /** The request body or its contents failed validation. */
  | 'invalid_request'
  /** The provider rejected our key or refused the request. */
  | 'provider_rejected'
  /** The provider rate-limited us. */
  | 'rate_limited'
  /** The provider was unreachable or timed out. */
  | 'unavailable'
  /** The provider returned an empty or unusable answer. */
  | 'empty_response'
  /** The provider returned an unexpected status. */
  | 'provider_error';

/**
 * Failure response. `message` is always safe to show to the user: it never
 * contains the API key, provider internals, or a raw upstream body. It is
 * written in English and translated for display by the client using `reason`.
 */
export interface AssistantErrorResponse {
  ok: false;
  reason: AssistantErrorReason;
  message: string;
}

export type AssistantApiResponse = AssistantSuccessResponse | AssistantErrorResponse;

/* ------------------------------------------------------------------ */
/* Request limits (enforced on the server; the client mirrors the cap)  */
/* ------------------------------------------------------------------ */

export const ASSISTANT_LIMITS = {
  /** Maximum characters accepted in a single user message. */
  maxMessageLength: 2000,
  /** Maximum number of prior turns kept and sent to the provider. */
  maxHistoryMessages: 12,
  /** Maximum characters accepted in a single history message. */
  maxHistoryMessageLength: 4000,
  /** Maximum JSON body size accepted, in bytes. */
  maxBodyBytes: 64 * 1024,
  /** Maximum properties included in the model context. */
  maxContextProperties: 10,
  /** Maximum properties included in the comparison context. */
  maxComparisonProperties: 3,
  /** Upper bound on generated tokens, to keep latency and cost predictable. */
  maxOutputTokens: 700,
  /** How long to wait for the provider before giving up, in milliseconds. */
  providerTimeoutMs: 20_000,
} as const;

/**
 * Default Gemini model.
 *
 * Overridable with the server-side GEMINI_MODEL binding (a Cloudflare Secret in
 * production, `.dev.vars` or `.env` locally). Model availability and free-tier
 * eligibility change over time and must be checked by the owner in Google AI
 * Studio; this project does not assume any model is permanently free.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/**
 * Locale-independent identifiers for the starter questions. The client maps
 * these to translated strings, so the prompt never needs to be duplicated per
 * language.
 */
export const SUGGESTED_QUESTION_KEYS = [
  'maxPrice',
  'budget',
  'matches',
  'upfrontCosts',
] as const;

export type SuggestedQuestionKey = (typeof SUGGESTED_QUESTION_KEYS)[number];
