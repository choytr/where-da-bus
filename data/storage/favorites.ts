import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Favorites store stop IDs only, not stop details. Stop details come from the
 * bundled GTFS database and can be rebuilt from a fresh feed at any time;
 * favorites are the one piece of user state in this app and must survive a
 * GTFS asset update, so the two live in separate storage with separate
 * lifecycles. Resolving a favorite ID to a stop name/location is the GTFS
 * query layer's job (see data/gtfs/sql.ts's stopsByIdsSql), not this file's.
 */
const KEY = 'favorites.v1';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * A read that says whether it worked.
 *
 * **`available: true` with an empty list is not the same fact as
 * `available: false`,** and the difference is the whole reason this type
 * exists. An empty list is a true statement about the user's favorites — they
 * have none, and starring one fixes it. `available: false` says storage did
 * not answer, which is a statement about the device and says nothing about
 * favorites at all. A screen that renders "No saved stops yet" over the second
 * one is lying to someone who may have twenty saved stops.
 *
 * Corrupt content stays on the `true` branch deliberately: `JSON.parse`
 * failing means the read itself succeeded and what came back was not a
 * favorites list. There is nothing there to show, and nothing the app can do
 * about it beyond letting the user star something again.
 */
export type FavoritesRead = { available: true; ids: string[] } | { available: false };

/**
 * Favorite stop IDs with the outcome of the read attached, for callers that
 * put a notice on screen.
 *
 * `loadFavorites` below is the lenient form, for callers that do not.
 */
export async function readFavorites(): Promise<FavoritesRead> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    // The native module refusing to answer — a locked keystore, a full disk, a
    // storage layer that has not finished coming up. Not corruption, and not a
    // reason to believe the user has no favorites.
    return { available: false };
  }

  if (raw === null) return { available: true, ids: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    return { available: true, ids: isStringArray(parsed) ? parsed : [] };
  } catch {
    return { available: true, ids: [] };
  }
}

/**
 * Favorite stop IDs, oldest first. **Never throws**, which it now says
 * truthfully: storage that fails to parse reads as empty, and so does storage
 * that will not answer at all.
 *
 * That second case is a real loss of information, which is why `readFavorites`
 * exists beside it. This form is for callers with nowhere honest to put the
 * distinction — the map swallows a favorites failure on purpose, because stars
 * are not what that screen is for and it will not take a map down over one.
 * Picking this function is choosing to ignore the difference, and should stay
 * a choice rather than the only option.
 */
export async function loadFavorites(): Promise<string[]> {
  const read = await readFavorites();
  return read.available ? read.ids : [];
}

async function save(ids: string[]): Promise<string[]> {
  // Deliberately unguarded. A write that cannot be made must reach the caller:
  // catching here and returning `ids` would light the star on screen over
  // nothing, and the user would find out at the next launch.
  await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  return ids;
}

/**
 * Every write, one at a time.
 *
 * Both mutators are load → mutate → save, and nothing stopped a second one
 * starting inside the first — so two stars tapped inside one AsyncStorage
 * round trip read the same list and the second save discarded the first. The
 * star lit up, and the favorite was gone on the next launch.
 *
 * A chain rather than a lock or a queue object: there is one writer in one
 * process, and ordering is the entire requirement. `pending` deliberately
 * tracks *completion* and not success — a rejected write left in it would
 * reject every later call for the life of the process, turning one full disk
 * into favorites that never work again.
 */
let pending: Promise<void> = Promise.resolve();

function serialised<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.then(
    () => {},
    () => {},
  );
  return result;
}

/** Adding an already-favorited stop is a no-op that still returns the current list. */
export function addFavorite(stopId: string): Promise<string[]> {
  return serialised(async () => {
    const current = await loadFavorites();
    if (current.includes(stopId)) return current;
    return save([...current, stopId]);
  });
}

/** Removing an absent stop is a no-op that still returns the current list. */
export function removeFavorite(stopId: string): Promise<string[]> {
  return serialised(async () => {
    const current = await loadFavorites();
    return save(current.filter((id) => id !== stopId));
  });
}

/**
 * Synchronous membership check against an already-loaded list, so screens
 * that hold favorites in state (e.g. a stop list rendering a filled/outline
 * star per row) don't need to await AsyncStorage on every render.
 */
export function isFavorite(favorites: string[], stopId: string): boolean {
  return favorites.includes(stopId);
}
