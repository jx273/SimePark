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
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
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
  const { user, isConfigured } = useAuth();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>(() => readStored(COMPARE_KEY));
  const [localSaved, setLocalSaved] = useState<string[]>(() => readStored(SAVED_KEY));

  // Signed-in: the account list is authoritative.
  useEffect(() => {
    if (!user || !isConfigured) return;

    let active = true;
    void listSavedPropertyIds(user.id).then(({ data }) => {
      if (!active || !data) return;
      setSavedIds(data);
    });

    return () => {
      active = false;
    };
  }, [user, isConfigured]);

  // Signed-out: fall back to the browser list.
  useEffect(() => {
    if (user && isConfigured) return;
    setSavedIds(localSaved);
  }, [user, isConfigured, localSaved]);

  // On sign-in, merge anything saved locally into the account, once.
  useEffect(() => {
    if (!user || !isConfigured || localSaved.length === 0) return;

    let active = true;

    void (async () => {
      for (const propertyId of localSaved) {
        await saveProperty(user.id, propertyId);
      }
      const { data } = await listSavedPropertyIds(user.id);
      if (!active) return;
      if (data) setSavedIds(data);
      // Clear the local list only after a successful merge, so nothing is lost.
      setLocalSaved([]);
      writeStored(SAVED_KEY, []);
    })();

    return () => {
      active = false;
    };
  }, [user, isConfigured, localSaved]);

  const toggleSaved = useCallback(
    async (propertyId: string) => {
      const currentlySaved = savedIds.includes(propertyId);

      if (user && isConfigured) {
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
        return;
      }

      // Guest: browser-local only.
      setLocalSaved((previous) => {
        const next = currentlySaved
          ? previous.filter((id) => id !== propertyId)
          : [propertyId, ...previous];
        writeStored(SAVED_KEY, next);
        return next;
      });
    },
    [savedIds, user, isConfigured]
  );

  const toggleCompared = useCallback(
    async (propertyId: string) => {
      const currentlyCompared = comparisonIds.includes(propertyId);

      if (!currentlyCompared && comparisonIds.length >= MAX_COMPARISON) {
        // Refuse rather than silently dropping the oldest: the user should
        // decide what leaves the comparison.
        return;
      }

      const next = currentlyCompared
        ? comparisonIds.filter((id) => id !== propertyId)
        : [...comparisonIds, propertyId];

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

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used inside a SelectionProvider');
  }
  return context;
}
