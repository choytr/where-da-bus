# Plan — Increment 3: the map, tabs, and theme

Contracts, not code. Spec: `../specs/2026-08-02-increment-3-map.md`.

Executed **inline**, in order. Tasks 1–6 have no map in them and land the
restructure; 7 is the first that can fail on a device. Review once at the end,
on the whole diff. Device-verify before merging to `main`.

Every `render`/`renderHook`/`rerender`/`unmount` is awaited — see `CLAUDE.md`.

---

## 1. Theme preference storage — **done**

- `data/storage/preferences.ts`, `data/storage/__tests__/preferences.test.ts`
- `export type ThemePreference = 'light' | 'dark' | 'automatic'`
- `loadThemePreference(): Promise<ThemePreference>` — `'automatic'` on absent or
  unrecognised stored value, never throws
- `saveThemePreference(p: ThemePreference): Promise<void>`
- Tests: defaults to automatic when unset; round-trips each value; unrecognised
  stored string falls back rather than propagating
- Mirrors `favorites.ts`'s shape; same AsyncStorage, distinct key

## 2. Theme provider — **done**

- `lib/theme.tsx`, `lib/__tests__/theme.test.tsx`
- `export type Palette` — the keys above were a guess and were wrong. The real
  union of the seven call sites is `background, text, muted, border, section,
  chip, star, live, canceled, warning, bannerBg, bannerText`; `surface`,
  `accent` and `separator` are used by nothing.
- **`ThemeProvider` takes its storage as a prop.** Importing task 1 from here
  put AsyncStorage in the module graph of every screen that reads a colour and
  broke four suites at import. The edge runs storage -> theme, never back.
- `<ThemeProvider>` (children) and `useTheme(): { palette: Palette; scheme:
  'light' | 'dark'; preference: ThemePreference; setPreference: (p) => void }`
- `'automatic'` resolves through `useColorScheme()`; `'light'`/`'dark'` ignore it
- Tests: automatic follows the OS scheme both ways; explicit preference overrides
  it; setPreference persists via task 1
- Mounted inside `AppShell`, above `DatabaseGate`, so the two pre-database
  screens are themed too

## 3. Migrate the seven call sites — **done**

- `AppShell.tsx`, `app/_layout.tsx`, `features/stops/HomeScreen.tsx`,
  `features/stops/StopRow.tsx`, `features/arrivals/ArrivalsScreen.tsx`,
  `features/arrivals/ArrivalRow.tsx`, `features/routes/RouteScreen.tsx`
- Each drops its local `useColorScheme` and `light`/`dark` objects for
  `useTheme()`. No visual change intended.
- Existing suites could *not* stay unmodified: `useTheme` throws without a
  provider by design, so the four screen suites gained a `TestTheme` wrapper
  from `lib/testing/theme.tsx`. A stub palette was rejected — it would let a
  screen read a colour the real palette does not define and still pass.
- Also fixed here: `StatusBar style="auto"` asks the OS, which is the wrong
  question once the app has its own preference.
- Verification: `grep -rn useColorScheme --include=*.tsx .` returns only
  `lib/theme.tsx`

## 4. Tabs skeleton — **done**

- `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` (Map),
  `app/(tabs)/stops.tsx`, `app/(tabs)/settings.tsx`; `app/index.tsx` removed
- `app/stop/[code].tsx` and `app/route/[id].tsx` stay at root — pushed over the
  tab bar, defined once
- `expo-router`'s `Tabs`; `@react-navigation/bottom-tabs` is already installed
  transitively, no new dependency
- Tab titles are copy, not filenames — the "Index" back-button bug came from
  exactly this
- Tests: `__tests__/App.test.tsx` still drives the three database outcomes;
  the tab-bar test is `__tests__/TabsLayout.test.tsx`, **not** `app/__tests__/`
  — every file under `app/` is a URL and "it has no default export" is not a
  guarantee worth relying on
- Map and Settings landed as placeholders here; task 6 filled Settings in

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

## 6. Settings tab — **done**, taken before task 5

- `features/settings/SettingsScreen.tsx` + `__tests__`
- Three-way theme control via `useTheme()`; feed status via
  `feedValidity.ts` + `useStopQueries().feedEndDate`; `ATTRIBUTION` and
  `DISCLAIMER` from `lib/legal.ts`
- Attribution stays at the **top** wherever data appears — this screen shows
  feed status, so it counts
- Tests: selecting each preference persists it; expired feed renders the
  expired wording; `unknown` validity is not rendered as current
- The selected row is marked with a checkmark and `accessibilityState`, not by
  colour — this is the screen where someone checks that Dark took
- Its suite drives the real `ThemeProvider`, not `TestTheme`: persistence is
  half of what the screen is for

## 7. Map dependencies and a bare map

- `npx expo install react-native-maps react-native-reanimated
  react-native-gesture-handler` — all three bundled in Expo Go SDK 54
- `app/(tabs)/index.tsx` renders a full-screen `MapView` centered on Honolulu,
  nothing else
- **Run `npm ci` after this task**, not just `npm test` — the `react-dom` peer
  break is exactly this shape
- **Stop and device-verify here** (`gh workflow run ios-ipa.yml --ref <branch>`).
  This is the first thing in the increment that can fail natively, and nothing
  after it is worth building if the map does not render.

## 8. Anchored stop set

- `features/map/useAnchoredStops.ts` + `__tests__`
- `useAnchoredStops(): { anchor: Coords; stops: StopWithDistance[]; setAnchor:
  (c: Coords) => void; recenter: () => void; status }`
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
- Recenter button; empty state when the anchor has no stops
- Tests: pins and rows render the same set; map press moves the anchor; recenter
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

## 6a. Arrivals request cache — added after the plan was written

Not in the original plan. It comes from
`../specs/2026-08-02-thebuslive-comparison.md`, which found that TheBusLive
coalesces in-flight requests and caches responses for 30 s, and that they solve
the shared-quota problem by making each user register their own AppID. We ship
one AppID for every install, so the caching half of that answer is worth taking
and the onboarding half is not.

- `data/thebus/cache.ts` + `__tests__` — `withCache(client, { ttlMs, now })`
- Coalesces by stop code; caches successes for 30 s; **never caches failures**
- Callers are reference-counted, so one caller's abort cannot cancel a request
  another is still waiting on
- `TheBusClient.arrivals` gains `fresh?: boolean`; `useArrivals`'s pull-to-
  refresh sets it
- The shared `theBus` instance in `data/thebus/index.ts` is now wrapped

The comparison's second item — don't recenter the camera on a refresh the user
did not ask for — belongs to task 9 and is noted there.

## 9. Map, pins, sheet — note added

- **Do not recenter on every poll.** Keep a "have we centered yet" flag, as
  TheBusLive's `VehicleMapViewModel` does, or a refresh yanks the view back
  while the user is panning.

---

## Done means

`npm test`, `npm run test:scripts`, `npm run typecheck`, and `npm ci` all clean,
plus the app installed on the phone and the map driven by hand. The AppID bug
proves CI green does not mean the artifact works.
