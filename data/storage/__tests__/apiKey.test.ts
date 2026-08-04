import * as SecureStore from 'expo-secure-store';
import { apiKeyStorage, clearApiKey, loadApiKey, saveApiKey } from '../apiKey';

/**
 * A real keychain is not available under Jest, so this substitutes a plain
 * store. It is the same shape as preferences.test.ts's AsyncStorage mock, with
 * one addition: the keychain can *fail* in ways AsyncStorage does not — a
 * locked device, a missing entitlement — and loadApiKey's contract is that
 * those read as "no key" rather than as a crash on launch. `__fail` is how
 * that gets exercised.
 */
jest.mock('expo-secure-store', () => {
  let store: Record<string, string> = {};
  let failing = false;
  const guard = () => {
    if (failing) throw new Error('keychain unavailable');
  };
  return {
    getItemAsync: jest.fn(async (k: string) => {
      guard();
      return store[k] ?? null;
    }),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      guard();
      store[k] = v;
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      guard();
      delete store[k];
    }),
    __seed: (k: string, v: string) => {
      store[k] = v;
    },
    __fail: () => {
      failing = true;
    },
    __reset: () => {
      store = {};
      failing = false;
    },
  };
});

/**
 * Reaching the mock's own helpers without asserting on the module type — the
 * project forbids `as`, and jest.mocked() types this as the real module, which
 * has none of them. Same approach as preferences.test.ts.
 */
function mockHelper(name: string): (...args: string[]) => void {
  const mocked: Record<string, unknown> = jest.mocked(SecureStore);
  const helper = mocked[name];
  if (typeof helper !== 'function') throw new Error(`mock is missing ${name}`);
  return (...args: string[]) => {
    helper(...args);
  };
}

const seed = mockHelper('__seed');
const fail = mockHelper('__fail');
const reset = mockHelper('__reset');

/** A realistic AppID: the vendor issues GUIDs. */
const KEY = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';

describe('api key storage', () => {
  beforeEach(() => reset());

  it('returns null when nothing is stored', async () => {
    expect(await loadApiKey()).toBeNull();
  });

  it('round-trips a key', async () => {
    await saveApiKey(KEY);
    expect(await loadApiKey()).toBe(KEY);
  });

  it('returns null when the keychain throws', async () => {
    seed('thebus.appId.v1', KEY);
    fail();
    expect(await loadApiKey()).toBeNull();
  });

  it('clears on a blank key', async () => {
    await saveApiKey(KEY);
    await saveApiKey('   ');
    expect(await loadApiKey()).toBeNull();
  });

  it('clears on an empty key', async () => {
    await saveApiKey(KEY);
    await saveApiKey('');
    expect(await loadApiKey()).toBeNull();
  });

  it('trims a pasted key', async () => {
    // Pasting on iOS routinely carries a trailing newline or space, and the
    // AppID goes straight into a query string. An untrimmed key is rejected by
    // the API and looks to the user exactly like a wrong one.
    await saveApiKey(`  ${KEY}\n`);
    expect(await loadApiKey()).toBe(KEY);
  });

  it('reads a stored key back as null once cleared', async () => {
    await saveApiKey(KEY);
    await clearApiKey();
    expect(await loadApiKey()).toBeNull();
  });

  it('does not throw when clearing a key that was never set', async () => {
    await expect(clearApiKey()).resolves.toBeUndefined();
  });

  it('stores under its own key, not one shared with the preferences', async () => {
    seed('theme.v1', 'dark');
    expect(await loadApiKey()).toBeNull();
  });

  it('exposes the same shape the provider is handed', async () => {
    await apiKeyStorage.save(KEY);
    expect(await apiKeyStorage.load()).toBe(KEY);
    await apiKeyStorage.clear();
    expect(await apiKeyStorage.load()).toBeNull();
  });
});
