# Plan — Increment 3: the map, tabs, and theme

Contracts, not code. Spec: `../specs/2026-08-02-increment-3-map.md`.

Executed **inline**, in order. Tasks 1–6 have no map in them and land the
restructure; 7 is the first that can fail on a device. Review once at the end,
on the whole diff. Device-verify before merging to `main`.

Every `render`/`renderHook`/`rerender`/`unmount` is awaited — see `CLAUDE.md`.

---

## 1. Theme preference storage

- `data/storage/preferences.ts`, `data/storage/__tests__/preferences.test.ts`
- `export type ThemePreference = 'light' | 'dark' | 'automatic'`
- `loadThemePreference(): Promise<ThemePreference>` — `'automatic'` on absent or
  unrecognised stored value, never throws
- `saveThemePreference(p: ThemePreference): Promise<void>`
- Tests: defaults to automatic when unset; round-trips each value; unrecognised
  stored string falls back rather than propagating
- Mirrors `favorites.ts`'s shape; same AsyncStorage, distinct key

## 2. Theme provider

- `lib/theme.tsx`, `lib/__tests__/theme.test.tsx`
- `export type Palette = { background, surface, text, muted, accent, border,
  separator }` — exact keys derived from the seven current call sites, not
  invented
- `<ThemeProvider>` (children) and `useTheme(): { palette: Palette; scheme:
  'light' | 'dark'; preference: ThemePreference; setPreference: (p) => void }`
- `'automatic'` resolves through `useColorScheme()`; `'light'`/`'dark'` ignore it
- Tests: automatic follows the OS scheme both ways; explicit preference overrides
  it; setPreference persists via task 1
- Mounted inside `AppShell`, above `DatabaseGate`, so the two pre-database
  screens are themed too

## 3. Migrate the seven call sites

- `AppShell.tsx`, `app/_layout.tsx`, `features/stops/HomeScreen.tsx`,
  `features/stops/StopRow.tsx`, `features/arrivals/ArrivalsScreen.tsx`,
  `features/arrivals/ArrivalRow.tsx`, `features/routes/RouteScreen.tsx`
- Each drops its local `useColorScheme` and `light`/`dark` objects for
  `useTheme()`. No visual change intended.
- Existing suites must stay green unmodified except where they stub a palette
- Verification: `grep -rn useColorScheme --include=*.tsx .` returns only
  `lib/theme.tsx`

## 4. Tabs skeleton

- `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` (Map),
  `app/(tabs)/stops.tsx`, `app/(tabs)/settings.tsx`; `app/index.tsx` removed
- `app/stop/[code].tsx` and `app/route/[id].tsx` stay at root — pushed over the
  tab bar, defined once
- `expo-router`'s `Tabs`; `@react-navigation/bottom-tabs` is already installed
  transitively, no new dependency
- Tab titles are copy, not filenames — the "Index" back-button bug came from
  exactly this
- Tests: `__tests__/App.test.tsx` still drives the three database outcomes;
  tab bar renders three labels

## 5. Stops tab

- `features/stops/StopsScreen.tsx` + `__tests__`; `HomeScreen.tsx` is retired
  once tasks 5 and 9 have taken its two halves
- Search field; empty query renders favorites; non-empty renders results
- Reuses `useStopQueries().searchByName`/`searchByCode`, `favorites.ts`,
  `StopRow`, and the keyboard handling from `ffc7190`/`037c7c0` — do not rewrite
  that, it is Truman's
- Row tap → `/stop/[code]`
- Tests: empty query shows favorites; typing replaces them with results; no
  favorites and no query shows an empty state, not a blank screen

## 6. Settings tab

- `features/settings/SettingsScreen.tsx` + `__tests__`
- Three-way theme control via `useTheme()`; feed status via
  `feedValidity.ts` + `useStopQueries().feedEndDate`; `ATTRIBUTION` and
  `DISCLAIMER` from `lib/legal.ts`
- Attribution stays at the **top** wherever data appears — this screen shows
  feed status, so it counts
- Tests: selecting each preference persists it; expired feed renders the
  expired wording; `unknown` validity is not rendered as current

## 7. Map dependencies and a bare map

- `npx expo install react-native-maps react-native-reanimated
  react-native-gesture-handler` — all three bundled in Expo Go SDK 54
- `app/(tabs)/index.tsx` renders a full-screen `MapView` centred on Honolulu,
  nothing else
- **Run `npm ci` after this task**, not just `npm test` — the `react-dom` peer
  break is exactly this shape
- **Stop and device-verify here** (`gh workflow run ios-ipa.yml --ref <branch>`).
  This is the first thing in the increment that can fail natively, and nothing
  after it is worth building if the map does not render.

## 8. Anchored stop set

- `features/map/useAnchoredStops.ts` + `__tests__`
- `useAnchoredStops(): { anchor: Coords; stops: StopWithDistance[]; setAnchor:
  (c: Coords) => void; recentre: () => void; status }`
- Wraps `useStopQueries().nearby` — the existing 1.5 km / 25 query, unchanged.
  Anchor defaults to `useLocation()`'s coords, Honolulu when denied.
- Queries **only** on anchor change. No pan or zoom handler exists.
- Tests: anchor change refetches once; pan does not (no such input); denied
  location still yields an anchor; empty result is a distinct state from an error

## 9. Map, pins, sheet

- `features/map/MapScreen.tsx`, `features/map/StopSheet.tsx` + `__tests__`
- Pins from task 8's `stops`; `onPress` on the map sets the anchor, `onPress` on
  a marker selects — `react-native-maps` fires these separately
- Sheet holds one list of the same `stops`; detents peek / medium / full
- Recentre button; empty state when the anchor has no stops
- Tests: pins and rows render the same set; map press moves the anchor; recentre
  restores the user's location; denied location renders the Honolulu default
  with a prompt

## 10. Selection and inline arrivals

- `features/map/StopSheet.tsx`, `features/map/ExpandedStopRow.tsx` + `__tests__`
- Selecting scrolls the list to that row, expands it in place, raises the sheet
  to medium. Pin tap and row tap take the same path.
- Expanded row = `StopRow` + next 2–3 arrivals via `useArrivals`; whole row is
  one tap target → `/stop/[code]`
- Changing selection must cancel the previous stop's fetch and its 60 s poll
- The §4 states must stay distinguishable at this size: "no buses coming" and
  "couldn't reach TheBus" must not render alike
- Tests: pin tap and row tap produce identical state; changing selection aborts
  the prior fetch; error state renders last-known values with an age, not a
  spinner; deselecting stops the poll

---

## Done means

`npm test`, `npm run test:scripts`, `npm run typecheck`, and `npm ci` all clean,
plus the app installed on the phone and the map driven by hand. The AppID bug
proves CI green does not mean the artifact works.
