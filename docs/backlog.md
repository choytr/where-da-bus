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

- **The debounce test is real-timer dependent** with roughly 50 ms of headroom,
  two-sidedly: too slow and it sees 2+ calls, too fast and a sibling test
  fails. Now that CI runs the suite on a shared runner, this is the likely
  first flake. RNTL 14's `waitFor` does detect fake timers and advance them, so
  the original "fake timers would hang RNTL" justification was overstated.
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
