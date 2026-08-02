import type { ReactNode } from 'react';
import { ThemeProvider, type ThemePreference, type ThemeStorage } from '../theme';

/**
 * Test-only helpers for mounting a themed tree. Deliberately *not* under a
 * `__tests__` directory — jest-expo's testMatch treats everything in one as a
 * suite, and this file has no tests in it.
 *
 * `useTheme` throws without a provider on purpose (see lib/theme.tsx), so every
 * suite that renders a screen has to supply one. This is that, in one line,
 * rather than a stub palette per file — a stub would let a screen read a colour
 * the real palette does not define and still pass.
 */

/** A ThemeStorage backed by a variable. No AsyncStorage, nothing to reset. */
export function memoryThemeStorage(initial: ThemePreference = 'automatic'): ThemeStorage {
  let value = initial;
  return {
    load: async () => value,
    save: async (next) => {
      value = next;
    },
  };
}

export function TestTheme({
  children,
  preference = 'automatic',
}: {
  children: ReactNode;
  preference?: ThemePreference;
}) {
  return <ThemeProvider storage={memoryThemeStorage(preference)}>{children}</ThemeProvider>;
}
