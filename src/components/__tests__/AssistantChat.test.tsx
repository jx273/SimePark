/**
 * @vitest-environment happy-dom
 *
 * Behavioural tests for the chat panel itself. The network layer
 * (`src/utils/assistantClient.ts`) is mocked so these tests cover only the UI:
 * submission paths, the duplicate-submission guard, error state, and the
 * context that gets handed to the assistant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import AssistantChat from '../AssistantChat';
import { createTestI18n } from '../../test/testI18n';
import { askAssistant } from '../../utils/assistantClient';
import type { AffordabilityInputs, AffordabilityResult } from '../../types/affordability';
import type { PropertyWithCalculations } from '../../types/property';

vi.mock('../../utils/assistantClient', () => ({
  askAssistant: vi.fn(),
  ASSISTANT_ENDPOINT: '/api/assistant',
}));

const askAssistantMock = vi.mocked(askAssistant);

const inputs: AffordabilityInputs = {
  monthlyIncome: 8000,
  monthlyDebts: 1000,
  downPayment: 40000,
  annualInterestRate: 4,
  loanTenureYears: 30,
};

const affordabilityResult: AffordabilityResult = {
  monthlyIncome: 8000,
  monthlyDebts: 1000,
  maxTotalMonthlyDebtBudget: 3200,
  estimatedMortgageBudget: 2200,
  estimatedMaxLoanPrincipal: 420815,
  estimatedMaxPropertyPrice: 400000,
  maxPropertyPriceByRepayment: 460815,
  maxPropertyPriceByCash: 400000,
  limitingFactor: 'downPayment',
  bindingConstraint: 'downPayment',
  hasViableBudget: true,
  limitedReason: null,
  cashApplied: 40000,
  currentDSR: 12.5,
  illustrativeDSRCap: 40,
  downPaymentAmount: 40000,
  annualInterestRate: 4,
  loanTenureYears: 30,
};

const property: PropertyWithCalculations = {
  id: 'demo-001',
  propertyName: 'Residensi Harmoni Cheras',
  location: 'Cheras, Kuala Lumpur',
  priceMYR: 320000,
  propertyType: 'Apartment',
  bedrooms: 3,
  bathrooms: 2,
  builtUpSqft: 850,
  sourceUrl: null,
  verifiedDate: null,
  isExample: true,
  estimatedMonthlyMortgage: 1375,
  requiredDownPayment: 32000,
  downPaymentApplied: 32000,
  cashShortfall: 0,
  loanPrincipal: 288000,
  estimatedDSR: 29.7,
  isAffordable: true,
  budgetStatus: 'affordable',
  matchScore: 88,
  matchExplanation: 'This property is within your estimated budget.',
};

let i18n: I18nInstance;

/** Render the chat inside a real i18next provider so t() resolves. */
function renderChat(overrides: Partial<Parameters<typeof AssistantChat>[0]> = {}) {
  const chat = (
    <AssistantChat
      userInputs={inputs}
      affordabilityResult={affordabilityResult}
      properties={[property]}
      selectedProperty={null}
      {...overrides}
    />
  );
  return render(<I18nextProvider i18n={i18n}>{chat}</I18nextProvider>);
}

/** Re-render with new props while keeping the same i18n provider. */
function rerenderChat(
  rerender: (ui: React.ReactElement) => void,
  overrides: Partial<Parameters<typeof AssistantChat>[0]>
) {
  rerender(
    <I18nextProvider i18n={i18n}>
      <AssistantChat
        userInputs={inputs}
        affordabilityResult={affordabilityResult}
        properties={[property]}
        selectedProperty={null}
        {...overrides}
      />
    </I18nextProvider>
  );
}

beforeEach(async () => {
  askAssistantMock.mockReset();
  i18n = await createTestI18n('en');
});

afterEach(() => {
  cleanup();
});

describe('AssistantChat — initial state', () => {
  it('offers exactly four suggested questions', () => {
    const { container } = renderChat();

    // Scope to the suggestion list: the composer's Send button is also a button.
    const suggestions = container.querySelectorAll('.assistant__suggestion');
    expect(suggestions).toHaveLength(4);
    expect(screen.getByText(/What does my estimated maximum property price mean/i)).toBeTruthy();
  });

  it('states which data the assistant can see when an estimate exists', () => {
    renderChat();
    expect(screen.getByText(/Your latest affordability estimate/i)).toBeTruthy();
  });

  it('explains the missing estimate and offers a route to the form', () => {
    const onNavigate = vi.fn();
    renderChat({
      userInputs: null,
      affordabilityResult: null,
      properties: [],
      onNavigate,
    });

    expect(screen.getByText(/No affordability estimate yet/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /complete the affordability form/i }));
    expect(onNavigate).toHaveBeenCalledWith('affordability');
  });

  it('reminds the user that figures are estimates, not advice', () => {
    renderChat();
    expect(screen.getByText(/not loan approval or financial advice/i)).toBeTruthy();
  });
});

describe('AssistantChat — sending', () => {
  it('sends a suggested question and renders the reply', async () => {
    askAssistantMock.mockResolvedValue({
      ok: true,
      reply: 'Your estimate is **RM 400,000**. (Estimate)',
      model: 'test-model',
    });

    renderChat();
    fireEvent.click(
      screen.getByRole('button', { name: /Which listed properties fit my budget/i })
    );

    expect(await screen.findByText(/Your estimate is/i)).toBeTruthy();
    expect(askAssistantMock).toHaveBeenCalledTimes(1);

    // The bold marker is rendered as an element, not printed literally.
    expect(screen.getByText('RM 400,000').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).toBeNull();
    // The model name is now part of the translated attribution sentence.
    expect(screen.getByText(/test-model/)).toBeTruthy();
  });

  it('sends the drafted question with Enter and clears the box', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'Sure', model: 'm' });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '  Why is my budget RM 2,200?  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(1));
    expect(askAssistantMock.mock.calls[0][0]).toBe('Why is my budget RM 2,200?');
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('inserts a newline on Shift+Enter instead of sending', () => {
    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );

    fireEvent.change(textarea, { target: { value: 'line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(askAssistantMock).not.toHaveBeenCalled();
  });

  it('sends from the Send button', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'ok', model: 'm' });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(1));
  });

  it('does not send an empty message', () => {
    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.keyDown(
      screen.getByLabelText(/Ask the AI home-buying assistant a question/i),
      { key: 'Enter' }
    );

    expect(askAssistantMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while a reply is pending', async () => {
    let resolveCall: ((value: { ok: true; reply: string; model: string }) => void) | undefined;
    askAssistantMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        })
    );

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'First question' } });

    // Three rapid submits while the first is still in flight.
    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(askAssistantMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Thinking about your question/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Sending/ }) as HTMLButtonElement).disabled).toBe(
      true
    );

    resolveCall?.({ ok: true, reply: 'Done', model: 'm' });
    expect(await screen.findByText('Done')).toBeTruthy();
  });

  it('passes the real affordability figures and property records as context', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'ok', model: 'm' });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'Explain my limit' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(1));

    const [, history, context] = askAssistantMock.mock.calls[0];
    expect(history).toEqual([]);
    expect(context.hasAffordabilityResult).toBe(true);
    expect(context.affordability?.estimatedMaxPropertyPrice).toBe(400000);
    expect(context.affordability?.limitingFactor).toBe('downPayment');
    expect(context.properties).toHaveLength(1);
    expect(context.properties[0].propertyName).toBe('Residensi Harmoni Cheras');
  });

  it('sends the latest context after the form is submitted again', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'ok', model: 'm' });

    const { rerender } = renderChat();

    // The user has not submitted anything affordable yet.
    rerenderChat(rerender, {
      userInputs: null,
      affordabilityResult: null,
      properties: [],
    });

    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'What can I afford?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(1));

    const firstContext = askAssistantMock.mock.calls[0][2];
    expect(firstContext.hasAffordabilityResult).toBe(false);
    expect(firstContext.affordability).toBeNull();
    expect(firstContext.inputs).toBeNull();

    // Now the user submits the form; the same component instance stays mounted.
    const updatedResult: AffordabilityResult = {
      ...affordabilityResult,
      estimatedMaxPropertyPrice: 500000,
      maxPropertyPriceByCash: 500000,
      limitingFactor: 'repayment',
      bindingConstraint: 'repayment',
    };
    rerenderChat(rerender, {
      userInputs: { ...inputs, monthlyIncome: 9000, preferredMaxMonthlyPayment: 1500 },
      affordabilityResult: updatedResult,
      properties: [property],
    });

    fireEvent.change(textarea, { target: { value: 'And now?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(2));

    const secondContext = askAssistantMock.mock.calls[1][2];
    expect(secondContext.hasAffordabilityResult).toBe(true);
    // The NEW calculated figure, not the stale one.
    expect(secondContext.affordability?.estimatedMaxPropertyPrice).toBe(500000);
    expect(secondContext.affordability?.limitingFactor).toBe('repayment');
    // The NEW income.
    expect(secondContext.inputs?.monthlyIncome).toBe(9000);
    // The user's own preference travels alongside, not merged into it.
    expect(secondContext.inputs?.preferredMaxMonthlyPayment).toBe(1500);
    expect(secondContext.properties).toHaveLength(1);
  });

  it('carries the user preference separately from the calculated budget', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'ok', model: 'm' });

    renderChat({
      userInputs: { ...inputs, preferredMaxMonthlyPayment: 1500 },
    });

    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'What is my budget?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(1));

    const context = askAssistantMock.mock.calls[0][2];
    expect(context.inputs?.preferredMaxMonthlyPayment).toBe(1500);
    // The calculated figure is unchanged by the user's preference.
    expect(context.affordability?.estimatedMortgageBudget).toBe(2200);
  });

  it('sends prior turns as history on the follow-up question', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'First answer', model: 'm' });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );

    fireEvent.change(textarea, { target: { value: 'Question one' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await screen.findByText('First answer');

    fireEvent.change(textarea, { target: { value: 'Question two' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(askAssistantMock).toHaveBeenCalledTimes(2));

    const [, history] = askAssistantMock.mock.calls[1];
    expect(history).toEqual([
      { role: 'user', content: 'Question one' },
      { role: 'assistant', content: 'First answer' },
    ]);
  });
  it('keeps the conversation visible for the session', async () => {
    askAssistantMock.mockResolvedValue({ ok: true, reply: 'Kept reply', model: 'm' });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'Remember this' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await screen.findByText('Kept reply');
    expect(screen.getByText('Remember this')).toBeTruthy();
    expect(screen.getByText('Kept reply')).toBeTruthy();
  });
});

describe('AssistantChat — error state', () => {
  it('shows the friendly server explanation without crashing', async () => {
    askAssistantMock.mockResolvedValue({
      ok: false,
      reason: 'not_configured',
      message: 'The AI assistant is not configured on this server yet.',
    });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'Hello?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('not configured on this server yet');
    expect(screen.getByText(/does not retry\s+automatically/i)).toBeTruthy();

    // The panel stays usable, so the user can try again.
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.change(textarea, { target: { value: 'Second try' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('recovers cleanly after an error', async () => {
    askAssistantMock.mockResolvedValueOnce({
      ok: false,
      reason: 'unavailable',
      message: 'Temporary problem.',
    });

    renderChat();
    const textarea = screen.getByLabelText(
      /Ask the AI home-buying assistant a question/i
    );
    fireEvent.change(textarea, { target: { value: 'First' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await screen.findByRole('alert');

    askAssistantMock.mockResolvedValueOnce({ ok: true, reply: 'Recovered', model: 'm' });
    fireEvent.change(textarea, { target: { value: 'Second' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(await screen.findByText('Recovered')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
