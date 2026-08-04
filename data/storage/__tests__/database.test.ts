import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BUNDLED_DATABASE,
  loadCurrentDatabase,
  loadLastChecked,
  saveCurrentDatabase,
  saveLastChecked,
} from '../database';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    __seed: (k: string, v: string) => {
      store[k] = v;
    },
    __reset: () => {
      store = {};
    },
  };
});

/**
 * Reaching the mock's own helpers without asserting on the module type — the
 * project forbids `as`, and jest.mocked() types this as the real AsyncStorage,
 * which has neither helper. Same shape as preferences.test.ts.
 */
function mockHelper(name: string): (...args: string[]) => void {
  const mocked: Record<string, unknown> = jest.mocked(AsyncStorage);
  const helper = mocked[name];
  if (typeof helper !== 'function') throw new Error(`mock is missing ${name}`);
  return (...args: string[]) => {
    helper(...args);
  };
}

const seed = mockHelper('__seed');
const reset = mockHelper('__reset');

const generation = { file: 'gtfs-v1-20260810T120000Z.db', builtAt: '2026-08-10T12:00:00Z' };

beforeEach(() => {
  reset();
  jest.clearAllMocks();
});

describe('the current-database pointer', () => {
  /**
   * The state of a fresh install, and the state a device returns to if every
   * download has failed. It is the reason `assets/db/gtfs.db` is still in the
   * bundle at all.
   */
  it('falls back to the bundled database when no pointer is set', async () => {
    expect(await loadCurrentDatabase()).toBeNull();
  });

  it('opens the pointed-to generation once one is stored', async () => {
    await saveCurrentDatabase(generation);
    expect(await loadCurrentDatabase()).toEqual(generation);
  });

  /**
   * A corrupt pointer costs one stale launch, not a dead app — the thing it
   * falls back to is a database that definitely exists. Same forgiving shape as
   * loadFavorites, for a stronger reason.
   */
  it('falls back to the bundled database rather than throwing on unreadable storage', async () => {
    seed('gtfs.current.v1', 'not json at all');
    expect(await loadCurrentDatabase()).toBeNull();

    seed('gtfs.current.v1', JSON.stringify({ file: 'x.db' }));
    expect(await loadCurrentDatabase()).toBeNull();

    seed('gtfs.current.v1', JSON.stringify(['gtfs-v1-x.db']));
    expect(await loadCurrentDatabase()).toBeNull();
  });

  it('names the bundled asset the app actually ships', () => {
    expect(BUNDLED_DATABASE).toBe('gtfs.db');
  });
});

describe('the last-checked timestamp', () => {
  it('is null until the app has checked once', async () => {
    expect(await loadLastChecked()).toBeNull();
  });

  it('round-trips as an ISO instant', async () => {
    const at = new Date('2026-08-10T12:34:56.000Z');
    await saveLastChecked(at);
    expect(await loadLastChecked()).toBe('2026-08-10T12:34:56.000Z');
  });

  /**
   * Written whether the check succeeded or not, and stored separately from the
   * pointer: "when did it last look" and "what is it using" are different
   * facts, and a failed check must still be able to say the first without
   * disturbing the second.
   */
  it('is independent of the pointer', async () => {
    await saveCurrentDatabase(generation);
    await saveLastChecked(new Date('2026-08-11T00:00:00.000Z'));

    expect(await loadCurrentDatabase()).toEqual(generation);
    expect(await loadLastChecked()).toBe('2026-08-11T00:00:00.000Z');
  });
});
