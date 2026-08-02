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

**`location.status === 'error'` is terminal.** The "Show stops near you" button
renders only for `'idle'`, so a transient GPS failure can only be cleared by
restarting the app.

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
- **The scroll indicator's top is inset by roughly half the legal block**, so it
  starts below the top of the list rather than level with it. Observed on
  device, 2026-08-02. **Still unexplained after a full pass through React
  Native's native scroll code.** Ruled out, with sources:

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

  So nothing in this codebase or in RN applies a top inset, and the list's frame
  should begin level with the legal header. Next step is measurement rather than
  more reading: log `contentInset` from the `onScroll` event (it is in the
  native payload, `CoreEventTypes.js:291`) and compare against the list's
  `onLayout` frame. A negative `scrollIndicatorInsets.top` is the one-prop probe
  for whether the gap is inset-driven at all. Untested hypothesis worth ruling
  out early: Expo Go hosts the app inside its own view hierarchy, so this may
  not reproduce in the standalone `.ipa`.
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

- **Legal constants are exported from a screen module.** `App.tsx` imports
  `DISCLAIMER` from `features/stops/HomeScreen`, so the app root depends on a
  feature screen for legally required text. A `lib/legal.ts` fixes the
  inverted dependency — worth doing before a second screen needs the same
  strings.
- The palette is duplicated across `App.tsx`, `HomeScreen.tsx` and
  `StopRow.tsx`: three `useColorScheme` calls and three copies of the same hex.
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
