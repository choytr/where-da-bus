import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { withCache } from './cache';
import { createTheBusClient, type TheBusClient } from './client';

/**
 * The client, rebuilt whenever the key changes.
 *
 * Before Increment 4 this was a module-level singleton built at import time
 * from an environment variable — `export const theBus = withCache(...)`. That
 * cannot survive a key the user can edit: an AppID baked in at import is one
 * the app can never replace without a relaunch.
 *
 * How the key outlives the process. Passed in rather than imported so this
 * file stays free of the keychain, and so a test can drive the provider with a
 * plain object instead of mocking a native module. The edge runs storage ->
 * thebus and never back; importing data/storage/apiKey.ts here would put a
 * native module in the graph of every screen that asks for arrivals, which is
 * the coupling lib/legal.ts and ThemeProvider both exist to break.
 */
export type ApiKeyStorage = {
  load: () => Promise<string | null>;
  save: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

export type TheBus = {
  /** `null` exactly when there is no key. The gate means no screen sees that. */
  client: TheBusClient | null;
  key: string | null;
  /** True until the stored key has been read. See KeyGate for why it renders nothing. */
  loading: boolean;
  /** Rejects if the key could not be persisted, leaving the state unchanged. */
  setKey: (key: string) => Promise<void>;
  clearKey: () => Promise<void>;
};

/**
 * No default value, so useTheBus can tell "outside a provider" from "inside one
 * with no key yet". A null-object default would make a missing provider look
 * exactly like a user who has not registered — a state the app now renders a
 * whole screen for, so the mistake would be invisible.
 */
const TheBusContext = createContext<TheBus | null>(null);

export function TheBusProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage: ApiKeyStorage;
}): React.JSX.Element {
  const [key, setKeyState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void storage.load().then((stored) => {
      if (cancelled) return;
      setKeyState(stored);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /**
   * A new key means a new client, and therefore a new cache.
   *
   * That second half is the point, and it will look accidental otherwise:
   * withCache keys its entries by stop code alone, so a cache that outlived a
   * key change would spend the next thirty seconds serving results fetched
   * with the key the user just replaced — including the failures that made
   * them replace it. Rebuilding the client closes that without withCache
   * needing a clear() method it has no other reason to have.
   */
  const client = useMemo(
    () => (key === null ? null : withCache(createTheBusClient({ appId: key }))),
    [key],
  );

  /**
   * Persist first, then apply. The reverse order — the optimistic one
   * ThemeProvider uses — is right for a preference and wrong for a credential:
   * a key reported as saved that was not saved sends the user back to
   * onboarding on the next launch with nothing to explain it.
   */
  const setKey = useCallback(
    async (next: string) => {
      await storage.save(next);
      setKeyState(next);
    },
    [storage],
  );

  const clearKey = useCallback(async () => {
    await storage.clear();
    setKeyState(null);
  }, [storage]);

  const value = useMemo<TheBus>(
    () => ({ client, key, loading, setKey, clearKey }),
    [client, key, loading, setKey, clearKey],
  );

  return <TheBusContext.Provider value={value}>{children}</TheBusContext.Provider>;
}

export function useTheBus(): TheBus {
  const theBus = useContext(TheBusContext);
  if (theBus === null) {
    throw new Error('useTheBus must be used inside a TheBusProvider');
  }
  return theBus;
}
