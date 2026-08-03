# Backlog

Known defects and deferred work, carried out of Increment 1's review process.
Everything here was found by review, triaged, and consciously deferred — none
of it is speculative. Ordered by what would hurt a user most.

Increment 1 shipped with all nine tasks reviewed, a whole-branch review, and
six checks verified on a physical iPhone (launch, relaunch, search, location
denial, favorites across restart, duplicate stops).

## Correctness — fix before Increment 2 ships

**`DatabaseGate` misdiagnoses every render error.** `App.tsx`'s error boundary
sits above everything and reports any failure below it as "Stop data
unavailable… Reinstalling the app is the usual fix." A crash in `HomeScreen` or
`StopRow` therefore gives the user confidently wrong instructions. Needs a
second, narrower boundary inside the provider. The arrival board will add a
lot of new code under that boundary, which is what makes this urgent now.

**Favorites have a read-modify-write race.** `toggleFavorite` does
load → mutate → save, so two stars tapped inside one AsyncStorage round-trip
silently lose one. No test covers interleaved `addFavorite`/`removeFavorite`.

~~**`location.status === 'error'` is terminal.**~~ **Fixed in the map sheet's UX
pass, 2026-08-02.** ⌖ now retries from `'error'` and opens Settings from
`'denied'` — iOS shows its permission dialog once per install, so a refusal was
the other half of the same dead end and is closed with it.

**The error notice never clears.** `problem` is a single sticky slot that is
never reset. `FAVORITES_PROBLEM` comes from AsyncStorage and can fail
transiently, pinning a red notice for the whole session; a later
`DATABASE_PROBLEM` silently overwrites it rather than queueing.

**`route_stops` has holes — do not let route browsing inherit this.** Dropping
the 17 `<n>_merge` duplicate stops removed 26 `route_stops` rows, and each was
the only entry for its `stop_code` in its `(route_id, direction_id)` pattern.
So **18 of 236 directional patterns skip a stop the route genuinely serves**
(route 131 direction 1, for example, had `699_merge` at seq 69 and no plain
`699`). Cause: `deriveRouteStops` picks one representative trip per direction
and that trip visited the `_merge` id, while `stop_routes` — a union over all
trips — also saw the plain id. **Zero Increment 1 impact**, because
`route_stops` is written by the build and queried by nothing. The fix is to
remap a dropped id onto its surviving twin rather than deleting the row.

## Data quality

**Five alternate stop names left the FTS index**: `KAMEHAMEHA HWY + OPP RADFORD
DR`, `NORTH RD + RADFORD DR`, `MAUNAKEA ST + N. HOTEL ST`, `PALI HWY + 2627`,
`PALI HWY + 2702`. Searching "radford" returns 6 stops instead of 8. This is
unavoidable under the ruling that one row carries one name, and three of the
five lost names are the lower-quality half of their pair.

**The bundled feed expires 2026-08-22.** The app surfaces this once the date
passes; refreshing is `npm run build:gtfs` plus a commit of the regenerated
asset. On-device refresh is Increment 3 work.

**Orphaned rows are dropped silently** during the build with no count logged. A
future feed with an id-format change would lose rows invisibly.

## Robustness

- AsyncStorage `getItem`/`setItem` calls are unwrapped, so a native-module I/O
  rejection propagates uncaught out of `loadFavorites`/`addFavorite`/
  `removeFavorite`. Corrupt content is handled; hard I/O failure is not
  distinguished from it.
- `useLocation`'s bare `catch {}` leaves `'error'` undiagnosable — a permission
  race, a GPS timeout and services-off are indistinguishable. Logging was
  proposed during Task 6 and **explicitly declined**; recorded here rather than
  re-litigated.
- `emit.mjs` requires `stop_name`/`stop_lat`/`stop_lon` unconditionally, but
  GTFS exempts these for `location_type` 3/4. Harmless on this feed; would
  hard-fail on a future one.
- `build.mjs` skips `db.close()` if `emitDatabase` throws.
- `meta` inserts use `?? null`, so a present-but-blank `feed_start_date` stores
  `''` rather than null.
- `routesForStopsSql(0)` would emit `IN ()`, which SQLite rejects. Unreachable
  today (guarded in `db.ts`); `stopsByIdsSql` shares the shape.

## Tests

- **The suite flakes on a cold Jest cache — observed, not predicted.** On
  2026-07-31, immediately after `npm ci`, `App › shows the stop list once the
  database is open` and `HomeScreen › prompts for location before any is
  granted` both failed; the same suite passed on every warm-cache run
  (~4 s versus ~20 s cold). Both failures are `waitFor` calls timing out at the
  1 s default while the transform cache is still being built.

  **This is a CI problem specifically**, because `.github/workflows/tests.yml`
  runs `npm ci` followed by `npm test` — a cold cache every time, on a shared
  runner. Expect intermittent red. The cheap mitigations are raising the
  `waitFor` timeout for these tests or warming the cache in CI; the honest one
  is that these assertions should not be racing a timer at all.
- **The debounce test is real-timer dependent** with roughly 50 ms of headroom,
  two-sidedly: too slow and it sees 2+ calls, too fast and a sibling test
  fails. RNTL 14's `waitFor` does detect fake timers and advance them, so the
  original "fake timers would hang RNTL" justification was overstated.
- `HomeScreen.test.tsx` asserts `/search for a stop/i` in a place where that
  matches **both** the denied and error copy — the two states could collapse
  into one and the suite would still pass. This is precisely the defect class
  the screen is most exposed to. Assert `/location is off/i` and that
  `/could not read your location/i` is absent.
- `App.test.tsx` reads mocked props through `jest.requireMock` with `any` all
  the way down, so renaming `onInit` or reshaping `assetSource` would not fail
  compilation.
- Zero-route rendering is asserted only by absence of a crash; assert that no
  route chip is present.
- `build.mjs` (download, unzip, wiring) has no tests at all — only `derive.mjs`
  and `emit.mjs` are covered.
- Distance-formatting boundaries are untested: 0 m, sub-metre, exactly 1000 m
  (renders "1.0 km"), and very large values (no thousands separator). None are
  bugs; all are unasserted.
- No test for the transient `'loading'` location state, nor for CSV headers in
  a different order or with columns missing.

## Deferred from the post-Increment-1 review (2026-07-31)

The four commits that landed after the branch review were reviewed separately.
What was fixed there: the `streamOf` stream-attribution bug and silent-failure
exit in `scripts/pdf-text.mjs`, the undocumented `adherence` unit, the
`.claude/` exclusions for git and tsc, and the safe-area guard assertion. What
was consciously left:

- ~~**The keyboard covers the search results.**~~ Fixed by hand in `ffc7190` and
  `037c7c0`: `automaticallyAdjustKeyboardInsets`, plus `keyboardDismissMode` as
  `interactive` on iOS rather than `on-drag`, so the keyboard tracks the finger
  the way Messages and Mail do.
- ~~`contentContainerStyle` allocates a new object per render~~ — memoised on
  `insets.bottom` in `037c7c0`.
- ~~`scrollIndicatorInsets` is unset, so the scroll indicator runs under the
  home indicator.~~ **This was never true.** It was reasoned from the code and
  never observed; on device the indicator clears the home indicator fine.
  `automaticallyAdjustsScrollIndicatorInsets` defaults to `true`
  (`ScrollView.js:191`), and iOS syncs the indicator insets to the adjusted
  content inset by itself. Needing the companion prop is pre-iOS-13 folklore.
  A second claim made alongside it — that `scrollIndicatorInsets` is silently
  overwritten while `automaticallyAdjustsScrollIndicatorInsets` is `true` — was
  also wrong, and was also reasoned rather than tested. Setting it alone does
  take effect; verified on device 2026-08-02. Two wrong claims in one entry,
  from the same habit of reading Apple's semantics off the docs and reporting
  the reading as behaviour.
- ~~**The scroll indicator's top is inset by roughly half the legal block**~~ —
  **resolved, observed on device 2026-08-02 (Truman)**, after the Increment 3
  tab restructure. His words: "the top of the scrollbar matches the top of the
  text at the top, and the bottom sits right at the top of the bottom bar."

  **The cause was never established, and nobody should pretend otherwise.** The
  list moved from `HomeScreen` under a root `Stack` to `StopsScreen` under a
  `Tabs` scene, and lost its `contentContainerStyle={{ paddingBottom }}` memo,
  in the same change. Any of those could have done it, and the investigation
  below had already ruled out every mechanism inside this codebase and inside
  React Native's scroll code — so the remaining candidate was always the host,
  which is exactly what changed.

  It is recorded as closed rather than explained. If it ever comes back, the
  next step is still measurement and not more reading: log `contentInset` from
  the `onScroll` payload (`CoreEventTypes.js:291`) against the list's `onLayout`
  frame. **This entry has now misled four investigations. Do not reopen it on
  reasoning alone.**

  The full ruled-out list is kept below because it is a real map of where the
  inset does *not* come from:

  - safe-area folding into the content inset — `contentInsetAdjustmentBehavior`
    is hard-set to `Never` in both architectures
    (`RCTEnhancedScrollView.mm:37`, `RCTScrollView.m:377`)
  - keyboard inset residue — the only assignment to
    `verticalScrollIndicatorInsets` sits inside the keyboard handler
    (`RCTScrollViewComponentView.mm:248`), and the offset is present at
    `911c39e`, before `automaticallyAdjustKeyboardInsets` existed here
  - legacy `autoAdjustInsetsForView` (`RCTView.m:495`) — needs an
    `RCTAutoInsetsProtocol` parent, which a `FlatList` in a plain `View` has not
  - the list not filling its space — `ScrollView.js:1861` applies
    `flexGrow: 1, flexShrink: 1`

  **Correction, 2026-08-02 (Truman).** The legal block is **four** lines, not
  two: at `fontSize: 11` inside 361pt of usable width, the attribution (75
  chars) and the disclaimer (89) each wrap. So the block is ~78pt tall, not
  ~48pt, and any arithmetic above that leaned on "roughly half the legal block"
  was measured against the wrong number. It never changed the mechanism.
- Two leftovers from those two commits, neither caught by `tsc`
  (`noUnusedLocals` is off): `EdgeInsets` is imported into `HomeScreen.tsx` and
  never used, and the memo wraps its value in `Platform.select({ default: … })`,
  which returns that value on every platform — the `useMemo` is what does the
  work, the select is indirection.
- `App.tsx`'s `Waiting` and `Unavailable` consume no insets. Safe today only
  because their content is vertically centred, and `Unavailable` is the screen
  every render error currently lands on.
- The device-metrics literal is duplicated across `App.test.tsx` and
  `HomeScreen.test.tsx`, and only the latter is annotated `Metrics` — the
  former sits inside a `jest.mock` factory where a wrong shape would not be
  caught by `tsc`.
- `pdf-text.mjs` cannot see objects packed into a `/ObjStm`, which is why
  `fontByName` is empty for `Web_Services_API.pdf` (harmless: that file uses
  WinAnsi literals). It now says so on stderr instead of returning quietly.
  Also unhandled and unused by these inputs: the `beginbfrange` array form, and
  `/Font` dicts containing a nested `>>`.
- `docs/api/README.md` reads `stop_ID` as `stops.stop_code`. Not stated by the
  vendor, and moot — `stop_id === stop_code` for all 3,830 rows in this feed.
- **`pdf-text.mjs` breaks lines mid-word.** It emits a newline for every `Td`,
  but generators use `Td` for horizontal moves within a line too (`ty=0`), so
  `prominently` comes out as `pr` + `ominently` and no phrase greps. The
  attribution legend does round-trip exactly through `tr -d '\n'`. The real fix
  is to break only when `Td`/`TD`'s vertical operand is non-zero; deferred
  because it changes the output of all seven files, and the README's verified
  claims were checked against the current shape.

## Structure

- ~~**Legal constants are exported from a screen module.**~~ **Fixed in
  Increment 2** — they live in `lib/legal.ts`. The prediction that this would
  bite "before a second screen needs the same strings" was exact: the arrival
  board's import of `HomeScreen` dragged in AsyncStorage and broke the suite.
- **The palette is now duplicated across six files** — `AppShell`,
  `HomeScreen`, `StopRow`, `ArrivalRow`, `ArrivalsScreen`, `RouteScreen` —
  each with its own `useColorScheme` call and its own copy of the same hex.
  Increment 2 doubled this rather than fixing it. It is the single largest
  piece of duplication in the codebase and the obvious next cleanup; deferred
  because a theme module is a change to every screen at once, and Increment 3
  adds a map that will want the same palette.
- Route chips flicker for one frame when search clears, and stale entries
  persist when the id list is empty.
- The favorite `Pressable` lacks `accessibilityState={{ selected: isFavorite }}`.
  The label already communicates state, so VoiceOver is correct — cosmetic.
- Validation errors report 0-indexed parsed-row numbers rather than 1-based
  file line numbers.
- `@types/jest` is pinned exactly while other devDependencies use ranges.

## Web target

The safe-area import regressed the (unsupported) web target: the web entry
point calls `useSafeAreaInsets()`, which throws without a provider.
**Increment 1 added `SafeAreaProvider` at the app root, so this may now be
fixed** — unverified, since web is not a target. `package.json` still ships
`"web": "expo start --web"`.

## Increment 2 — deferred

Recorded at the increment boundary. None of these block Increment 3.

### The live API

- **What separates `estimated` `"0"` from `"2"` is unknown.** Both mean
  schedule-only as far as the payload shows; three samples of `"0"` against
  1,225 of `"2"`, with no other field differing. It changes nothing — the
  `=== "1"` whitelist is correct either way — so this is curiosity.
- **`adherence` may not fit ±60 minutes.** Thirty live values spanned −19…+4
  and nothing bounds it. Nothing renders it yet, so nothing is wrong today.
- **The `*.thebus.org` certificate expires 2026-10-25.** If it lapses
  un-renewed, HTTPS breaks on device with no change on our side and the
  `NSExceptionDomains` fallback comes back. Worth re-checking in October.
- **`vehicleJSON` 404s, so there is no vehicle detail screen.** The vehicle
  endpoint is XML-only, and `adherence` is the only field unique to it.
  Deferred until something needs it enough to justify an XML parser.
- **Arrivals are capped at 25 by the server, with no pagination.** A busy stop
  returns 25 covering ~2.5 hours. There is no way to ask for more.
- **An unknown stop and a quiet stop are indistinguishable** — both return an
  empty array. Harmless, because stop codes come from the bundled asset and so
  exist by construction.

### Screens

- **The stack header on the arrivals screen reads "Arrivals", not the stop
  name.** The stop name is the first thing in the list body, so nothing is
  hidden; a dynamic title would read better.
- **Route detail shows no arrival times.** It is the ordered stop list and
  nothing else. Times per stop would mean one API request per stop.
- **Deep links are unverified.** `scheme: wheredabus` is set and the routes are
  URL-shaped (`/stop/596`), but nothing has opened one from outside the app.
- **`useNow` re-renders the whole board every 10 seconds** to move the
  countdowns. Fine at 25 rows; worth memoising rows if it ever grows.

### Process

- **Nothing tests the router itself.** Screens are tested directly and the
  route files are three lines each, so the untested surface is which component
  a URL maps to. `expo-router/testing-library` exists if that ever earns a
  test.
- **`npm ci` is not run locally by default.** It is the only thing that catches
  a lockfile peer conflict; `npm install` and the whole test suite stay green
  through one. CI covers it now that `dev` runs tests, which is how the
  `react-dom` break was found — three pushes late.

## Increment 3 — deferred

Found on a physical iPhone in Expo Go on 2026-08-02 by Truman, after tasks 1–10
landed. His summary: "UX in general needs a lot of work, but it's fine for now."
None of these are blocking; all of them are real.

**The sheet fights the selection.** All three closed by the UX pass of
2026-08-02, which made the sheet two modes rather than one list in two states.
The middle level of detail is gone entirely, and with it the affordance
question: there is nothing left to invite a second tap towards.

- ~~**Expanding a row while the sheet is full-height drops it back to half.**~~
  **Fixed.** `select` raises only from *below* medium, and never lowers.
- ~~**Selecting a stop does not feel like selecting a stop.**~~ **Fixed** — a
  selection now replaces the list with the stop's own card, which is what both
  Apple Maps and Google Maps do. Neither of the two suggestions recorded here
  was taken; the mode split answers the complaint underneath them.
- ~~**The expanded row's tap target is not discoverable.**~~ **Fixed by
  deletion.** `ExpandedStopRow` is gone and the card *is* the full board, so
  there is no third level to reach.

**The camera.**

- ~~**Tapping a pin resets the zoom.**~~ **Fixed** — `6e27094` stopped the
  marker press propagating to `MapView`'s `onPress`, and the UX pass then
  removed camera movement on anchor change altogether. Selection cannot move
  the camera now; a test asserts it.
- **Centring ignores the sheet** — but `mapPadding` is **not** the mechanism,
  contrary to what this entry said. On Apple Maps `AIRMap.m:645` assigns that
  prop to the view's `layoutMargins`, which positions the compass and the legal
  label; MapKit's own inset path is `setVisibleMapRect:edgePadding:`, which the
  prop never reaches. The Google branch (`AIRGoogleMap.m:443`) sets `padding`,
  which *does* move the camera, and this entry looks written from that.
  **This is a reading of the native source, not an observation** — the same
  move that produced two wrong claims in the scroll-indicator entry. The UX
  pass centres by arithmetic in `region.ts` instead, which cannot be wrong
  about MapKit because it never asks, and sets `mapPadding` only to keep
  Apple's legal label out from under the sheet.
- ~~**The map does not open on the rider's location.**~~ **Fixed** — the map
  calls `request()` from `onMapReady`, so the prompt is tied to opening the map
  and fires over a drawn map rather than a grey rectangle. The answer to the
  open question was yes.

**Unexplained.**

- **Occasional crash after interacting with a lot of things.** No reproduction
  and no stack yet. **Still open, and untouched by the UX pass.** The `.ipa`
  test has since been run and did not reproduce it, so this is "seen once in
  Expo Go, not reproduced on device" rather than a known device bug — which is
  weaker evidence than it sounds, given there is no reproduction to run either
  way. Record what was being touched when it happens; the
  sheet, the map and three arrivals polls are all in play at once, so "a bunch
  of things" is genuinely the useful detail here.

**Still open from the review itself.**

- ~~**`ExpandedStopRow` takes no client argument.**~~ **Fixed in the UX pass**
  — the component is gone, and its replacement `StopCard` takes an optional
  `client` the way `ArrivalsScreen` does. Both now run over the same
  `useArrivalBoard(stopCode, client?)`, so the seam is one hook rather than two
  components that had to agree.

**Still open after the UX pass of 2026-08-02.** Three questions only a device
can answer, all recorded on the plan rather than here because they are
verification steps and not defects yet: whether the 45% detent shows five
arrival rows or two, whether a long-press callout appears where the finger was,
and whether 25% of the visible width is the right drift threshold for *Search
this area*. `DRIFT_FRACTION` in `MapScreen.tsx` is a named constant so the
third is a one-line change.

