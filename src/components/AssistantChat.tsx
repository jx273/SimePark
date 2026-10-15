import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ASSISTANT_LIMITS,
  SUGGESTED_QUESTIONS,
  type AssistantMessage,
} from '../types/assistant';
import type { AffordabilityInputs, AffordabilityResult } from '../types/affordability';
import type { PropertyWithCalculations } from '../types/property';
import { buildAssistantContext } from '../utils/assistantContext';
import { askAssistant } from '../utils/assistantClient';
import AssistantMessageText from './AssistantMessageText';
import './AssistantChat.css';

interface AssistantChatProps {
  /** Null until the user submits the affordability form. */
  userInputs: AffordabilityInputs | null;
  affordabilityResult: AffordabilityResult | null;
  /** Properties currently listed after the user's filters. */
  properties: PropertyWithCalculations[];
  selectedProperty?: PropertyWithCalculations | null;
  /** Lets the panel invite the user to jump to the form. */
  onNavigate?: (section: string) => void;
}

export default function AssistantChat({
  userInputs,
  affordabilityResult,
  properties,
  selectedProperty = null,
  onNavigate,
}: AssistantChatProps) {
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
      });

      const result = await askAssistant(question, history, context);

      if (result.ok) {
        setMessages((previous) => [
          ...previous,
          { role: 'assistant', content: result.reply },
        ]);
        setUsedModel(result.model);
      } else {
        setError(result.message);
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
            {hasContext ? (
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
                No affordability estimate yet. The assistant can still explain general
                upfront costs, but it cannot discuss your numbers or recommend properties
                until you{' '}
                {onNavigate ? (
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
                  New here? Try one of these to get started:
                </p>
                <ul className="assistant__suggestions">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <li key={question}>
                      <button
                        type="button"
                        className="assistant__suggestion"
                        onClick={() => void send(question)}
                      >
                        {question}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`assistant__message assistant__message--${message.role}`}
              >
                <span className="assistant__message-role">
                  {message.role === 'user' ? 'You' : 'Assistant'}
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
                <span className="assistant__message-role">Assistant</span>
                <div className="assistant__bubble assistant__bubble--loading">
                  <span className="assistant__spinner" aria-hidden="true" />
                  <span>Thinking about your question…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="assistant__error" role="alert">
                <p className="assistant__error-title">The assistant could not answer</p>
                <p className="assistant__error-text">{error}</p>
                {pendingQuestion === null && input.trim() === '' && (
                  <p className="assistant__error-hint">
                    You can retry by sending your question again. SimePark does not retry
                    automatically, to avoid using up the API quota.
                  </p>
                )}
              </div>
            )}
          </div>

          <form className="assistant__composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="assistant-input">
              Ask the AI home-buying assistant a question
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              className="assistant__input"
              placeholder="Ask about your budget, a property, or upfront costs…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={ASSISTANT_LIMITS.maxMessageLength}
              disabled={isLoading}
              aria-describedby="assistant-input-hint"
            />

            <div className="assistant__composer-footer">
              <span
                id="assistant-input-hint"
                className={`assistant__hint ${isNearLimit ? 'assistant__hint--warn' : ''}`}
              >
                {isLoading
                  ? 'Waiting for a reply…'
                  : `Enter to send · Shift+Enter for a new line${
                      isNearLimit ? ` · ${remaining} characters left` : ''
                    }`}
              </span>
              <button
                type="submit"
                className="btn btn--primary assistant__send"
                disabled={isLoading || input.trim().length === 0}
              >
                {isLoading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>

          <div className="assistant__status">
            <span className="assistant__status-dot" aria-hidden="true" />
            {usedModel ? (
              <span>
                Estimates only — not loan approval or financial advice. Answered by{' '}
                <code>{usedModel}</code> via a server-side Gemini API call.
              </span>
            ) : (
              <span>
                Estimates only — not loan approval or financial advice. The API key stays on
                the server.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
