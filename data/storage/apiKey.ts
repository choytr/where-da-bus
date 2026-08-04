import * as SecureStore from 'expo-secure-store';
import type { ApiKeyStorage } from '../thebus/provider';

/**
 * The user's own TheBus AppID.
 *
 * In the keychain rather than in AsyncStorage alongside the other preferences,
 * because this is a credential and the other two are not. The argument for not
 * caring — "it currently ships inside a bundle anyone can read" — was an
 * argument about the world before Increment 4; writing it to plaintext
 * immediately after taking it out of the binary would undo part of what that
 * increment buys.
 *
 * The dependency runs storage -> thebus and never back, the same way
 * preferences.ts runs storage -> theme. A screen asking for arrivals must not
 * thereby pull a native keychain module into its graph.
 */
const KEY = 'thebus.appId.v1';

/**
 * A key is either a non-empty trimmed string or absent. There is deliberately
 * no third state: "stored, but blank" and "never stored" would render as two
 * different things while meaning the same one.
 */
function normalize(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * Never throws. A locked device, a missing entitlement or a keychain the OS
 * declines to open all read as "no key", which sends the user to onboarding
 * instead of crashing the launch — the same forgiving shape as
 * loadThemePreference() and loadFavorites().
 *
 * The cost is real and accepted: a transient keychain failure looks exactly
 * like a first run. It costs a re-paste, where the alternative costs a launch.
 */
export async function loadApiKey(): Promise<string | null> {
  try {
    return normalize(await SecureStore.getItemAsync(KEY));
  } catch {
    return null;
  }
}

/**
 * Saving a blank key clears it rather than storing whitespace.
 *
 * The trim is not cosmetic. Pasting on iOS routinely carries a trailing
 * newline, the AppID goes straight into a query string, and the API answers an
 * untrimmed key with the identical body it uses for a wrong one — see
 * docs/api/README.md. An invisible character would be indistinguishable from a
 * mistyped key, in the one place the user cannot debug.
 *
 * Unlike loading, this does *not* swallow failures: a save that silently did
 * nothing would send the user back to onboarding on the next launch with no
 * explanation.
 */
export async function saveApiKey(key: string): Promise<void> {
  const normalized = normalize(key);
  if (normalized === null) {
    await clearApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEY, normalized);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/**
 * What AppShell hands TheBusProvider.
 *
 * The type comes from the provider, not from here — `import type` erases, so
 * this costs no runtime edge, and it keeps the one that matters pointing the
 * right way. Exactly how preferences.ts takes ThemeStorage from lib/theme.tsx.
 */
export const apiKeyStorage: ApiKeyStorage = {
  load: loadApiKey,
  save: saveApiKey,
  clear: clearApiKey,
};
