import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_PREFERENCES, type ThemePreference, type ThemeStorage } from '../../lib/theme';

/**
 * App preferences that are not user data. Kept apart from favorites.ts on
 * purpose: favorites are the one piece of state a user would be upset to lose,
 * and a preference is not. Separate keys mean a corrupt value in one cannot
 * take the other with it.
 *
 * The dependency runs storage -> theme and never back, so importing a colour
 * does not pull a native module into a screen. See lib/theme.tsx.
 */
const KEY = 'theme.v1';

/** Derived from the exported list rather than declared beside it, so the two cannot drift. */
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

/** What AppShell hands ThemeProvider. */
export const themeStorage: ThemeStorage = {
  load: loadThemePreference,
  save: saveThemePreference,
};
