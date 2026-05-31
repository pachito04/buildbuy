import { useState, useEffect, useRef, useCallback } from 'react';

const DEBOUNCE_MS = 500;

export interface PersistedDraftResult<T> {
  value: T;
  setValue: (updater: T | ((prev: T) => T)) => void;
  clear: () => void;
  hadSavedDraft: boolean;
}

/**
 * Generic hook for persisting form draft state to localStorage.
 *
 * - Loads any existing draft synchronously on mount.
 * - Writes to localStorage after a ~500ms debounce so rapid typing yields one write.
 * - `clear()` removes the key AND suppresses the next autosave cycle — so a
 *   "discard" action won't immediately re-persist the emptied form state.
 *
 * @param key         localStorage key to use.
 * @param initial     Initial/fallback value (used when no draft exists or on bad JSON).
 * @param serialize   Optional custom serializer (defaults to JSON.stringify).
 * @param deserialize Optional custom deserializer (defaults to JSON.parse with fallback).
 */
export function usePersistedDraft<T>(
  key: string,
  initial: T,
  serialize?: (value: T) => string,
  deserialize?: (raw: string | null, fallback: T) => T,
): PersistedDraftResult<T> {
  const doSerialize = serialize ?? ((v: T) => JSON.stringify(v));
  const doDeserialize =
    deserialize ??
    ((raw: string | null, fallback: T): T => {
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    });

  // Detect whether a draft existed at mount time (before we load it).
  const hadSavedDraftRef = useRef<boolean>(false);

  const [value, setValueInternal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        hadSavedDraftRef.current = true;
        return doDeserialize(raw, initial);
      }
    } catch {
      // localStorage unavailable (SSR, private mode, etc.)
    }
    return initial;
  });

  // hadSavedDraft is derived from ref — stable across renders.
  const hadSavedDraft = hadSavedDraftRef.current;

  // suppressRef: when true, skip the next scheduled autosave (set by clear()).
  const suppressRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync to localStorage whenever `value` changes (debounced).
  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      if (suppressRef.current) {
        // Consume the suppression for this one cycle, then re-enable autosave.
        suppressRef.current = false;
        return;
      }
      try {
        localStorage.setItem(key, doSerialize(value));
      } catch {
        // Quota exceeded or unavailable — silently swallow.
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key]);

  const setValue = useCallback((updater: T | ((prev: T) => T)) => {
    setValueInternal((prev) =>
      typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater,
    );
  }, []);

  const clear = useCallback(() => {
    // Cancel any pending debounced write.
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // Remove the persisted key immediately.
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
    // Suppress the next autosave triggered by the state reset below.
    suppressRef.current = true;
    setValueInternal(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, initial]);

  return { value, setValue, clear, hadSavedDraft };
}
