# Backlog

**What is known-broken or consciously deferred, and still true.** Everything
here was found by review or on a device, triaged, and left on purpose — none of
it is speculative.

Resolved entries are deleted rather than struck through; commit messages hold
that history. If something here names a file that no longer exists, the entry is
stale and should be re-checked rather than trusted.

**Trust the symptoms here; measure the causes.** An entry's description of what
goes wrong has held up every time. Its explanation of *why* is often an
inference someone made once, and two have now been wrong: the cold-cache
failures were blamed on a 1 s `waitFor` default when they were Jest's 5 s
per-test timeout, and reaching for the lever the entry named made things
strictly worse; the blank `feed_start_date` entry read as a latent bug and is
inert. Reproduce before fixing — and when the stated cause turns out to be
wrong, correct the entry rather than only the code.

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
- **`meta` inserts use `?? null`, so a present-but-blank `feed_start_date`
  stores `''` rather than null. Verified inert 2026-08-06**: `parseFeedDate('')`
  fails its `^\d{8}$` test and returns null, so `feedValidity` reads `''`
  exactly as it reads null — `unknown`. Recorded as checked so the next reader
  does not have to look.

## Robustness

- `useLocation`'s bare `catch {}` leaves `'error'` undiagnosable — a permission
  race, a GPS timeout and services-off are indistinguishable. Logging was
  proposed and **explicitly declined**; recorded rather than re-litigated.
- `emit.mjs` requires `stop_name`/`stop_lat`/`stop_lon` unconditionally, but
  GTFS exempts these for `location_type` 3/4. Harmless on this feed; would
  hard-fail on a future one.
- `build.mjs` skips `db.close()` if `emitDatabase` throws.
- `routesForStopsSql(0)` would emit `IN ()`, which SQLite rejects. Unreachable
  today (guarded in `db.ts`); `stopsByIdsSql` shares the shape.
- `AppShell`'s `Waiting`, `Unavailable` and `Unexpected` consume no insets. Safe
  only because their content is vertically centred.

## Self-refreshing data (Increment 5)

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
- **`useArrivals` treats iOS's `inactive` exactly like `background`.** Its
  `AppState` handler branches on `status === 'active'` and sends everything else
  down the pause-and-abort path, so a Control Centre pull, the app-switcher
  gesture, or a system dialog (including the location prompt) aborts the request
  in flight and then refetches the moment it is dismissed. One extra request per
  peek, against a quota shared by every install of the app.

  **This is a reading of documented `AppState` semantics, not something
  observed** — no one has counted requests on a device. It is also not obviously
  wrong: coming back from a ten-second glance at Control Centre and seeing
  ten-second-old times is the behaviour the immediate refetch exists for. Worth
  measuring before changing, and worth changing only with a device to check it
  on.
- **Switching the search filter shows the previous filter's results for one
  debounce window.** `useSearch` re-runs its effect on a filter change and sets
  `{ state: 'running', results: onScreen.current }`, so `SearchOverlay`'s
  `ResultList` renders stop rows under a *Routes* chip — or the reverse — for
  ~175 ms while "Searching…" is on screen. **`StopsScreen` is immune**: it
  splits results by `kind` through `foundStops`/`foundRoutes`, so the
  mismatched rows are filtered out client-side and the list simply shows
  nothing. Found by Increment 7's whole-diff review on 2026-08-09, **not on a
  device**; cosmetic, self-correcting, and a mis-tap during the window still
  opens the stop the row names. The fix is to distinguish a filter change from
  a query change in the effect and reset to `NO_RESULTS` on the former — the
  carry-forward exists so a *keystroke* never blanks the list under a thumb,
  which is not what an explicit change of filter is.
- ~~**Where a bus's lateness is shown is undecided.**~~ **Done**, 2026-08-09, in
  the route mode UX pass. It is the ring around the bus's dot — amber behind,
  violet ahead, nothing when on time or unreported — plus a count in the route
  band's second line. **Not on the arrival rows**, which was the first design:
  `Arrival` has no `adherence` field, the only join to a `Vehicle` is `tripId`,
  and ~96% of arrivals are schedule-only, so a row could carry it about one time
  in twenty-five. `features/map/adherence.ts` holds the thresholds and the
  sign convention.

- **Which bus is late is colour-only, and that is accepted.** The count in the
  band states the fact in words, so the map never says something *only* in
  colour — but a rider who cannot separate amber from violet learns how many are
  late and not which. Recorded rather than fixed because the honest fix is
  making buses tappable, which is a feature rather than a UX pass. Whoever picks
  it up: `BusMarker` currently sets `pointerEvents="none"` on its wrapper and
  passes no `onPress`.
- Route chips flicker for one frame when search clears, and stale entries
  persist when the id list is empty.
- The favorite `Pressable` lacks `accessibilityState={{ selected: isFavorite }}`.
  The label already communicates state, so VoiceOver is correct — cosmetic.

### Map, from the device rounds

- ~~**Bus labels are unreadable with every stop pin showing.**~~ and
  ~~**Stop pins cover the route line.**~~ **Both done**, 2026-08-09, in the route
  mode UX pass — and they turned out to be **one** defect rather than two.

  Truman's screenshots showed route mode is legible at street scale and unusable
  at route scale, where forty 34-pt tiles fuse into an unbroken chain. Both
  symptoms were observed only at the wide zoom and neither reproduces at the
  zoom he was happy with, so the fix is a zoom tier rather than either of the
  moves listed here before: `scaleOf` in `labels.ts` splits `'route'` from
  `'street'`, stop tiles collapse to 8-pt dots past the threshold, and both
  layers' labels go quiet. Buses now go through the same collision map as stop
  names, claiming first.

  **The `zIndex` rule below was never tested and still stands** — nothing in
  that pass reintroduced it. The line became visible because the pins got out of
  its way, not because anything was reordered.

  Full reasoning: `docs/superpowers/specs/2026-08-09-route-mode-ux-pass.md`.
  The screenshots are transcribed in
  `docs/superpowers/logs/2026-08-09-route-mode-ux.md`.

- **A bare number in Address mode geocodes to something unrelated, and that is
  accepted.** Truman typed `2469`; `findOnOahu` asked `CLGeocoder` for
  `2469, HI` and got *2339 Kamehameha Hwy E, Honolulu* back as a single
  confident result. Reviewed on a device 2026-08-09 and **left as it is** —
  "let's accept that behavior and leave it for now."

  It is the geocoder's matching, and nothing here can tune it: `geocodeAsync`
  takes a string and returns coordinates, with no region, no ranking and no
  confidence. The design already contains the damage — the *"Did you mean…?"*
  confirmation showed the wrong address before the map moved, and the nudge
  underneath was already offering *"1 stop matches — switch to Stops"*.

  **Do not "fix" this by rejecting digits-only input.** Postal codes are digits
  and they geocode correctly; the rule would break the working case to catch the
  ambiguous one. The two real options, if it is ever worth it, are a different
  geocoder (a second key and a second terms-of-use) or ranking the confirmation
  down when the returned street number differs from the typed one.

- **The "no location permission" banner flashes on launch before the fix
  arrives.** Observed by Truman in Expo Go, 2026-08-09, and triaged by him as
  minor: "the location stuff works. It's not ideal, but it works."

  `MapScreen` renders the banner whenever `source === 'fallback'` and
  `locationStatus !== 'loading'`. On a cold launch `locationStatus` starts at
  `'idle'`, and the anchor is the downtown fallback — both true for the window
  between the map drawing and `onMapReady` moving the status to `'loading'`, so
  the banner is briefly correct and then wrong.

  The obvious fix is to suppress it while the status is still `'idle'`, but
  `'idle'` is also the resting state of a launch where the rider never gets a
  prompt at all, and suppressing it there would remove the only thing telling
  them ⌖ exists. **Whatever is done here needs a device round to confirm**, and
  the flash costs nothing today.

Both cosmetic, and Truman was explicit about the order: "UI design needs work,
but that'll come later. Functionality first."

- **The *Search here* callout's text is not centred on its pin.** The bubble is
  drawn by this app rather than by MapKit, so the fix is ours and is a layout
  one.
- **The card's header and the arrivals screen's disagree.** `StopCard` shows
  distance and route-number chips; `/stop/[code]` shows neither. He prefers the
  card's. Adding chips to `ArrivalsScreen` costs it a `routesForStops` query it
  does not currently make.
- **Never mount, unmount or reorder a child inside a `react-native-maps`
  component.** This is the rule the whole section exists for, and it is worth
  more than the three bugs that produced it.

  `AIRMap.m`'s `insertReactSubview:` intercepts markers, hands them to MapKit as
  annotations, and deliberately never calls super — so the map's real subview
  list and React's model of it are different things by construction. Changing
  the tree across that seam produced, in order: a **SIGABRT**
  (`Expo Go-2026-08-08-011041.ips` — an out-of-range
  `-[__NSArrayM insertObject:atIndex:]` inside Fabric's mounting transaction,
  neither JavaScript nor MapKit); **markers jumping to the screen's top-left**,
  a view left alive with no position, when a label mounted inside a marker; and
  **labels swallowing taps** aimed at neighbouring pins, because
  `AIRMapMarker.reactSetFrame:` sizes the annotation view from the React layout.

  All three are fixed by never changing the tree: `zIndex` is gone from both
  marker components, labels are always mounted and hidden with `opacity`, and
  they are `position: 'absolute'` so they sit outside the marker's frame.
  Truman could no longer reproduce the crash "no matter how aggressively I abuse
  the map" — short of proof, and recorded as such, which is why this entry
  stays.

  **If it returns, do not read native source.** Get another `.ips` off the
  phone, then look for whatever started mounting children again.

- **Tapping a pin counts toward Apple Maps' double-tap-to-zoom**, and there is
  no supported way off. `zoomTapEnabled` is *iOS: Google Maps only* per
  `react-native-maps`' own type definitions, and the zooming recogniser is
  `MKMapView`'s internal one, which the library never reaches — its own
  double-tap recogniser only fires `onDoublePress`.

  So the map is told not to zoom for `ZOOM_LOCKOUT_MS` after a pin tap. **The
  cost is real and Truman accepted it knowingly:** a deliberate pinch begun
  within that window does nothing. A proper fix is native and would leave the
  Expo Go loop.

## Tests

- **Test files are not typechecked at all.** `tsconfig.json` excludes
  `**/__tests__/**/*`, so `npm run typecheck` never compiles a single test. A
  fixture typed `const ROUTE_VIEW: RouteView` that is missing a required field
  passes `tsc` and then fails at runtime with `Cannot read properties of
  undefined` from inside the component — which is how adding one field to
  `RouteView` broke seven `StopSheet` tests on 2026-08-09 with a clean
  typecheck.

  The exclusion is not obviously wrong: the comment above it is about subagent
  worktrees under `.claude/`, and that part is load-bearing. Whether the
  `__tests__` half was deliberate or collateral is unread. Including them would
  need `@types/jest` to resolve everywhere and would surface whatever has drifted
  since — do it as its own change, not folded into something else.

- **`testTimeout: 20000` in `package.json` is load-bearing.** Three tests
  legitimately take 6–8 s on a cold cache and blew Jest's 5 s default. Raising
  RNTL's `asyncUtilTimeout` instead was tried and made things strictly worse —
  it is the wrong lever. The cost: a genuinely hung test now takes 20 s to
  admit it, which makes the fake-timer wedge in `CLAUDE.md` slower to surface.
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

**The scroll-indicator inset.** Resolved on device 2026-08-02; the cause was
never established and nobody should pretend otherwise. **It has misled four
investigations and Truman has said explicitly to keep ignoring it.** If it
returns, measure — log `contentInset` from the `onScroll` payload against the
list's `onLayout` frame — rather than read.

**`mapPadding` is not the centring mechanism on Apple Maps.** `AIRMap.m:645`
assigns it to `layoutMargins`; the Google branch sets `padding`, which does move
the camera. `region.ts` centres by arithmetic instead, which cannot be wrong
about MapKit because it never asks. **This is a reading of native source, not an
observation** — the same move that produced the two wrong claims above.

**Arrivals do lack a bus number, and that is correct.** `parse.ts` maps the
`"???"` sentinel to null, and it co-occurs exactly with `estimated !== "1"` —
1,228 of 1,269 sampled. 96% of arrivals have no bus number to show. Recorded
because it reads as a bug.

**`npm ci` is not run locally by default.** It is the only thing that catches a
lockfile peer conflict; `npm install` and the whole suite stay green through
one. CI covers it now that `dev` runs tests, which is how the `react-dom` break
was found — three pushes late.
