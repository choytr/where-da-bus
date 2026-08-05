import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadFavorites,
  readFavorites,
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

  /**
   * Each of `addFavorite` and `removeFavorite` is a load → mutate → save, and
   * nothing used to stop a second one starting inside the first. Two stars
   * tapped inside one AsyncStorage round trip both read the same list, and the
   * second save overwrites the first — so the star lights up on screen and the
   * favorite is gone on the next launch, which is the worst way to lose user
   * state: silently, and only visible much later.
   */
  describe('concurrent writes', () => {
    it('two stars added concurrently both survive', async () => {
      await Promise.all([addFavorite('4544'), addFavorite('596')]);
      expect(await loadFavorites()).toEqual(['4544', '596']);
    });

    it('an add and a remove of different stops interleave without loss', async () => {
      await addFavorite('4544');
      await addFavorite('596');

      await Promise.all([addFavorite('11'), removeFavorite('4544')]);

      expect(await loadFavorites()).toEqual(['596', '11']);
    });

    /**
     * The chain tracks *completion*, not success. A `pending` left holding a
     * rejected promise would reject every later call forever — one failed write
     * turning into favorites that never work again for the life of the process.
     */
    it('a rejected write does not wedge the chain for later calls', async () => {
      jest
        .mocked(AsyncStorage.setItem)
        .mockRejectedValueOnce(new Error('no space left on device'));

      await expect(addFavorite('4544')).rejects.toThrow();
      await expect(addFavorite('596')).resolves.toEqual(['596']);
    });
  });

  /**
   * "Your favorites are empty" and "storage is not answering" are different
   * facts, and this project does not render two different facts alike.
   */
  describe('storage failure', () => {
    it('a rejected getItem does not throw out of loadFavorites', async () => {
      jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('I/O error'));

      await expect(loadFavorites()).resolves.toEqual([]);
    });

    /**
     * The distinction the lenient reader cannot carry. Corrupt content is a
     * successful read of a list that turned out to be nonsense — the user has
     * no favorites, which is true and recoverable by starring one. Unreadable
     * storage is not a statement about favorites at all.
     */
    it('tells unreadable storage apart from a corrupt list', async () => {
      jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('I/O error'));
      expect(await readFavorites()).toEqual({ available: false });

      await AsyncStorage.setItem('favorites.v1', 'not json');
      expect(await readFavorites()).toEqual({ available: true, ids: [] });
    });

    it('a rejected setItem reports failure rather than a silent no-op', async () => {
      jest
        .mocked(AsyncStorage.setItem)
        .mockRejectedValueOnce(new Error('no space left on device'));

      await expect(addFavorite('4544')).rejects.toThrow();
      // And it really did not save — a caught-and-ignored write that returned
      // the list would leave the star lit over nothing.
      expect(await loadFavorites()).toEqual([]);
    });
  });
});
