import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * App preferences that are not user data. Kept apart from favorites.ts on
 * purpose: favorites are the one piece of state a user would be upset to lose,
 * and a preference is not. Separate keys mean a corrupt value in one cannot
 * take the other with it.
 */
const KEY = 'theme.v1';

/**
 * `automatic` follows the OS appearance. The two explicit values override it,
 * because a transit app gets used at a stop at night and "the OS says light"
 * is not always the answer the user wants.
 */
export const THEME_PREFERENCES = ['light', 'dark', 'automatic'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Derived from the value above rather than declared alongside it, so the two cannot drift. */
function isThemePreference(value: string | null): value is ThemePreference {
  return THEME_PREFERENCES.some((p) => p === value);
}

/**
 * Never throws and never returns anything but the three known values. An
 * unreadable or unrecognised preference reads as `automatic` — the same
 * forgiving shape as loadFavorites(), for the same reason: storage the app
 * cannot make sense of should cost the user a setting, not a launch.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return isThemePreference(raw) ? raw : 'automatic';
  } catch {
    return 'automatic';
  }
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(KEY, preference);
}
