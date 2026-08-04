import { Text } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { TheBusProvider, useTheBus, type ApiKeyStorage } from '../provider';

/**
 * The provider takes its storage as a prop, so this is the whole of it — no
 * keychain, no native module, nothing to reset between files. The real
 * implementation is data/storage/apiKey.ts and is tested on its own.
 */
function fakeStorage(initial: string | null = null): ApiKeyStorage & {
  stored: () => string | null;
} {
  let value = initial;
  return {
    load: async () => value,
    save: async (key) => {
      value = key;
    },
    clear: async () => {
      value = null;
    },
    stored: () => value,
  };
}

const KEY = '3f7c1e92-8a4b-4d16-9f03-c5e28b71da40';
const OTHER = '9b2d4f60-1c3a-4e57-8d09-2a6f4b8c1e35';

let storage: ApiKeyStorage & { stored: () => string | null };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TheBusProvider storage={storage}>{children}</TheBusProvider>
);

async function mounted() {
  const hook = await renderHook(() => useTheBus(), { wrapper });
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
  });
  return hook;
}

describe('TheBusProvider', () => {
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('builds no client before a key is loaded', async () => {
    // The load has to be genuinely pending to be observed. `await renderHook`
    // flushes microtasks, so a storage that resolves immediately has already
    // finished loading by the time the first assertion runs — which is why
    // this holds the promise open rather than seeding a value.
    let release = (_key: string | null) => {};
    storage = {
      ...fakeStorage(),
      load: () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
      stored: () => null,
    };

    const { result } = await renderHook(() => useTheBus(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.client).toBeNull();
    expect(result.current.key).toBeNull();

    await act(async () => {
      release(KEY);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.client).not.toBeNull();
  });

  it('builds no client when there is no stored key', async () => {
    const { result } = await mounted();
    expect(result.current.client).toBeNull();
    expect(result.current.key).toBeNull();
  });

  it('builds a client once a key is stored', async () => {
    const { result } = await mounted();

    await act(async () => {
      await result.current.setKey(KEY);
    });

    expect(result.current.key).toBe(KEY);
    expect(result.current.client).not.toBeNull();
  });

  it('restores a stored key on mount', async () => {
    storage = fakeStorage(KEY);
    const { result } = await mounted();

    expect(result.current.key).toBe(KEY);
    expect(result.current.client).not.toBeNull();
  });

  it('builds a new client when the key changes', async () => {
    storage = fakeStorage(KEY);
    const { result } = await mounted();
    const first = result.current.client;

    await act(async () => {
      await result.current.setKey(OTHER);
    });

    // Identity is the assertion, and it is the mechanism rather than a proxy
    // for it: withCache holds its cache in a closure over one client, so a new
    // client is a new cache. That is what stops the thirty seconds after a key
    // change from being served results fetched with the old one.
    expect(result.current.client).not.toBe(first);
    expect(result.current.client).not.toBeNull();
  });

  it('keeps the same client when the key does not change', async () => {
    storage = fakeStorage(KEY);
    const { result, rerender } = await mounted();
    const first = result.current.client;

    await rerender({});

    expect(result.current.client).toBe(first);
  });

  it('persists the key it is given', async () => {
    const { result } = await mounted();

    await act(async () => {
      await result.current.setKey(KEY);
    });

    expect(storage.stored()).toBe(KEY);
  });

  it('drops the client when the key is cleared', async () => {
    storage = fakeStorage(KEY);
    const { result } = await mounted();

    await act(async () => {
      await result.current.clearKey();
    });

    expect(result.current.key).toBeNull();
    expect(result.current.client).toBeNull();
    expect(storage.stored()).toBeNull();
  });

  it('does not report a key it failed to persist', async () => {
    // A credential is not a preference. The theme provider applies optimistically
    // and persists in the background because losing a theme costs nothing; a key
    // the app reports as saved and did not save strands the user at onboarding
    // on the next launch with no explanation.
    const { result } = await mounted();
    storage.save = async () => {
      throw new Error('keychain unavailable');
    };

    await act(async () => {
      await expect(result.current.setKey(KEY)).rejects.toThrow(/keychain/);
    });

    expect(result.current.key).toBeNull();
    expect(result.current.client).toBeNull();
  });

  it('throws when used outside a provider, rather than answering with no client', async () => {
    // Same guard as useTheme. A null-object default would make a missing
    // provider look exactly like a user who has not set a key yet, which is a
    // state the app now renders a whole screen for.
    const Bare = () => {
      useTheBus();
      return <Text>unreachable</Text>;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Bare />)).rejects.toThrow(/TheBusProvider/);

    spy.mockRestore();
  });
});
