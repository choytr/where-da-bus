# Backlog

**What is known-broken or consciously deferred, and still true.** Everything
here was found by review or on a device, triaged, and left on purpose — none of
it is speculative.

Resolved entries are deleted rather than struck through; commit messages hold
that history. If something here names a file that no longer exists, the entry is
stale and should be re-checked rather than trusted.

## Correctness

**`DatabaseGate` misdiagnoses every render error.** `AppShell.tsx`'s error
boundary sits above everything and reports any failure below it as "Stop data
unavailable… Reinstalling the app is the usual fix." A crash anywhere in a
screen therefore gives the user confidently wrong instructions. Needs a second,
narrower boundary inside the provider.

**Favorites have a read-modify-write race.** `toggleFavorite` does
load → mutate → save, so two stars tapped inside one AsyncStorage round-trip
silently lose one. No test covers interleaved `addFavorite`/`removeFavorite`.

**The error notice never clears.** `StopsScreen`'s `problem` is a single sticky
slot that is never reset. `FAVORITES_PROBLEM` comes from AsyncStorage and can
fail transiently, pinning a notice for the whole session; a later
`DATABASE_PROBLEM` silently overwrites it rather than queueing.

**`route_stops` has holes.** Dropping the 17 `<n>_merge` duplicate stops removed
26 `route_stops` rows, each the only entry for its `stop_code` in its
`(route_id, direction_id)` pattern — so **18 of 236 directional patterns skip a
stop the route genuinely serves**. `deriveRouteStops` picks one representative
trip per direction and that trip visited the `_merge` id, while `stop_routes` —
a union over all trips — also saw the plain id. The fix is to remap a dropped id
onto its surviving twin rather than deleting the row.

## The live API

- **The `*.thebus.org` certificate expires 2026-10-25.** If it lapses
  un-renewed, HTTPS breaks on device with no change on our side. **Worth
  re-checking in October.**
- **`vehicleJSON` 404s**, so there is no vehicle detail screen. The endpoint is
  XML-only and `adherence` is the only field unique to it. Deferred until
  something needs it enough to justify an XML parser.
- **Arrivals are capped at 25 by the server, with no pagination.** A busy stop
  returns 25 covering ~2.5 hours. There is no way to ask for more.
- **An unknown stop and a quiet stop are indistinguishable** — both return an
  empty array. Harmless: stop codes come from the bundled asset, so they exist
  by construction.
- **What separates `estimated` `"0"` from `"2"` is unknown.** Both read as
  schedule-only; three samples of `"0"` against 1,225 of `"2"`, nothing else
  differing. The `=== "1"` whitelist is correct either way, so this is
  curiosity.
- **`adherence` may not fit ±60 minutes.** Thirty live values spanned −19…+4 and
  nothing bounds it. Nothing renders it, so nothing is wrong today.

## Data quality

- **Five alternate stop names left the FTS index** — `KAMEHAMEHA HWY + OPP
  RADFORD DR`, `NORTH RD + RADFORD DR`, `MAUNAKEA ST + N. HOTEL ST`,
  `PALI HWY + 2627`, `PALI HWY + 2702`. Searching "radford" returns 6 stops
  instead of 8. Unavoidable while one row carries one name, and three of the
  five lost names are the lower-quality half of their pair.
- **Orphaned rows are dropped silently** during the build with no count logged.
  A future feed with an id-format change would lose rows invisibly.

## Robustness

- AsyncStorage `getItem`/`setItem` calls in `favorites.ts` are unwrapped, so a
  native-module I/O rejection propagates uncaught. Corrupt content is handled;
  hard I/O failure is not distinguished from it.
- `useLocation`'s bare `catch {}` leaves `'error'` undiagnosable — a permission
  race, a GPS timeout and services-off are indistinguishable. Logging was
  proposed and **explicitly declined**; recorded rather than re-litigated.
- `emit.mjs` requires `stop_name`/`stop_lat`/`stop_lon` unconditionally, but
  GTFS exempts these for `location_type` 3/4. Harmless on this feed; would
  hard-fail on a future one.
- `build.mjs` skips `db.close()` if `emitDatabase` throws.
- `meta` inserts use `?? null`, so a present-but-blank `feed_start_date` stores
  `''` rather than null.
- `routesForStopsSql(0)` would emit `IN ()`, which SQLite rejects. Unreachable
  today (guarded in `db.ts`); `stopsByIdsSql` shares the shape.
- `AppShell`'s `Waiting` and `Unavailable` consume no insets. Safe only because
  their content is vertically centred, and `Unavailable` is the screen every
  render error currently lands on.

## Self-refreshing data (Increment 5)

- **A pointer naming a file that is not there is not guarded.** `AppShell`
  passes the stored generation name to `SQLiteProvider` without checking it
  exists, and `openDatabaseAsync` *creates* what it cannot find — so the open
  succeeds, `DatabaseGate` never fires, and every screen silently shows no
  results. That is the worst failure shape in the app.

  Deferred because sequencing the sweep before the refresh removed the only path
  that reached it, and because the state otherwise needs AsyncStorage and the
  SQLite directory to disagree, which live in the same container. The fix is
  three lines: `databaseFiles.list()` in `useCurrentDatabaseName`, falling back
  to `BUNDLED_DATABASE`. The cost is pulling `expo-file-system` into the shell's
  module graph, which every suite rendering `AppShell` would then have to double.
- **`publish.mjs package` reads `assets/db/gtfs.db` from the checkout**, which
  is also where the committed floor lives. A skipped build step would publish
  the floor as a fresh build — correctly hashed, clearing the floor check,
  stamped with a `builtAt` of now. The workflow's two `if:` conditions are
  identical, so it cannot happen today. The guard, if wanted, is to refuse a
  database whose `meta.generated_at` predates the run.
- **Old generations accumulate in the `data` release forever** — ~1.2 MB weekly,
  ~62 MB a year, and nothing prunes. Pruning would have to keep every schema
  version's newest build alive for as long as a binary might ask for it. Not
  worth automating at this scale.
- **`publish.mjs check` downloads the whole 12 MB feed to decide it has not
  changed.** A `HEAD` and `Last-Modified` would usually avoid it, but the spec
  rejected inferring anything from dates, and the download is what the build
  needs anyway when the answer is "yes".
- **`Manifest.bytes` is parsed, required, and never used** — `sha256` subsumes
  it. Kept because it documents the contract the Action writes.

## Screens

- **The stack header on the arrivals screen reads "Arrivals", not the stop
  name.** The name is the first thing in the list body, so nothing is hidden; a
  dynamic title would read better.
- **Route detail shows no arrival times.** It is the ordered stop list and
  nothing else. Times per stop would mean one API request per stop.
- **Deep links are unverified.** `scheme: wheredabus` is set and the routes are
  URL-shaped (`/stop/596`), but nothing has opened one from outside the app.
- **`useNow` re-renders the whole board every 10 seconds** to move the
  countdowns. Fine at 25 rows; worth memoising if it grows.
- Route chips flicker for one frame when search clears, and stale entries
  persist when the id list is empty.
- The favorite `Pressable` lacks `accessibilityState={{ selected: isFavorite }}`.
  The label already communicates state, so VoiceOver is correct — cosmetic.

### Map, from the device rounds

Both cosmetic, and Truman was explicit about the order: "UI design needs work,
but that'll come later. Functionality first."

- **The *Search here* callout's text is not centred on its pin.** The bubble is
  drawn by this app rather than by MapKit, so the fix is ours and is a layout
  one.
- **The card's header and the arrivals screen's disagree.** `StopCard` shows
  distance and route-number chips; `/stop/[code]` shows neither. He prefers the
  card's. Adding chips to `ArrivalsScreen` costs it a `routesForStops` query it
  does not currently make.
- **Occasional crash, narrowed to the tap-hold *Search here* interaction.** No
  stack yet. Originally logged as "after interacting with a lot of things",
  seen once in Expo Go and not reproduced on the `.ipa` — weaker evidence than
  it sounds, since there was no reproduction to run either way. **Truman
  narrowed it on 2026-08-05, from field use, with moderate confidence**: the
  long press on the map that raises the *Search here* callout
  (`MapScreen.tsx:462`, `onLongPress` → `setPending` → `setAnchor`). Exact
  repro conditions still want writing down the next time it fires — how many
  long presses, whether the sheet was open, whether a previous callout was
  still up.

  **Increment 6's Task 2 is what makes the next one legible.** Today
  `DatabaseGate` catches it and tells the user to reinstall the app over a
  render error in the map, which both misinforms them and destroys the
  evidence.

## Tests

- **The suite flakes on a cold Jest cache — observed, not predicted.** Two
  `waitFor` calls have timed out at the 1 s default while the transform cache
  was still building (~4 s warm versus ~20 s cold). **This is a CI problem
  specifically**, because the workflow runs `npm ci` then `npm test` — a cold
  cache every time. Expect occasional red. The honest fix is that those
  assertions should not be racing a timer at all.
- **The debounce test is real-timer dependent**, two-sidedly: too slow and it
  sees 2+ calls, too fast and a sibling test fails.
- `App.test.tsx` reads mocked props through `jest.requireMock` with `any` all
  the way down, so renaming `onInit` or reshaping `assetSource` would not fail
  compilation.
- The device-metrics literal is duplicated across five suites and annotated
  `Metrics` in only some; inside a `jest.mock` factory a wrong shape is not
  caught by `tsc`.
- `build.mjs` (download, unzip, wiring) has no tests — only `derive.mjs`,
  `emit.mjs` and `publish.mjs`'s inputs are covered.
- Zero-route rendering is asserted only by absence of a crash.
- Distance-formatting boundaries are untested: 0 m, sub-metre, exactly 1000 m,
  and very large values. None are bugs; all are unasserted.
- No test for the transient `'loading'` location state, nor for CSV headers in a
  different order or with columns missing.
- **Nothing tests the router itself.** Route files are three lines each, so the
  untested surface is which component a URL maps to.
  `expo-router/testing-library` exists if that earns a test.

## Tooling and docs

- **`pdf-text.mjs` breaks lines mid-word.** It emits a newline for every `Td`,
  but generators use `Td` for horizontal moves within a line too, so
  `prominently` comes out as `pr` + `ominently` and no phrase greps. Pipe
  through `tr -d '\n'`. The real fix is to break only when the vertical operand
  is non-zero; deferred because it changes the output of all seven files and the
  README's verified claims were checked against the current shape.
- `pdf-text.mjs` cannot see objects packed into a `/ObjStm`. Harmless for these
  inputs, and it says so on stderr. Also unhandled: the `beginbfrange` array
  form, and `/Font` dicts containing a nested `>>`.
- `docs/api/README.md` reads `stop_ID` as `stops.stop_code`. Not stated by the
  vendor, and moot — `stop_id === stop_code` for all 3,830 rows in this feed.
- Validation errors report 0-indexed parsed-row numbers rather than 1-based file
  line numbers.
- `@types/jest` is pinned exactly while other devDependencies use ranges.
- **The web target is unsupported** but `package.json` still ships
  `"web": "expo start --web"`. The safe-area import once regressed it; whether
  the root provider fixed that is unverified, because web is not a target.

## Decided, and not to be reopened

**The scroll-indicator inset.** Resolved on device 2026-08-02 — the scrollbar
matches the content top and bottom. **The cause was never established, and
nobody should pretend otherwise**; the list moved hosts and lost a padding memo
in the same change. Two separate claims made about it were reasoned from source,
never observed, and both turned out to be wrong. **This has now misled four
investigations, and Truman has said explicitly to keep ignoring it.** If it ever
returns, the next step is measurement — log `contentInset` from the `onScroll`
payload against the list's `onLayout` frame — and not more reading.

**`mapPadding` is not the centring mechanism on Apple Maps.** `AIRMap.m:645`
assigns it to `layoutMargins`; the Google branch sets `padding`, which does move
the camera. `region.ts` centres by arithmetic instead, which cannot be wrong
about MapKit because it never asks. **This is a reading of native source, not an
observation** — the same move that produced the two wrong claims above.

**The 45% detent is not being raised.** One and a half arrival rows is the
intended shape: the next bus is the whole experience, and half a row beneath it
says "there is more" without saying so. The plan predicted five or six rows, so
a future session finding one and a half might otherwise "fix" it.

**Arrivals do lack a bus number, and that is correct.** `parse.ts` maps the
`"???"` sentinel to null, and it co-occurs exactly with `estimated !== "1"` —
1,228 of 1,269 sampled. 96% of arrivals have no bus number to show. Recorded
because it reads as a bug.

**`npm ci` is not run locally by default.** It is the only thing that catches a
lockfile peer conflict; `npm install` and the whole suite stay green through
one. CI covers it now that `dev` runs tests, which is how the `react-dom` break
was found — three pushes late.
