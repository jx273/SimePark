/**
 * @vitest-environment happy-dom
 *
 * Voice input is optional and browser-dependent, so the tests focus on the two
 * things that must never regress: graceful degradation when SpeechRecognition is
 * absent, and correct classification of every error the browser can report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import VoiceInput, {
  VOICE_LANGUAGES,
  classifySpeechError,
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  recognitionTagFor,
} from '../VoiceInput';
import { createTestI18n } from '../../test/testI18n';

let i18n: I18nInstance;

beforeEach(async () => {
  i18n = await createTestI18n('en');
});

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  vi.restoreAllMocks();
});

function renderVoice(onTranscript = vi.fn(), disabled = false) {
  return render(
    <I18nextProvider i18n={i18n}>
      <VoiceInput onTranscript={onTranscript} disabled={disabled} />
    </I18nextProvider>
  );
}

describe('speech support detection', () => {
  it('reports no support when the API is absent', () => {
    expect(getSpeechRecognition()).toBeNull();
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it('finds the standard constructor when present', () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = function stub() {};
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('falls back to the webkit-prefixed constructor', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = function stub() {};
    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe('recognition language tags', () => {
  it('offers English, Bahasa Melayu, and Chinese', () => {
    expect(VOICE_LANGUAGES.map((language) => language.code)).toEqual(['en', 'ms', 'zh']);
  });

  it('maps each language to an appropriate locale tag', () => {
    expect(recognitionTagFor('en')).toBe('en-MY');
    expect(recognitionTagFor('ms')).toBe('ms-MY');
    expect(recognitionTagFor('zh')).toBe('zh-CN');
  });
});

describe('classifySpeechError', () => {
  it.each([
    ['not-allowed', 'permissionDenied'],
    ['service-not-allowed', 'permissionDenied'],
    ['no-speech', 'noSpeech'],
    ['language-not-supported', 'unsupportedLanguage'],
    ['network', 'error'],
    ['aborted', 'error'],
    ['anything-else', 'error'],
  ])('maps %s to %s', (input, expected) => {
    expect(classifySpeechError(input)).toBe(expected);
  });
});

describe('when the browser has no speech recognition', () => {
  it('shows an explanation instead of a dead button', () => {
    renderVoice();

    expect(screen.getByRole('note').textContent).toMatch(/not available in this browser/i);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never blocks typing: it renders no input of its own', () => {
    const { container } = renderVoice();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('when speech recognition is available', () => {
  class StubRecognition {
    static instances: StubRecognition[] = [];
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;
    started = false;

    constructor() {
      StubRecognition.instances.push(this);
    }

    start() {
      this.started = true;
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }

  beforeEach(() => {
    StubRecognition.instances = [];
    (window as unknown as Record<string, unknown>).SpeechRecognition = StubRecognition;
  });

  it('starts listening, shows a text status, and reports the transcript', async () => {
    const onTranscript = vi.fn();
    renderVoice(onTranscript);

    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }));

    const instance = StubRecognition.instances[0];
    expect(instance.started).toBe(true);
    expect(instance.lang).toBe('en-MY');
    // Status is text, not just a pulsing dot.
    expect(await screen.findByText(/listening/i)).toBeTruthy();

    instance.onresult?.({
      resultIndex: 0,
      results: Object.assign([[{ transcript: 'What can I afford? ' }]], {
        length: 1,
        item: (index: number) => [{ transcript: 'What can I afford? ' }][index],
        0: Object.assign([{ transcript: 'What can I afford? ' }], { isFinal: true }),
      }),
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('What can I afford?'));
  });

  it('automatically sets the recognition locale matching the active language', async () => {
    await i18n.changeLanguage('ms');
    renderVoice();
    fireEvent.click(screen.getByRole('button'));

    expect(StubRecognition.instances[0].lang).toBe('ms-MY');
  });

  it('supports Chinese speech recognition tag', async () => {
    await i18n.changeLanguage('zh');
    renderVoice();
    fireEvent.click(screen.getByRole('button'));

    expect(StubRecognition.instances[0].lang).toBe('zh-CN');
  });

  it('explains a denied microphone instead of failing silently', async () => {
    renderVoice();
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }));

    StubRecognition.instances[0].onerror?.({ error: 'not-allowed' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/microphone access was blocked/i);
  });

  it('explains a no-speech result', async () => {
    renderVoice();
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }));

    StubRecognition.instances[0].onerror?.({ error: 'no-speech' });

    expect((await screen.findByRole('alert')).textContent).toMatch(/did not catch that/i);
  });

  it('can be stopped, and reports its state via aria-pressed', async () => {
    renderVoice();
    const button = screen.getByRole('button', { name: /start voice input/i });
    fireEvent.click(button);

    const stopButton = await screen.findByRole('button', { name: /stop voice input/i });
    expect(stopButton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(stopButton);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start voice input/i })).toBeTruthy()
    );
  });

  it('leaves the recognised text editable by handing it to the caller', async () => {
    // The component never submits; it only reports text into the caller's input.
    const onTranscript = vi.fn();
    renderVoice(onTranscript);

    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }));
    expect(onTranscript).not.toHaveBeenCalled();
  });
});
