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
 * Favorite stop IDs, oldest first. Storage that fails to parse as a string
 * array reads as empty rather than throwing — a corrupt favorites list
 * should not crash the app, just leave the user with no favorites to redo.
 */
export async function loadFavorites(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStringArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function save(ids: string[]): Promise<string[]> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  return ids;
}

/** Adding an already-favorited stop is a no-op that still returns the current list. */
export async function addFavorite(stopId: string): Promise<string[]> {
  const current = await loadFavorites();
  if (current.includes(stopId)) return current;
  return save([...current, stopId]);
}

/** Removing an absent stop is a no-op that still returns the current list. */
export async function removeFavorite(stopId: string): Promise<string[]> {
  const current = await loadFavorites();
  return save(current.filter((id) => id !== stopId));
}

/**
 * Synchronous membership check against an already-loaded list, so screens
 * that hold favorites in state (e.g. a stop list rendering a filled/outline
 * star per row) don't need to await AsyncStorage on every render.
 */
export function isFavorite(favorites: string[], stopId: string): boolean {
  return favorites.includes(stopId);
}
