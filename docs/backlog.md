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
  only because their content is vertically centered.

## Self-refreshing data (Increment 5)

- **`publish.mjs package` reads `assets/db/gtfs.db` from the checkout**, which
  is also where the committed floor lives. A skipped build step would publish
  the floor as a fresh build — correctly hashed, clearing the floor check,
  stamped with a `builtAt` of now. The workflow's two `if:` conditions are
  identical, so it cannot happen today. The guard, if wanted, is to refuse a
  database whose `meta.generated_at` predates the run.
- **Old generations accumulate in the `data` release forever** — ~1.2 MB weekly,
  ~62 MB a year, and nothing prunes. Still unautomated, but no longer blocked on
  anything: Increment 9 retired the rule that every schema version's newest
  build had to stay alive indefinitely, so old files can simply be deleted by
  hand. Not worth automating at this scale.
- **`publish.mjs check` downloads the whole 12 MB feed to decide it has not
  changed.** A `HEAD` and `Last-Modified` would usually avoid it, but the spec
  rejected inferring anything from dates, and the download is what the build
  needs anyway when the answer is "yes".
- **`Manifest.bytes` is parsed, required, and never used** — `sha256` subsumes
  it. Kept because it documents the contract the Action writes.

## Screens

- ~~**The stack header on the arrivals screen reads "Arrivals", not the stop
  name.**~~ **Closed 2026-08-09, as working-as-intended.** Reviewed by Truman
  against the built app: the stop name header sits directly under the stack
  header in the screen body, so a dynamic title would say the same thing twice.
  *"The arrivals screen can keep the header."* Do not reopen this as polish.
- **Route detail shows no arrival times.** It is the ordered stop list and
  nothing else. Times per stop would mean one API request per stop.
- **Deep links are unverified.** `scheme: wheredabus` is set and the routes are
  URL-shaped (`/stop/596`), but nothing has opened one from outside the app.
- **`useNow` re-renders the whole board every 10 seconds** to move the
  countdowns. Fine at 25 rows; worth memoising if it grows.
- **`useArrivals` treats iOS's `inactive` exactly like `background`.** Its
  `AppState` handler branches on `status === 'active'` and sends everything else
  down the pause-and-abort path, so a Control Center pull, the app-switcher
  gesture, or a system dialog (including the location prompt) aborts the request
  in flight and then refetches the moment it is dismissed. One extra request per
  peek, against a quota shared by every install of the app.

  **This is a reading of documented `AppState` semantics, not something
  observed** — no one has counted requests on a device. It is also not obviously
  wrong: coming back from a ten-second glance at Control Center and seeing
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
  persist when the id list is empty. **Truman could not reproduce this on the
  Increment 8 `.ipa`, 2026-08-09, and did not recognise the description.** It
  came from a code review, never from a device. Either it is below the
  threshold of noticing or it no longer happens. **Reproduce it before spending
  anything on it**, and delete this entry if a device round says it is gone.
- The favorite `Pressable` lacks `accessibilityState={{ selected: isFavorite }}`.
  The label already communicates state, so VoiceOver is correct — cosmetic.

### Map, from the device rounds

- **Buses appear off the route line, because both directions' buses are drawn
  against one direction's line.** Reported by Truman from the Increment 8
  `.ipa`, 2026-08-09, with two screenshots of Route 2
  (`~/wheredabus-device/screenshots/2026-08-09/IMG_4666.png`, `IMG_4667.png`):
  *"Sometimes a live bus is off of the route line. What's up with that?"*

  **Measured, not inferred.** `useVehicles` filters the fleet on
  `sameRoute(vehicle.route, route)` and on freshness, and **on nothing else** —
  there is no direction term. The live feed at 21:29 that evening had 8 buses on
  Route 2, splitting exactly two ways by `headsign`:

  | headsign | count |
  |---|---|
  | `KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN` | 4 |
  | `WAIKIKI - KAPIOLANI CC - DIAMOND HEAD` | 4 |

  The sheet read *Toward KALIHI TRANSIT CENTER*, and bus 889 — the one sitting a
  block off the line in `IMG_4666` — was a `WAIKIKI` bus. It was drawn in the
  right place; it belongs to the other direction, which in that stretch runs the
  parallel one-way street. **The position is not wrong and MapKit is not
  wrong.**

  **The join exists and is cheap.** GTFS `trips.txt` carries
  `trip_headsign` alongside `direction_id`, and the strings are *byte-identical*
  to what the live feed returns — `KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN`
  appears verbatim in both. Distinct `(route, direction, headsign)` triples for
  the whole island: **333 rows**, so this is a ~15 KB table and a schema bump,
  not the ~500 KB a `trip_id → direction_id` table would cost (37,678 trips).

  **Two things whoever picks this up must know.** *A direction can have several
  headsigns* — Route 2 direction `1` has five, including `ALAPAI TRANSIT CENTER`
  and three Waikiki variants, so the mapping is many-to-one and a single
  equality test is wrong. And *twelve routes reuse one headsign across both
  directions*, where the headsign cannot disambiguate at all: **123, 14, 444,
  51, 52, 521, 53, 535, 54, 6, 7, 8** — mostly loops, where "direction" is a
  weak idea to begin with. Those routes need a fallback (geometry against the
  drawn polyline is the obvious one) or an accepted known gap.

  Not yet triaged into or out of any increment.

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

Both cosmetic, and Truman was explicit about the order: "UI design needs work,
but that'll come later. Functionality first."

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

  **THE CRASH RETURNED ON 2026-08-09, WITH `zIndex` ABSENT THROUGHOUT.** Two
  more `.ips` files, four minutes apart, both while pressing the route view's
  **X**: `Expo Go-2026-08-09-142634.ips` and `Expo Go-2026-08-09-143034.ips`.
  Both are the same stack as the first, frame for frame —
  `-[__NSArrayM insertObject:atIndex:]` raised on the main thread inside
  `facebook::react::TelemetryController::pullTransaction`.

  So **the `zIndex` attribution above is disproved.** Removing it correlated
  with the crash going quiet and nothing more; the entry always said the causal
  link was unproven, and it is now known to be wrong. The seam is real — that
  part is `AIRMap.m` and is not in doubt — but *what* provokes it is still open.

  **What is known, and what is not.** Pressing the X makes the largest tree
  change this app ever makes across that seam: `leaveRouteMode()` unmounts every
  route stop marker (68 on Route 2), unmounts every bus marker, and mounts the
  anchor's nearby set — over a cascade of renders, since `routeDetail`,
  `buses` and `linePoints` each clear in their own effect. That is a candidate
  and **not** a finding.

  **Duplicate React keys are the leading candidate, and there are two sources.**
  Found by logging the route-mode exit to Metro, whose output survives the app
  dying — which is what makes a native abort observable from a machine with no
  device on it.

  *Stops.* Eight route/directions serve one stop twice, and both markers took
  `key={stop.stop_id}`. Truman reproduced React's warning on routes 60, 83, 40,
  521 and 421. Fixed: `routePins` dedupes, `RouteList` keys by call. **These
  warn and do not crash** — a route's stop list is static once drawn.

  *Buses, which is the one that matters.* The live feed returns **the same fleet
  number twice**: `605` and `209` both, on Route 10, 2026-08-09, with React
  reporting *"Encountered two children with the same key"* against `buses.map`
  in `MapScreen`. Fixed in `useVehicles`, keeping the fresher record.

  Why buses and not stops: this list **churns every sixty seconds and is
  unmounted wholesale by the X**. React's own warning says duplicate keys mean
  children "may be duplicated and/or omitted", so its model of what it mounted
  diverges from what it mounted — and then it issues removal and insertion
  instructions against that wrong model, into an annotation array that already
  diverges from React's view by construction. An out-of-range
  `insertObject:atIndex:` is what that produces.

  It also explains the intermittency, which nothing else did: whether a poll
  carries a duplicate is a property of the live feed at that moment. The
  instrumented run shows it directly — presses #1–#6 had `buses=0` and
  `sinceFleet=never` and all survived; the crash came once buses arrived.

  **Both dedupes are in, both warnings are gone, and IT STILL CRASHES.**
  Confirmed 2026-08-09: Truman reproduced it again with no `same key` error
  anywhere in the log, and route 40 — one of the eight — clean. So duplicate
  keys were two real bugs found on the way and **not** the cause. The paragraphs
  above are kept because the reasoning was sound and the next person will
  otherwise re-derive it; they are not a lead.

  **Do not rebuild the `[routeExit]` instrument. It cannot catch this.** It
  logged the state at press time on the theory that the line had a frame to
  reach Metro before the abort. It does not: across the whole session every
  logged press has its `done`, and the fatal ones show up only as the counter
  resetting to `#1` on relaunch. Whatever kills the process takes the log line
  with it. Anything that works has to survive outside the JS runtime — the
  `.ips` files, or a native breakpoint, neither of which this machine can drive.

  **Truman stopped the chase on 2026-08-09** — *"Screw this. Give up, and let's
  just move on."* — and then reopened it the same day with what looked like the
  first hard fact the crash had produced:

  > it reliably crashes if I press the close button when the buses have been
  > fetched (specifically after it changes from "Looking for bus" to "1 bus")
  > but have not been rendered on the map yet. … the bus icons don't render
  > until you move/zoom the map a bit. But if it's visible and the button is
  > pressed, it doesn't crash.

  That reading — **one defect, triggered by a window** — was wrong, and is the
  last of this entry's theories to fall. Both halves of it dissolved separately
  on the evening of 2026-08-09. Kept because it was reasonable and because the
  next person will otherwise re-derive it.

  ### RESOLVED 2026-08-09: two marker swaps in flight

  **The cause is overlap, not timing.** Every control on the route view replaces
  `MapView`'s markers wholesale — the two directions of Route 2 share *2 stops
  out of 68*, so a direction flip takes 66 annotations off and puts 66 on in one
  commit, and the X is larger again. Issue a second such swap while the first is
  still being applied and the map is handed insertions against a subview array
  that has already moved underneath it. That is the out-of-range
  `insertObject:atIndex:`, and it is the seam this section has always described.

  Two reproductions, both by Truman, both deliberate: **spamming the direction
  control**, and **a flip followed quickly by the X**. Slow flips never crashed.
  Single presses never crashed. That is why every earlier report read as
  intermittent — the precondition was a second gesture, not a render state.

  Fixed by `swapBusyUntil` in `features/map/MapScreen.tsx`: one window, shared
  by the controls, sized at `CAMERA_MS` because the camera move and the swap are
  started by the same commit. A blocked flip is **dropped** (honouring it would
  land the rider back where they started); a blocked close is **deferred and
  then honoured** (a close that silently does nothing is a broken app). Entering
  route mode is deliberately not gated — reaching it needs a search opened and a
  result tapped, so the gap is human-scale.

  It cannot be fixed where it lives. Expo Go rules out patching
  `react-native-maps`, and the swap cannot be made small enough not to matter:
  holding both directions' stops at once is 134 markers and both sides of every
  street. Serialising is the only join this app owns.

  ### The undrawn buses were a *different* bug

  **They are not one defect.** The crash did not return once the gate was in,
  with or without any of the marker changes; the drawing fault survived the gate
  untouched. Two things were being seen at once and read as one:

  - **A single bus on the wrong line.** Route 10 had one bus, running the
    direction *opposite* the one on screen. `useVehicles` filters on route and
    never on direction, so the dot was drawn correctly — just nowhere near the
    red line being scanned. Confirmed by pulling the live fleet endpoint from
    the dev machine and telling Truman the coordinate to look at.
  - **Degradation on flip**, which is real and is fixed. Keyed on the fleet
    number alone, one flip dropped the bus dots *below* the stop pins and a
    second took them off the map entirely while the band still read "9 buses".
    The buses are the children React *preserves* across a flip while `pins` is
    replaced wholesale underneath them, and the carried-over annotation comes
    out stale. `BusMarker`'s key now includes the direction, so a flip remounts
    them; see the comment at the render site.

  **`TRACKING_ALWAYS` is falsified and removed.** With the flag gone the dots
  draw on the first open with no gesture at all, so the blind 450 ms
  `tracksViewChanges` timer was never implicated. `StopMarker` uses the same
  450 ms and never had the fault, which should have been the clue.

  **The structural lead was acted on**: `{buses.map(…)}` now renders *after*
  `{pins.map(…)}`, so the live layer draws over the reference layer (a route-10
  dot was photographed sitting behind a stop pin) and the bus array is last, so
  draining it moves no sibling's index. Worth having on both counts. **It did
  not by itself stop the crash** and must not be written up as though it did.

  **Still open, and small**: `PendingMarker` is still mounted conditionally,
  which the rule at the top of this entry forbids. Nothing has crashed from it —
  long press is disabled in route mode, so it cannot appear during a swap.

  ### IT RETURNED IN THE .ipa, 2026-08-09 EVENING — open, and deliberately not chased

  **`swapBusyUntil` narrowed this crash; it did not close it.** Two more aborts
  on the Increment 8 `.ipa` (build 31362863297), on iPhone 11,8 / iOS 18.7.9:
  `WhereDaBus-2026-08-09-205341.ips` and `WhereDaBus-2026-08-09-205901.ips`, in
  `~/wheredabus-device/crashes/2026-08-09/`.

  **They are the same crash, frame for frame**, and the two new files are
  identical to each other: `EXC_CRASH` / `SIGABRT` on the main thread, an
  Objective-C exception out of `-[__NSArrayM insertObject:atIndex:]`, raised
  under `-[AIRMap insertReactSubview:atIndex:]` inside
  `-[RCTLegacyViewManagerInteropComponentView finalizeUpdates:]` →
  `TelemetryController::pullTransaction`. That is this entry's seam, unchanged.
  **Do not open a second entry for it, and do not write it up as a new bug** —
  Truman's first read on the phone was that it looked like a different crash,
  and the stacks say otherwise.

  **What was pressed is unknown, and is recorded as unknown.** Truman was using
  the app rather than testing it and did not see either one land. What the files
  do carry: both hit roughly four minutes into a session (launch 20:49:16 →
  abort 20:53:39; relaunch 20:53:40 → abort 20:59:00), so this is not a launch
  fault and not a first-gesture fault. **Do not infer the gesture from the
  timing.** The whole history of this entry is people reasoning past the
  evidence they actually had.

  **Why it is open rather than being worked:** *"I don't think they're the same
  crashes as the one we just fixed, so let's just log it and not spend another
  evening tracking another stupid crash."* The premise turned out to be wrong
  and the decision stands anyway — the app is usable, the core features are
  proven, and polish comes next. This is the record so the next occurrence has
  something to join to.

  **What would actually move it**, whenever it is picked up: a session where the
  gesture is written down as it happens. Three data points and this entry has a
  precondition instead of a seam. Everything else here is already known.

  **If it returns, do not read native source.** Get the `.ips` off the phone
  (Settings → Privacy & Security → Analytics & Improvements → Analytics Data,
  filed under `Expo Go-…` in the dev loop and `WhereDaBus-…` from an `.ipa`),
  and write down what was on screen and *what was
  pressed, in what order and how fast* before forming any theory. Every report
  before 2026-08-09 recorded the state and not the gesture, which is exactly the
  half that turned out to matter.

- **Tapping a pin counts toward Apple Maps' double-tap-to-zoom**, and there is
  no supported way off. `zoomTapEnabled` is *iOS: Google Maps only* per
  `react-native-maps`' own type definitions, and the zooming recogniser is
  `MKMapView`'s internal one, which the library never reaches — its own
  double-tap recogniser only fires `onDoublePress`.

  So the map is told not to zoom for `ZOOM_LOCKOUT_MS` after a pin tap. **The
  cost is real and Truman accepted it knowingly:** a deliberate pinch begun
  within that window does nothing. A proper fix is native and would leave the
  Expo Go loop.

  **`Marker`'s `tappable` is the same trap**, and it caught this project a
  second time on 2026-08-09: also *iOS: Google Maps only*, so a marker cannot
  be told to decline a tap on Apple Maps. It came up because buses draw above
  stops and MapKit gives the tap to the annotation on top, which made a stop pin
  under a bus dot take two presses. Fixed by routing rather than declining —
  `BusMarker` takes an `onPress` and hands it to `stopUnderBus`. **Check the
  `@platform` line on any `react-native-maps` prop before building on it**;
  roughly a third of them are Google-Maps-only and the types say so in a tag
  that reads like documentation rather than a constraint.

## Tests

- ~~**Test files are not typechecked at all.**~~ **Fixed on 2026-08-09.**
  `tsconfig.json` excluded `**/__tests__/**/*`, so `npm run typecheck` never
  compiled a single test — which is how adding one field to `RouteView` broke
  seven `StopSheet` tests that day with a perfectly clean typecheck. Truman:
  *"I just excluded it so it would work when I ran the typecheck script."* The
  exclude is now `["node_modules", ".claude"]`; the `.claude` half is
  load-bearing (subagent worktrees) and stays. Including the tests surfaced 67
  accumulated errors, all fixed in the same change. **The entries below are what
  is still weak in the tests, and `tsc` now covers none of them by accident.**

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
the camera. `region.ts` centers by arithmetic instead, which cannot be wrong
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
