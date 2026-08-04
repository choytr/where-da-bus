import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which generation of the stop database the app is using, and when it last
 * looked for a newer one.
 *
 * This is the pointer half of "generation-numbered files plus a stored
 * pointer" — Capistrano's `releases/` and `current`, with a value in
 * AsyncStorage standing in for the symlink. Nothing ever overwrites a database
 * SQLite has open: each build lands at its own filename, this moves, and the
 * previous generation is deleted on the *next* launch when nothing holds it.
 *
 * Null means the bundled floor. That is the state a fresh install is in, and
 * the state a device returns to if every download has failed — which is the
 * whole reason `assets/db/gtfs.db` is still in the bundle.
 */
const CURRENT = 'gtfs.current.v1';
const LAST_CHECKED = 'gtfs.lastChecked.v1';

/** The name of the bundled asset, and the `databaseName` behind a null pointer. */
export const BUNDLED_DATABASE = 'gtfs.db';

export type CurrentDatabase = {
  /** A generation filename, e.g. `gtfs-v1-20260810T120000Z.db`. */
  file: string;
  /** The `builtAt` of the manifest it came from — what the next check compares against. */
  builtAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCurrentDatabase(value: unknown): value is CurrentDatabase {
  return isRecord(value) && typeof value.file === 'string' && typeof value.builtAt === 'string';
}

/**
 * The generation in use, or null for the bundled floor.
 *
 * Never throws. Unreadable or unrecognised storage reads as null — the same
 * forgiving shape as `loadFavorites`, and for a stronger reason here: the
 * fallback is a database that definitely exists, so the cost of a corrupt
 * pointer is one stale launch rather than an app that will not open.
 */
export async function loadCurrentDatabase(): Promise<CurrentDatabase | null> {
  try {
    const raw = await AsyncStorage.getItem(CURRENT);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCurrentDatabase(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Moves the pointer. The caller must already have verified the file: hashed it,
 * opened it, and checked it clears the floor. Nothing downstream re-checks.
 */
export async function saveCurrentDatabase(current: CurrentDatabase): Promise<void> {
  await AsyncStorage.setItem(CURRENT, JSON.stringify(current));
}

/** When the app last completed a check, successful or not. Null if it never has. */
export async function loadLastChecked(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_CHECKED);
  } catch {
    return null;
  }
}

export async function saveLastChecked(at: Date): Promise<void> {
  await AsyncStorage.setItem(LAST_CHECKED, at.toISOString());
}
