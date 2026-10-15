/**
 * Shared contract between the SimePark chat UI and the server-side
 * `/api/assistant` endpoint.
 *
 * IMPORTANT: nothing in this file may reference `import.meta.env` or any
 * `VITE_*` variable. The Gemini API key is read on the server only.
 *
 * The affordability numbers in `AssistantContext` are produced by the existing
 * deterministic utilities in `src/utils/*`. The language model is given them as
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
 * The authoritative affordability figures computed by
 * `calculateAffordability()` in the browser. Sent verbatim, never inferred.
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
  bindingConstraint: 'repayment' | 'downPayment' | 'preferredMaxMonthlyPayment' | 'none';
  estimatedMortgageBudget: number;
  estimatedMaxLoanPrincipal: number;
  currentDSR: number;
  illustrativeDSRCap: number;
  requiredDownPaymentPercentage: number;
  hasViableBudget: boolean;
  limitedReason: string | null;
}

/** A real property record from `src/data/properties.json`, already enriched. */
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
}

/** Everything the model is allowed to know about this user's session. */
export interface AssistantContext {
  /** True once the user has submitted the affordability form. */
  hasAffordabilityResult: boolean;
  inputs: AssistantContextInputs | null;
  affordability: AssistantContextAffordability | null;
  /** Real records, already filtered/ranked by the app. May be empty. */
  properties: AssistantContextProperty[];
  /** How many properties the app currently lists after filtering. */
  totalListedProperties: number;
  /** The property the user currently has open in the detail modal, if any. */
  selectedProperty: AssistantContextProperty | null;
}

export interface AssistantRequestPayload {
  message: string;
  history: AssistantMessage[];
  context: AssistantContext;
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
 * contains the API key, provider internals, or a raw upstream body.
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
  /** Upper bound on generated tokens, to keep latency and cost predictable. */
  maxOutputTokens: 700,
  /** How long to wait for the provider before giving up, in milliseconds. */
  providerTimeoutMs: 20_000,
} as const;

/** Default Gemini model. Overridable with the server-side GEMINI_MODEL var. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** The four starter questions offered to first-time buyers. */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  'What does my estimated maximum property price mean, and what limits it?',
  'Why is my monthly mortgage budget this amount?',
  'Which listed properties fit my budget, and why?',
  'What upfront costs should I budget for beyond the down payment?',
];
