/**
 * Frontend facade over the shared assistant contract.
 *
 * The contract itself lives in `shared/contract/assistant.ts` so that the
 * browser, the Cloudflare Pages Function, and the local dev middleware all agree
 * on one definition. Re-exporting rather than redeclaring is deliberate: two
 * hand-maintained copies had already begun to drift.
 *
 * Only client-side helpers belong in this file. Nothing here may read
 * `process.env` or contain a server credential.
 */

export type {
  AssistantApiResponse,
  AssistantContext,
  AssistantContextAffordability,
  AssistantContextInputs,
  AssistantContextProperty,
  AssistantErrorReason,
  AssistantErrorResponse,
  AssistantLanguage,
  AssistantMessage,
  AssistantRequestPayload,
  AssistantSuccessResponse,
  SuggestedQuestionKey,
} from '../../shared/contract/assistant';

export {
  ASSISTANT_LIMITS,
  DEFAULT_GEMINI_MODEL,
  SUGGESTED_QUESTION_KEYS,
} from '../../shared/contract/assistant';
