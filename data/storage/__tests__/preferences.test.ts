import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadThemePreference, saveThemePreference } from '../preferences';

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
 * Reaching the mock's own helpers without asserting on the module type. The
 * project forbids `as`, and jest.mocked() types this as the real AsyncStorage,
 * which has neither helper.
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

describe('theme preference', () => {
  beforeEach(() => reset());

  it('defaults to automatic when nothing is stored', async () => {
    expect(await loadThemePreference()).toBe('automatic');
  });

  it('round-trips light', async () => {
    await saveThemePreference('light');
    expect(await loadThemePreference()).toBe('light');
  });

  it('round-trips dark', async () => {
    await saveThemePreference('dark');
    expect(await loadThemePreference()).toBe('dark');
  });

  it('round-trips automatic', async () => {
    await saveThemePreference('dark');
    await saveThemePreference('automatic');
    expect(await loadThemePreference()).toBe('automatic');
  });

  it('falls back to automatic on an unrecognised stored value', async () => {
    seed('theme.v1', 'solarized');
    expect(await loadThemePreference()).toBe('automatic');
  });

  it('falls back to automatic on an empty stored value', async () => {
    seed('theme.v1', '');
    expect(await loadThemePreference()).toBe('automatic');
  });

  it('does not share storage with favorites', async () => {
    seed('favorites.v1', '["596"]');
    expect(await loadThemePreference()).toBe('automatic');
  });
});
