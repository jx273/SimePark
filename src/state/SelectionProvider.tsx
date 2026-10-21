/**
 * Favourites and comparison selection.
 *
 * Guests get a real, working experience: their selection is persisted in
 * `localStorage`, so saved homes and a comparison survive a reload without an
 * account. When they sign in, the local selection is pushed to their account and
 * the database list becomes the source of truth.
 *
 * Comparison is capped at three properties, matching the agreed limit. The cap is
 * enforced in one place here so no caller can exceed it.
 *
 * Only property IDs are stored. Property facts always come from the catalogue, so
 * a saved reference can never go stale or diverge from the real record.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { navigate } from '../router/router';
import {
  listSavedPropertyIds,
  saveProperty,
  unsaveProperty,
  recordComparison,
} from '../lib/userRepository';
import { ASSISTANT_LIMITS } from '../types/assistant';

const SAVED_KEY = 'simepark.savedProperties';
const COMPARE_KEY = 'simepark.comparison';

/** Maximum properties in one comparison set. */
export const MAX_COMPARISON = ASSISTANT_LIMITS.maxComparisonProperties;

function readStored(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function readComparison(): string[] {
  return [...new Set(readStored(COMPARE_KEY))].slice(0, MAX_COMPARISON);
}

function writeStored(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the selection simply will not persist.
  }
}

export interface SelectionContextValue {
  savedIds: string[];
  comparisonIds: string[];
  isSaved: (propertyId: string) => boolean;
  isCompared: (propertyId: string) => boolean;
  toggleSaved: (propertyId: string) => Promise<void>;
  toggleCompared: (propertyId: string) => Promise<void>;
  clearComparison: () => void;
  /** True when the comparison is already at the cap. */
  comparisonFull: boolean;
  /** True when saving to an account is possible. */
  canPersistToAccount: boolean;
}

export const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isConfigured } = useAuth();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>(readComparison);
  const comparisonIdsRef = useRef(comparisonIds);
  const [authPromptPropertyId, setAuthPromptPropertyId] = useState<string | null>(null);

  // Signed-in: the account list is authoritative.
  useEffect(() => {
    if (!user || !isConfigured) {
      setSavedIds([]);
      return;
    }

    let active = true;

    // Save any pending property from when the user was prompted to sign in
    try {
      const intended = sessionStorage.getItem('simepark_favorite_intended');
      if (intended) {
        sessionStorage.removeItem('simepark_favorite_intended');
        void saveProperty(user.id, intended).then(() => {
          if (!active) return;
          void listSavedPropertyIds(user.id).then(({ data }) => {
            if (active && data) setSavedIds(data);
          });
        });
      }
    } catch {
      // Session storage access error ignored
    }

    void listSavedPropertyIds(user.id).then(({ data }) => {
      if (!active || !data) return;
      setSavedIds(data);
    });

    return () => {
      active = false;
    };
  }, [user, isConfigured]);

  const toggleSaved = useCallback(
    async (propertyId: string) => {
      // Guests cannot silently save favorites; prompt to sign in or register
      if (!user || !isConfigured) {
        setAuthPromptPropertyId(propertyId);
        return;
      }

      const currentlySaved = savedIds.includes(propertyId);

      // Optimistic update, reverted if the write fails.
      setSavedIds((previous) =>
        currentlySaved
          ? previous.filter((id) => id !== propertyId)
          : [propertyId, ...previous]
      );

      const result = currentlySaved
        ? await unsaveProperty(user.id, propertyId)
        : await saveProperty(user.id, propertyId);

      if (result.error) {
        setSavedIds((previous) =>
          currentlySaved
            ? [propertyId, ...previous]
            : previous.filter((id) => id !== propertyId)
        );
      }
    },
    [savedIds, user, isConfigured]
  );

  const toggleCompared = useCallback(
    async (propertyId: string) => {
      const current = comparisonIdsRef.current;
      const currentlyCompared = current.includes(propertyId);

      if (!currentlyCompared && current.length >= MAX_COMPARISON) {
        // Refuse rather than silently dropping the oldest: the user should
        // decide what leaves the comparison.
        return;
      }

      const next = currentlyCompared
        ? current.filter((id) => id !== propertyId)
        : [...current, propertyId];

      comparisonIdsRef.current = next;
      setComparisonIds(next);
      writeStored(COMPARE_KEY, next);

      if (user && isConfigured && !currentlyCompared) {
        // Recorded as history only; the working set stays in the browser.
        await recordComparison(user.id, next);
      }
    },
    [comparisonIds, user, isConfigured]
  );

  const clearComparison = useCallback(() => {
    comparisonIdsRef.current = [];
    setComparisonIds([]);
    writeStored(COMPARE_KEY, []);
  }, []);

  const value = useMemo<SelectionContextValue>(
    () => ({
      savedIds,
      comparisonIds,
      isSaved: (propertyId) => savedIds.includes(propertyId),
      isCompared: (propertyId) => comparisonIds.includes(propertyId),
      toggleSaved,
      toggleCompared,
      clearComparison,
      comparisonFull: comparisonIds.length >= MAX_COMPARISON,
      canPersistToAccount: Boolean(user && isConfigured),
    }),
    [savedIds, comparisonIds, toggleSaved, toggleCompared, clearComparison, user, isConfigured]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
      {authPromptPropertyId && (
        <div
          className="auth-prompt-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-prompt-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAuthPromptPropertyId(null);
          }}
        >
          <div className="auth-prompt-modal surface">
            <h3 id="auth-prompt-title" className="auth-prompt-modal__title">
              ♡ {t('auth.savePromptTitle')}
            </h3>
            <p className="auth-prompt-modal__text">
              {t('auth.savePromptText')}
            </p>
            <div className="auth-prompt-modal__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  try {
                    sessionStorage.setItem('simepark_favorite_intended', authPromptPropertyId);
                  } catch {
                    // Ignore storage errors
                  }
                  setAuthPromptPropertyId(null);
                  navigate({ name: 'auth', mode: 'signin' });
                }}
              >
                {t('nav.signIn')}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  try {
                    sessionStorage.setItem('simepark_favorite_intended', authPromptPropertyId);
                  } catch {
                    // Ignore storage errors
                  }
                  setAuthPromptPropertyId(null);
                  navigate({ name: 'auth', mode: 'signup' });
                }}
              >
                {t('nav.signUp')}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setAuthPromptPropertyId(null)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used inside a SelectionProvider');
  }
  return context;
}
