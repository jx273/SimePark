/**
 * Optional voice-to-text input for the AI assistant.
 *
 * Scope and honesty:
 *  - Uses the browser's built-in SpeechRecognition (Web Speech API). No paid
 *    speech service is involved and nothing is sent to our own backend.
 *  - Recognition availability, the audio path (which may be processed by the
 *    browser vendor's servers rather than on-device), and accuracy vary by
 *    browser and platform. This component therefore treats recognition as a
 *    best-effort convenience: text input always remains available, and every
 *    failure mode produces an explanation instead of a dead button.
 *  - The recognised text is placed in the caller's input so the user can edit it
 *    before sending. Nothing is sent automatically.
 *
 * Language handling: only English and Bahasa Melayu are offered, as agreed.
 * English uses `en-MY` and Malay uses `ms-MY`; where a browser does not accept a
 * country-specific tag, `start()` failure is caught and reported rather than
 * silently ignored.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './VoiceInput.css';

/* ---------------------------------------------------------------- */
/* Minimal typings for the Web Speech API                            */
/* ---------------------------------------------------------------- */

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/** The recognition constructor available in this browser, if any. */
export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = window as SpeechWindow;
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

/** Voice languages supported. SpeechRecognition supports en-MY, ms-MY, and zh-CN. */
export const VOICE_LANGUAGES = [
  { code: 'en', tag: 'en-MY', label: 'English' },
  { code: 'ms', tag: 'ms-MY', label: 'Bahasa Melayu' },
  { code: 'zh', tag: 'zh-CN', label: '中文' },
] as const;

export type VoiceLanguageCode = (typeof VOICE_LANGUAGES)[number]['code'];

/**
 * BCP-47 tag passed to SpeechRecognition. Automatically reflects the active language:
 * English -> 'en-MY', Malay -> 'ms-MY', Chinese -> 'zh-CN'.
 */
export function recognitionTagFor(chosen: string): string {
  if (chosen.startsWith('zh')) return 'zh-CN';
  if (chosen.startsWith('ms')) return 'ms-MY';
  return 'en-MY';
}

/** Stable key for a recognition error, translated by the UI. */
export type VoiceErrorKey = 'permissionDenied' | 'noSpeech' | 'unsupportedLanguage' | 'error';

export function classifySpeechError(error: string): VoiceErrorKey {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'permissionDenied';
  if (error === 'no-speech') return 'noSpeech';
  if (error === 'language-not-supported') return 'unsupportedLanguage';
  return 'error';
}

interface VoiceInputProps {
  /** Receives the recognised text; the caller owns the input value. */
  onTranscript: (text: string) => void;
  /** Disable while a reply is being generated. */
  disabled?: boolean;
}

export default function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const { t, i18n } = useTranslation();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [errorKey, setErrorKey] = useState<VoiceErrorKey | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Feature detection must happen after mount: the constructor is not available
  // during server-style rendering and is undefined in unsupported browsers.
  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
  }, []);

  // Stop recognition if the component unmounts or becomes disabled mid-session.
  useEffect(() => {
    if (disabled && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
  }, [disabled]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setSupported(false);
      return;
    }

    setErrorKey(null);

    const recognition = new Recognition();
    recognition.lang = recognitionTagFor(i18n.language);
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      // Concatenate every final result so a multi-clause sentence arrives whole.
      let transcript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) transcript += result[0]?.transcript ?? '';
      }

      const trimmed = transcript.trim();
      if (trimmed) onTranscript(trimmed);
    };

    recognition.onerror = (event) => {
      setListening(false);
      setErrorKey(classifySpeechError(event.error));
    };

    // Fires after both a successful result and an error, so it is the reliable
    // place to clear the listening state.
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // Some browsers throw when start() is called twice or when the permission
      // prompt is already open.
      setListening(false);
      setErrorKey('error');
    }
  }, [i18n.language, onTranscript]);

  const errorMessage = useMemo(() => {
    if (!errorKey) return null;
    return t(`voice.${errorKey}`);
  }, [errorKey, t]);

  if (!supported) {
    // Graceful degradation: explain, and point at the always-available text box.
    return (
      <p className="voice voice--unsupported" role="note">
        <span aria-hidden="true">🎙</span> {t('voice.unsupported')}
      </p>
    );
  }

  return (
    <div className="voice">
      <div className="voice__controls">
        <button
          type="button"
          className={`voice__button${listening ? ' is-listening' : ''}`}
          onClick={listening ? stop : start}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? t('voice.stop') : t('voice.start')}
        >
          <span aria-hidden="true">{listening ? '■' : '🎙'}</span>
          <span>{listening ? t('voice.stop') : t('voice.start')}</span>
        </button>
      </div>

      {/* A text indicator as well as the pulsing dot, so the state is never
          communicated by colour or animation alone. */}
      <p className="voice__status" role="status" aria-live="polite">
        {listening ? (
          <>
            <span className="voice__pulse" aria-hidden="true" />
            {t('voice.listening')}
          </>
        ) : (
          t('voice.hint')
        )}
      </p>

      {errorMessage && (
        <p className="voice__error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
