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

Increment 6 emptied the **Correctness** section — all six of its entries are
fixed, so the heading is gone rather than left standing over nothing. That is
not a claim that nothing is broken; it means nothing *known* is, and the
sections below are still full.

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
- **The map crash is diagnosed, and both previously recorded causes were
  wrong.** Kept rather than deleted because a race that stopped reproducing is
  not a race proven gone.

  **The evidence.** `Expo Go-2026-08-08-011041.ips`, off Truman's phone: an
  uncaught Objective-C exception from `-[__NSArrayM insertObject:atIndex:]`,
  raised on the main thread inside React Native's Fabric mounting transaction
  (`TelemetryController::pullTransaction`), terminating on SIGABRT. **Neither
  JavaScript nor MapKit** — the RN view-*mounting* layer, inserting a child
  component view at an index its backing array does not have. SDK 54 runs the
  New Architecture, so every map child goes through this path.

  **The reproduction that got us there** (2026-08-08, far better than the
  original): selecting stops quickly crashes reliably, and the faster he taps
  the fewer taps it takes. Marker icons also blank out when selecting one stop
  while another is selected.

  **What is established.** `AIRMap.m`'s `insertReactSubview:` intercepts
  markers, hands them to MapKit as annotations, and *deliberately never calls
  super* — there is a `#pragma` silencing the missing-super warning. So the
  map's real subview list and React's model of it are different things by
  construction, and an out-of-range insert is what you would expect the seam to
  produce. Read from source.

  **What is not.** *Why `zIndex` in particular* triggered it. An earlier version
  of this entry — and of the comments in `StopMarker` — asserted that `zIndex`
  is implemented by reordering sibling views. `AIRMapMarkerManager.m` exports it
  as a plain native prop that becomes `layer.zPosition`, which is an assignment
  and not a reorder. Whether React Native's own ordering also reacted to it is
  unread: those sources are prebuild output this project never generates.
  **Correlation, a plausible route through a seam that is real, and no proof.**
  Corrected here rather than left standing, because a confident wrong mechanism
  in a comment is exactly what this file exists to stop.

  **`zIndex` is gone from both marker components** and Truman could no longer
  reproduce the crash, "no matter how aggressively I abuse the map". Mechanism,
  three matching symptoms, and a failure to reproduce — short of proof, and
  recorded as such.

  **What this retires.** The two candidates this entry used to name —
  `pendingMarker.current?.showCallout()`, and unmounting the marker from inside
  its own callout's press handler — were both readings of native behaviour and
  **neither is what the log says**. They are struck. Note that the older
  tap-hold reproduction is plausibly the *same* bug: mounting `PendingMarker`
  and its `Callout` is a child mount/unmount on the same path, and both the
  callout and that marker's constant `zIndex` are now gone. Plausibly, not
  established — nobody has a log of the tap-hold crash.

  **If it returns**, the answer is not to read native source. It is another
  `.ips` off the phone, and then the mounting instructions: anything that makes
  React insert, remove or reorder a child view inside a `react-native-maps`
  component is a suspect, and marker *children* are the whole design here.

- **The same bug, in a second non-fatal form: markers jumping to the screen's
  top-left corner.** *Observed* `IMG_4524`, 2026-08-08 — two tiles and their
  names piled at the origin over the status bar, one minute after `IMG_4523`
  had the same stops in the right places, while repeatedly tapping pins to
  change the selection.

  The two displaced markers were the two whose labels had just become visible.
  `StopMarker` was rendering its label conditionally, so a change in the label
  set added or removed a child *inside* a marker — the same mount instruction
  against the same component view as the crash, and the same disagreement
  between React's bookkeeping and a hierarchy MapKit owns. Where the array
  insert threw, this one leaves the view alive with no position, and a view
  with no position is at the origin.

  **Fixed by never changing the tree**: the label is always mounted and hidden
  with `opacity`. Three crash-family symptoms now trace to one rule — *do not
  mount, unmount or reorder children inside a `react-native-maps` component* —
  which is worth more than any of the three fixes.

  **That cost arrived, and is fixed.** *Observed* 2026-08-08: "sometimes they
  can be on top of other icons and I think they're eating the press on those
  icons." `AIRMapMarker.reactSetFrame:` sets the annotation view's `bounds` from
  the React layout size and MapKit hit-tests by frame, so a label counted in the
  layout is a label that swallows taps aimed at its neighbours. The label is now
  `position: 'absolute'` and outside the layout box, leaving the marker's frame
  the size of its tile. Source-read, not guessed — but the drawing of a subview
  outside its parent's bounds is native behaviour and wants a look on a device.

- **Tapping a pin counts toward Apple Maps' double-tap-to-zoom.** *Observed*
  2026-08-08: switching selection by tapping pins in quick succession zooms the
  map. **There is no supported way to turn this off on Apple Maps** —
  `react-native-maps` exposes `zoomTapEnabled`, and its own type definitions say
  *iOS: Google Maps only*. Verified in
  `node_modules/react-native-maps/lib/MapView.d.ts`, not inferred.

  **The zooming recogniser is MapKit's own and is not exposed.** Confirmed by
  reading `AIRMapManager.m`: `react-native-maps` attaches its *own* single- and
  double-tap recognisers to the map, but the double-tap one only fires
  `onDoublePress` — it does not zoom — and both are created with
  `cancelsTouchesInView = NO` so that marker selection keeps working. The zoom
  therefore comes from `MKMapView`'s internal recogniser, which nothing in this
  library reaches.

  **Truman chose the blunt instrument, 2026-08-08, knowing the cost.** The map
  is told not to zoom for `ZOOM_LOCKOUT_MS` (320 ms, slightly longer than the
  system's double-tap window) after a pin tap, restarted on each tap so a run of
  taps stays still throughout. It is a plain prop on the map and not a change to
  any child, which is what makes it safe against the mounting bug above.

  **The cost, recorded because it is real:** a deliberate pinch begun within
  320 ms of tapping a pin does nothing. A proper fix is native and would leave
  the Expo Go loop, which is a larger decision than this one.

## Tests

- **The cold-cache failure is fixed, and its recorded cause was wrong.**
  Measured 2026-08-06 across five `--clearCache` runs: the same **three** tests
  failed **every** time, not occasionally, and none of them failed in a
  `waitFor` at the 1 s default. They exceeded **Jest's own 5 s per-test
  timeout**. Cold they take 6.7 s, 7.9 s and 8.3 s — `AppShell › asks for a key
  …`, `KeyGate › shows onboarding …`, `ArrivalsScreen › shows the stop it is
  about` — while all 404 others finish inside 1.03 s.

  `testTimeout: 20000` in `package.json` fixes it: three cold runs, zero
  failures. Raising RNTL's `asyncUtilTimeout` was tried first and is **not** in
  the fix — it was aimed at the wrong lever, and setting it to 5 s made things
  strictly worse by turning a fast assertion failure into a whole-test timeout
  at the very limit that was already being hit.

  The cost is that a genuinely hung test now takes 20 s to admit it instead of
  5 s. The fake-timer wedge described in `CLAUDE.md` — the one that hangs the
  run with no output — is slower to surface as a result.
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
