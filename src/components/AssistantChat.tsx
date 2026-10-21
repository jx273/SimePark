import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ASSISTANT_LIMITS,
  SUGGESTED_QUESTION_KEYS,
  type AssistantMessage,
} from '../types/assistant';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import type { PropertyWithCalculations } from '../types/property';
import { buildAssistantContext } from '../utils/assistantContext';
import { askAssistant } from '../utils/assistantClient';
import { formatMYR } from '../utils/mortgage';
import AssistantMessageText from './AssistantMessageText';
import VoiceInput from './VoiceInput';
import './AssistantChat.css';

const PROPERTY_SPECIFIC_QUESTIONS = [
  'Can I afford this property based on my current budget?',
  'What would the estimated monthly repayment be for this property?',
  'What deposit might I need for this property?',
  'What should I check before buying this property?',
  'How does this property compare with similar properties?',
];

interface AssistantChatProps {
  /** Null until the user submits the affordability form. */
  userInputs: AffordabilityInputs | null;
  affordabilityResult: AffordabilityResult | null;
  /** Properties currently listed after the user's filters. */
  properties: PropertyWithCalculations[];
  selectedProperty?: PropertyWithCalculations | null;
  /** Properties the user selected for comparison, so the assistant can use them. */
  comparisonProperties?: PropertyWithCalculations[];
  /** Lets the panel invite the user to jump to the form. */
  onNavigate?: (section: string) => void;
}

export default function AssistantChat({
  userInputs,
  affordabilityResult,
  properties,
  selectedProperty = null,
  comparisonProperties = [],
  onNavigate,
}: AssistantChatProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasContext = Boolean(userInputs && affordabilityResult);

  // Keep the newest turn in view without yanking the whole page around.
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isLoading]);

  const send = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();

      if (!question || isLoading) return;

      if (question.length > ASSISTANT_LIMITS.maxMessageLength) {
        setError(
          `Please keep your question under ${ASSISTANT_LIMITS.maxMessageLength} characters.`
        );
        return;
      }

      // History as it stands before this new turn.
      const history = messages;

      setMessages([...history, { role: 'user', content: question }]);
      setInput('');
      setError(null);
      setIsLoading(true);
      setPendingQuestion(question);

      const context = buildAssistantContext({
        inputs: userInputs,
        affordabilityResult,
        properties,
        selectedProperty,
        comparisonProperties,
      });

      const result = await askAssistant(question, history, context);

      if (result.ok) {
        setMessages((previous) => [
          ...previous,
          { role: 'assistant', content: result.reply },
        ]);
        setUsedModel(result.model);
      } else {
        // Translate the server's stable reason rather than showing its English
        // text, so the explanation follows the interface language.
        setError(t(`assistant.errorReasons.${result.reason}`, { defaultValue: result.message }));
      }

      setPendingQuestion(null);
      setIsLoading(false);
      inputRef.current?.focus();
    },
    [
      isLoading,
      messages,
      userInputs,
      affordabilityResult,
      properties,
      selectedProperty,
      comparisonProperties,
      t,
    ]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Enter submits; Shift+Enter inserts a newline. The form's submit path
    // covers both the button and the Enter key.
    void send(input);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  const remaining = ASSISTANT_LIMITS.maxMessageLength - input.length;
  const isNearLimit = remaining <= 200;

  return (
    <section className="assistant section section--alt" id="assistant">
      <div className="container container--narrow">
        <h2 className="section__title text-center">AI Home-Buying Assistant</h2>
        <p className="section__subtitle" style={{ margin: '0 auto var(--space-lg)' }}>
          Ask about your affordability estimate, why certain properties matched, or the
          upfront costs of buying in Malaysia. Answers explain SimePark&apos;s own
          calculations — they never replace them.
        </p>

        <div className="assistant__panel">
          <div className="assistant__context">
            {selectedProperty ? (
              <p className="assistant__context-text">
                <span className="assistant__context-dot" aria-hidden="true" />
                Focused on <strong>{selectedProperty.propertyName}</strong> ({selectedProperty.priceMYR ? formatMYR(selectedProperty.priceMYR) : t('common.unknown')} in {selectedProperty.location}).
                {hasContext ? ' Your affordability profile is connected.' : ' You can ask any question about this property or general home-buying.'}
              </p>
            ) : hasContext ? (
              <p className="assistant__context-text">
                <span className="assistant__context-dot" aria-hidden="true" />
                {properties.length === 1
                  ? 'Your latest affordability estimate and 1 listed property are'
                  : `Your latest affordability estimate and ${properties.length} listed properties are`}{' '}
                available to the assistant. Submitting the form again updates these figures
                immediately.
              </p>
            ) : (
              <p className="assistant__context-text assistant__context-text--empty">
                <strong>No affordability estimate yet.</strong> You can ask any question about properties, Malaysian home-buying, or upfront costs.
                To check personalized loan limits, {onNavigate ? (
                  <button
                    type="button"
                    className="assistant__inline-link"
                    onClick={() => onNavigate('affordability')}
                  >
                    complete the affordability form
                  </button>
                ) : (
                  'complete the affordability form'
                )}
                .
              </p>
            )}
          </div>

          <div
            className="assistant__log"
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation with the AI home-buying assistant"
            tabIndex={0}
          >
            {messages.length === 0 && !isLoading && (
              <div className="assistant__intro">
                <p className="assistant__intro-title">
                  {selectedProperty ? `Suggested questions for ${selectedProperty.propertyName}:` : t('assistant.newHere')}
                </p>
                <ul className="assistant__suggestions">
                  {selectedProperty
                    ? PROPERTY_SPECIFIC_QUESTIONS.map((question) => (
                        <li key={question}>
                          <button
                            type="button"
                            className="assistant__suggestion"
                            onClick={() => void send(question)}
                          >
                            {question}
                          </button>
                        </li>
                      ))
                    : SUGGESTED_QUESTION_KEYS.map((key) => {
                        const question = t(`assistant.suggestions.${key}`);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              className="assistant__suggestion"
                              onClick={() => void send(question)}
                            >
                              {question}
                            </button>
                          </li>
                        );
                      })}
                </ul>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`assistant__message assistant__message--${message.role}`}
              >
                <span className="assistant__message-role">
                  {message.role === 'user' ? t('assistant.you') : t('assistant.assistant')}
                </span>
                <div className="assistant__bubble">
                  {message.role === 'assistant' ? (
                    <AssistantMessageText text={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="assistant__message assistant__message--assistant">
                <span className="assistant__message-role">{t('assistant.assistant')}</span>
                <div className="assistant__bubble assistant__bubble--loading">
                  <span className="assistant__spinner" aria-hidden="true" />
                  <span>{t('assistant.thinking')}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="assistant__error" role="alert">
                <p className="assistant__error-title">{t('assistant.errorTitle')}</p>
                <p className="assistant__error-text">{error}</p>
                {pendingQuestion === null && input.trim() === '' && (
                  <p className="assistant__error-hint">{t('assistant.errorHint')}</p>
                )}
              </div>
            )}
          </div>

          <form className="assistant__composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="assistant-input">
              {t('assistant.inputLabel')}
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              className="assistant__input"
              placeholder={t('assistant.inputPlaceholder')}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={ASSISTANT_LIMITS.maxMessageLength}
              disabled={isLoading}
              aria-describedby="assistant-input-hint"
            />

            {/* Optional voice input. Renders a graceful explanation instead of a
                dead button when the browser has no SpeechRecognition. */}
            <VoiceInput
              disabled={isLoading}
              onTranscript={(transcript) =>
                setInput((previous) => (previous ? `${previous} ${transcript}` : transcript))
              }
            />

            <div className="assistant__composer-footer">
              <span
                id="assistant-input-hint"
                className={`assistant__hint ${isNearLimit ? 'assistant__hint--warn' : ''}`}
              >
                {isLoading
                  ? t('assistant.waiting')
                  : isNearLimit
                    ? t('assistant.hintRemaining', { count: remaining })
                    : t('assistant.hint')}
              </span>
              <button
                type="submit"
                className="btn btn--primary assistant__send"
                disabled={isLoading || input.trim().length === 0}
              >
                {isLoading ? t('assistant.sending') : t('assistant.send')}
              </button>
            </div>
          </form>

          <div className="assistant__status">
            <span className="assistant__status-dot" aria-hidden="true" />
            <span>
              {t('assistant.privacyNote')}
              {usedModel && (
                <>
                  {' '}
                  {t('assistant.answeredBy', { model: usedModel })}
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
