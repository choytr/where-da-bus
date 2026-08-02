import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../data/storage/preferences';

/**
 * Every colour the app draws with. The keys are the union of what the seven
 * screens already used before this file existed — nothing here is invented for
 * a future screen, and nothing that was in use was dropped. A screen needing a
 * colour that is not here adds it to *both* palettes, which is the point: the
 * old arrangement let a screen ship a dark value it had never checked.
 */
export type Palette = {
  /** Screen background. */
  background: string;
  /** Primary text. */
  text: string;
  /** Secondary text — distances, stop codes, timestamps. */
  muted: string;
  /** Hairlines between rows. */
  border: string;
  /** Grouped-list section headers, a step off the background. */
  section: string;
  /** Route-badge background. */
  chip: string;
  /** A favorited stop's star. */
  star: string;
  /** A real-time arrival. Green, and never the only signal — see ArrivalRow. */
  live: string;
  /** A cancelled trip. */
  canceled: string;
  /** An expired feed, and other things the user should notice but need not act on. */
  warning: string;
  /** The stale-data banner on the arrival board. */
  bannerBg: string;
  bannerText: string;
};

const LIGHT: Palette = {
  background: '#ffffff',
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
  section: '#f5f6f7',
  chip: '#eceef0',
  star: '#e5a50a',
  live: '#0a7d33',
  canceled: '#b3261e',
  warning: '#b3261e',
  bannerBg: '#fdf0e3',
  bannerText: '#8a4b08',
};

const DARK: Palette = {
  background: '#101314',
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
  section: '#171c1e',
  chip: '#22282a',
  star: '#f5c518',
  live: '#4ac26b',
  canceled: '#f2836b',
  warning: '#f2b8b5',
  bannerBg: '#3a2a14',
  bannerText: '#f0c48a',
};

export type Theme = {
  palette: Palette;
  /** What is actually being drawn, after the preference has been applied. */
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

/**
 * No default value, so useTheme can tell "outside a provider" from "inside one
 * that happens to be light". A default palette here would make a missing
 * provider invisible in Jest and wrong on the device — the exact failure mode
 * SafeAreaProvider already cost this project once.
 */
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const osScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('automatic');

  // Storage is async, so the first paint is always 'automatic'. That is the
  // right default to be wrong with: it matches the OS, so an automatic user —
  // the majority — sees nothing, and the two pre-database screens are brief.
  useEffect(() => {
    let cancelled = false;
    void loadThemePreference().then((stored) => {
      if (!cancelled) setPreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<Theme>(() => {
    const scheme =
      preference === 'automatic' ? (osScheme === 'dark' ? 'dark' : 'light') : preference;

    return {
      scheme,
      palette: scheme === 'dark' ? DARK : LIGHT,
      preference,
      setPreference: (next: ThemePreference) => {
        // Applied immediately and persisted in the background: the toggle must
        // not wait on AsyncStorage to show the user it worked.
        setPreferenceState(next);
        void saveThemePreference(next);
      },
    };
  }, [preference, osScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return theme;
}
