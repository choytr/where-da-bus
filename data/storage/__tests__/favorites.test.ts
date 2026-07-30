import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
} from '../favorites';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    __reset: () => {
      store = {};
    },
  };
});

describe('favorites', () => {
  beforeEach(() => {
    const mocked = jest.mocked(AsyncStorage);
    if ('__reset' in mocked && typeof mocked.__reset === 'function') {
      mocked.__reset();
    }
  });

  it('starts empty', async () => {
    expect(await loadFavorites()).toEqual([]);
  });

  it('adds a favorite and persists it', async () => {
    await addFavorite('4544');
    expect(await loadFavorites()).toEqual(['4544']);
  });

  it('does not duplicate an existing favorite', async () => {
    await addFavorite('4544');
    const result = await addFavorite('4544');
    expect(result).toEqual(['4544']);
  });

  it('removes a favorite', async () => {
    await addFavorite('4544');
    await addFavorite('596');
    expect(await removeFavorite('4544')).toEqual(['596']);
  });

  it('removing an absent id is a no-op', async () => {
    await addFavorite('596');
    expect(await removeFavorite('nope')).toEqual(['596']);
  });

  it('returns an empty list when stored data is corrupt', async () => {
    await AsyncStorage.setItem('favorites.v1', 'not json');
    expect(await loadFavorites()).toEqual([]);
  });

  it('isFavorite reports membership', () => {
    expect(isFavorite(['4544'], '4544')).toBe(true);
    expect(isFavorite(['4544'], '596')).toBe(false);
  });
});
