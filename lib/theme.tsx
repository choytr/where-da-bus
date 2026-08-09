import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/**
 * `automatic` follows the OS appearance. The two explicit values override it,
 * because a transit app gets used at a stop at night and "the OS says light" is
 * not always the answer the user wants.
 *
 * The type lives here rather than next to the code that persists it, because
 * *what a theme preference is* is a property of the theme and *where it is
 * written down* is a detail. Keeping it this way round is what lets this file
 * import nothing: a screen that reads a colour must not thereby depend on
 * AsyncStorage, which is the same coupling lib/legal.ts was extracted to break.
 */
export const THEME_PREFERENCES = ['light', 'dark', 'automatic'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * How the preference outlives the process. Passed in rather than imported so
 * this file stays free of storage, and so a test can drive the provider with a
 * plain object instead of mocking a native module.
 */
export type ThemeStorage = {
  load: () => Promise<ThemePreference>;
  save: (preference: ThemePreference) => Promise<void>;
};

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
  /**
   * A stop's marker on the map, and the glyph inside it. Its own hue rather
   * than `live`, which means "this arrival has GPS behind it" — a pin is not
   * making that claim about anything.
   */
  pin: string;
  pinGlyph: string;
  /**
   * The route line on the map.
   *
   * **Its own colour rather than `pin`, on Truman's call after device round 1.**
   * It was `pin`, on the reasoning that a line and the stops on it should read
   * as one thing; on a device that put a blue line under blue pins on Apple's
   * blue roads, and the line stopped being findable. Red separates it from the
   * pins, from the map's own furniture, and from the rider's own location dot.
   *
   * Not `canceled` or `warning`, which are also red: a route line is not a
   * warning about anything, and sharing a token would mean tuning one of them
   * changes the other.
   */
  route: string;
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
  pin: '#0b6bcb',
  pinGlyph: '#ffffff',
  route: '#d92b2b',
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
  pin: '#3b9dff',
  pinGlyph: '#0b1f33',
  // Lifted for a dark map: the light theme's red reads as brown over Apple's
  // dark tiles, which is the surface this line is actually drawn on.
  route: '#ff5a52',
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

export function ThemeProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage: ThemeStorage;
}): React.JSX.Element {
  const osScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('automatic');

  // Storage is async, so the first paint is always 'automatic'. That is the
  // right default to be wrong with: it matches the OS, so an automatic user —
  // the majority — sees nothing, and the two pre-database screens are brief.
  useEffect(() => {
    let cancelled = false;
    void storage.load().then((stored) => {
      if (!cancelled) setPreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

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
        void storage.save(next);
      },
    };
  }, [preference, osScheme, storage]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return theme;
}
