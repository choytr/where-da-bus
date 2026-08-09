# Increment 8 — plan

Spec: `docs/superpowers/specs/2026-08-09-increment-8-routes-on-the-map.md`.

**Contracts, not code.** Files touched, exported signatures, test names, and
decisions already settled.

Run after each task: `npm test`, `npm run typecheck`. Tasks 1 and 2 also need
`npm run test:scripts`. Before the increment closes, `npm ci` as well.

**Push at a task boundary, never mid-task.** Every push to `dev` runs the Tests
workflow, and Truman has asked twice for fewer.

**Two device rounds, and neither is at the end** — after Task 4, when the pin set
first swaps and a `<Polyline>` first mounts inside `MapView`, and after Task 6,
when live buses first churn. Both are the SIGABRT seam at `docs/backlog.md:165`.
`gh workflow run ios-ipa.yml --ref dev`.

---

## Task 1 — Shapes in the asset, and `SCHEMA_VERSION` 1 → 2

**Files:** create `data/gtfs/polyline.ts`, `scripts/build-gtfs/simplify.mjs`;
modify `scripts/build-gtfs/derive.mjs`, `emit.mjs`, `data/gtfs/sql.ts`,
`data/gtfs/db.ts`; rebuild `assets/db/gtfs.db`. Tests:
`data/gtfs/__tests__/polyline.test.ts`,
`scripts/build-gtfs/__tests__/simplify.test.mjs`, and the existing
`derive.test.mjs`, `emit.test.mjs`, `data/gtfs/__tests__/sql.test.mjs`.

**Contract:**

```
// data/gtfs/polyline.ts — shared, imported by emit.mjs the way SCHEMA_VERSION is
encodePolyline(points: readonly Coords[]): string    // precision 5
decodePolyline(encoded: string): Coords[]
  // `Coords` from lib/distance, via `import type` — erased by Node's type
  // stripping, which is the same reason sql.ts can already import it and still
  // be loaded by emit.mjs. Do not declare a second coordinate type here.

// scripts/build-gtfs/simplify.mjs — build-only
simplify(points, toleranceMeters): points            // Douglas–Peucker

// scripts/build-gtfs/derive.mjs
representativeTrips(stopTimesRows, tripsRows): Map<`${route_id}\0${direction_id}`, tripId>
deriveRouteStops(stopTimesRows, tripsRows)           // output unchanged; now calls the above
deriveRouteShapes(tripsRows, representatives): { route_id, direction_id, shape_id }[]
deriveShapes(shapesRows, toleranceMeters): { shape_id, polyline }[]

// data/gtfs/sql.ts
SCHEMA_VERSION = 2
SHAPE_BY_ID      // (shape_id) -> polyline
ROUTE_SHAPES     // (route_id) -> direction_id, shape_id
FLOOR gains `shapes: 400`; FLOOR_COUNTS and TableCounts gain `shapes`

// data/gtfs/db.ts
RouteDirection gains `shapeId: string | null`        // routeStops runs both queries
shapeById(shapeId: string): Promise<Coords[] | null>
```

**Settled:** all 532 shapes keyed by `shape_id`, **simplified at 10 m** — ~152
KiB, taking the asset to ~1.32 MB. Not the cheaper 236 per route+direction: every
arrival names the exact variant its bus is running. **The connect-the-stops line
is dead** — p90 1.3 km wrong, worst 7.3 km. Do not revive it.

**`representativeTrips` is an extraction, not a rewrite.** `deriveRouteStops`
already picks the trip visiting the most stops per route+direction; the shape must
come from **that same trip**. Two copies of the selection would drift, and
comparing one trip's stops against another's shape is the mistake that was made
and corrected on 2026-08-09.

**The floor rebuild lands in this commit.** `npm run build:gtfs` (the feed is
already cached in `.gtfs-cache/`) and commit `assets/db/gtfs.db` with the bump.
Either alone leaves the app asking the floor for a table it lacks. This is the
sanctioned exception to `CLAUDE.md`'s ban — Truman authorised it.

**What was built.** As planned, plus three things the contract did not say.
`deriveShapes` orders points by `shape_pt_sequence` **numerically** — the feed
counts from 10001, so a lexical sort puts 10010 before 1002 and the line becomes
a scribble. Simplification measures to the **segment**, not to the infinite line
through its ends: Oahu's feed has a loop at most termini, and measuring to the
line reports the far end of a loop as lying on it, collapsing it to a straight
there and back. And `build.mjs` now applies the publish floor itself, because
`emitDatabase` defaults `shapes` to empty so the existing relationship tests need
not supply it — which means a build that stopped deriving shapes would emit a
valid database with no route lines and nothing about the run would look wrong.

Measured after the rebuild: **532 shapes, 152 KiB of polyline, 236
route/directions, asset 1.17 MB → 1.37 MB.** The spec's estimate of 1.32 MB was
the polyline bytes alone and did not count the two tables' own pages.

**Tests:** `round-trips a polyline through encode and decode`; `encodes a known
polyline byte for byte`; `drops a point that lies on the line between its
neighbours`; `keeps a point that deviates by more than the tolerance`; `picks the
same representative trip for stops and for shapes`; `emits one shape row per
shape_id`; `emits one route_shapes row per route and direction`; `a route's
directions carry the shape id of their representative trip`; `the built asset
carries a shape for every route direction`.

---

## Task 2 — The dual publish, so an old binary keeps updating

**Files:** modify `scripts/build-gtfs/publish.mjs`, `data/gtfs/refresh.ts`,
`.github/workflows/gtfs-data.yml`. Tests: create
`scripts/build-gtfs/__tests__/publish.test.mjs`; modify
`data/gtfs/__tests__/refresh.test.ts`.

**Contract:**

```
// publish.mjs
downgradeToV1(sourcePath, destPath): void
  // copies, DROPs shapes and route_shapes, UPDATEs meta.schema_version = 1, VACUUMs
pkg() stages, in this order:
  dist/gtfs-v2-<stamp>.db + dist/manifest-v2.json   (schemaVersion 2)
  dist/gtfs-v1-<stamp>.db + dist/manifest.json      (schemaVersion 1)
  emitOutput({ file_v2, file_v1 })

// refresh.ts
export const MANIFEST_URL = `${RELEASE_BASE}/manifest-v${SCHEMA_VERSION}.json`
```

**The trap this task exists for, found while writing the spec.**
`manifest.json` is hardcoded in every binary already on a phone, and
`checkForUpdate` returns null when `manifest.schemaVersion !== SCHEMA_VERSION`.
Publishing a v2 manifest at `manifest.json` does not merely fail to help an old
binary — **it switches that binary's updates off silently and permanently**,
which is the outcome the dual publish exists to prevent. So `manifest.json` keeps
describing a **v1** generation forever, and every binary from here asks for
`manifest-v<SCHEMA_VERSION>.json`.

**Settled:** the v1 file is derived from the v2 build rather than emitted twice,
so the two generations are the same feed by construction and the 73 MB
`stop_times.txt` is parsed once. It must be a **genuine** v1 database —
`installUpdate` reads `schema_version` out of the downloaded file
(`refresh.ts:201`), so a v2 file wearing a v1 label fails on the phone rather
than in CI.

**Floor-check before downgrading**, not after: the v1 file has no `shapes` table
and `FLOOR_COUNTS` now counts one.

**Workflow:** upload both databases *before* both manifests, keeping the existing
rule that a manifest which exists always describes an asset that exists.

**What was built.** The plan's contract, and then a bug the contract implied but
did not name. **A stored pointer is not evidence about the *schema* of the file
it names.** Truman's phone holds a pointer at a `gtfs-v1-…` generation that is
still on disk; a v2 binary opens it happily, and every shape query then fails
with "no such table" while the pointer, the file and its checksum are all in
order. So `isReadableGeneration` was added to `refresh.ts` and applied in three
places — `AppShell` opens the floor instead, `dataRefresh` treats the pointer as
absent so the check downloads rather than comparing timestamps, and
`staleGenerations` now sweeps **every** schema's generations so the dead v1 file
is reclaimed. Without the second of those the app would have sat on the bundled
floor for up to a week, because both generations of one build carry the same
`builtAt` and the comparison would have said "up to date".

Two smaller ones. `publish.mjs`'s CLI now runs only when the file is the entry
point — importing it to test it otherwise hits `process.exit(2)` and kills the
test process before a single assertion. And `pkg` takes its `built`/`dist` paths
so the end-to-end test stages into a temporary directory instead of the working
tree's `dist/`.

`MANIFEST_URL` is simply `manifest-v${SCHEMA_VERSION}.json` with no v1 special
case: `SCHEMA_VERSION` is a literal type, so comparing it to `1` is a compile
error — and that pointed at something true, which is that the app never needs
the old name. Keeping `manifest.json` alive is entirely the publisher's job.

**Tests:** `the downgraded database has no shapes table`; `the downgraded
database reports schema version 1`; `the downgraded database still meets the v1
floor`; `both manifests describe the same feed`; `the app asks for its own
schema's manifest`; `a manifest for another schema is ignored` (existing, must
still pass).

---

## Task 3 — Route mode on the map, and the sheet's third mode

**Files:** create `features/map/routeMode.ts`, `features/map/RouteList.tsx`;
modify `features/map/MapScreen.tsx`, `StopSheet.tsx`, `StopMarker.tsx`,
`SearchOverlay.tsx`. Tests: `features/map/__tests__/routeMode.test.ts`, and
`MapScreen.test.tsx`, `StopSheet.test.tsx`.

**Contract:**

```
// features/map/routeMode.ts — module-level store, read with useSyncExternalStore
export type RouteMode = { routeId: string; directionIndex: number }
useRouteMode(): RouteMode | null
enterRouteMode(routeId: string): void      // directionIndex 0
flipDirection(): void
leaveRouteMode(): void

// StopSheet gains one prop
routeView: {
  route: RouteSummary | null
  directions: RouteDirection[]
  directionIndex: number
  onFlip: () => void
  onLeave: () => void
  onSelect: (stop: Stop) => void
} | null

// StopMarker's `stop` widens from StopWithDistance to Stop — it reads only
// stop_id, lat, lon and stop_name, and route stops carry no distance.
```

**Settled:** picking a route **on the map** — from the search overlay or from a
route chip on a stop card — enters route mode instead of pushing `/route/[id]`.
The Stops tab and `RouteScreen` are untouched. The route's stops become the
map's pins. **An X leaves route mode and nothing else does**: panning does not
drop it, and switching tabs does not drop it. Direction is named
`Toward <last stop name>`, reusing `RouteScreen`'s wording
(`features/routes/RouteScreen.tsx:44`) — GTFS's `0`/`1` tells a rider nothing.

**Why a module-level store:** "switching tabs does not drop it" is otherwise a
bet on whether React Navigation keeps a tab scene mounted, which is an unmeasured
native behaviour — the class of thing this project has got wrong six times. Make
it certain instead and spend the device round on something else.

**The band stays exactly `PEEK_BAND` tall in all three modes**
(`features/map/peek.ts:4`), or the resting sheet twitches. Route mode's band
carries the route, the direction, the flip control and the X on one line; the
card's band reads `‹ Route 1 · ★` where it read `‹ Nearby · ★`. **Wording and
treatment are provisional** — Truman asked for the current direction to be made
unmistakable and will confirm it on a device.

**Also:** a route stop tapped in the sheet centres the map; its pin does not
(Increment 7's rule). Selecting a pin in route mode opens the card and its back
control returns to the route list, not to nearby. The legend is pinned in route
mode like every other Data-showing mode, and still omitted at the peek. **Hide
the *Search this area* offer in route mode** — it would replace an anchor whose
stops are not the ones on screen.

**What was built.** The contract as written. Three things worth knowing.

`RouteList` is its own component rather than a mode inside `StopSheet`, and its
rows show the **sequence number**, not a distance — matching `RouteScreen`. A
route's stop list is a sequence; "400 m away" says nothing a rider wants at the
moment they are reading the run.

`MapScreen` keys the route query on the **route id alone, never the direction**.
Flipping is a choice about what to draw from data already in hand, and
re-querying would blank the sheet for a frame on every tap. `routeDetail` carries
the id it was loaded for, so a render between the store changing and the query
resolving draws nothing rather than the previous route's stops under the new
route's name.

Route stops are mapped to `StopWithDistance` against the anchor rather than
widening `StopMarker` and `labelledStopIds` to take a bare `Stop`. It touches two
fewer files and the distance is real — it is what the card shows when one of
those stops is tapped.

**The store leaks between tests, and that is the price of it surviving a tab
change.** `MapScreen.test.tsx` calls `leaveRouteMode()` in `beforeEach`; without
it, one test entering route mode makes every later test render the route's pins.

**Tests:** `entering route mode survives a remount`; `leaving clears it`;
`flipping moves to the other direction and back`; `a route result draws the route
instead of leaving the map`; `the route's stops are the pins`; `the sheet lists
the route's stops in order`; `the X leaves route mode`; `panning does not leave
route mode`; `the route band is as tall as the nearby band`.

---

## Task 4 — The route's line, then **device round 1**

**Files:** create `features/map/RouteLine.tsx`; modify `features/map/MapScreen.tsx`.
Tests: `features/map/__tests__/MapScreen.test.tsx`.

**Contract:**

```
RouteLine({ points: Coords[] })   // always mounted; a MapView child
```

**The Polyline is always mounted and never conditionally rendered.** Route mode
changes its `coordinates`, never its presence — an empty array when there is
nothing to draw. Mounting and unmounting a child inside a `react-native-maps`
component is the rule the map section of `docs/backlog.md` exists for, and it is
the same operation that put two markers in the screen's top-left corner. This is
the labels' `opacity` trick applied to a line.

**Settled:** the line is the **representative** shape for the current direction —
`RouteDirection.shapeId` from Task 1, then `shapeById`. A direction with no shape
draws nothing rather than falling back to joining the stops up.

**Then push, and run device round 1.** This is the first build in which the pin
set is swapped wholesale and a line is drawn, and both are the churn seam. Ask
Truman for: the line following real roads, the direction control reading
unmistakably, the X, tab-switch-and-return, and any crash. Screenshots to
`~/wheredabus-screenshots/<date>/`; **transcribe findings into a log the moment
they arrive** — images do not survive a compaction and text does.

**What was built.** As specified. `RouteLine` is `memo`ised and takes only its
points; the colour is `palette.pin`, so the line and the stops on it read as one
thing. The `Polyline` double in `MapScreen.test.tsx` reports its coordinate
**count as text** — a double that rendered nothing for an empty line could not
distinguish "always mounted with no points" from "not mounted", which is the one
property these tests exist to hold.

**Tests:** `draws the representative shape for the current direction`; `flipping
direction draws the other shape`; `the line is empty rather than absent outside
route mode`; `a direction with no shape draws no line`.

---

## Task 5 — The fleet endpoint

**Files:** create `data/thebus/vehicles.ts`,
`data/thebus/__tests__/fixtures/vehicles.xml`; modify `data/thebus/types.ts`,
`client.ts`, `cache.ts`, `parse.ts`, `index.ts`. Tests:
`data/thebus/__tests__/vehicles.test.ts`, and `client.test.ts`, `parse.test.ts`.

**Contract:**

```
// types.ts
export type ApiFailure = /* the existing four kinds, renamed */
export type ArrivalsFailure = ApiFailure        // alias, so nothing else churns
export type Vehicle = {
  readonly number: string          // <number>, the fleet number — this is what is displayed
  readonly tripId: string | null   // <trip>, joins to Arrival.tripId
  readonly route: string | null    // <route_short_name>; the literal "null" reads as null
  readonly position: Coords        // required — a bus with no position is not a bus on a map
  readonly headsign: string | null
  readonly adherence: number | null   // minutes; POSITIVE MEANS EARLY; unbounded
  readonly lastMessage: Date
}
export type Fleet = { readonly serverTime: Date; readonly vehicles: readonly Vehicle[] }
export type FleetResult = { ok: true; fleet: Fleet } | { ok: false; failure: ApiFailure }
Arrival gains `shape: string | null`            // the variant this bus is running

// vehicles.ts
parseVehicles(xml: string): FleetResult

// client.ts
TheBusClient gains vehicles(options?: { signal?: AbortSignal }): Promise<FleetResult>
  // GET /vehicle/?key=… with no other parameter — `route=` does not filter
```

**`<driver>` is an employee number and there is no field for it.** Dropping it at
the parse boundary means the model cannot express it, so no screen can render it
and no log can print it. It sits directly beside `<number>` in the XML.

**Settled:** hand-rolled parser, no dependency — the document is flat and Expo
Go's ceiling makes every package a real cost. `isKeyRejection` is exported from
`parse.ts` and reused rather than copied, so the two known rejection wordings live
in one place. **No content-type check**: `parseVehicles` returns `malformed`
unless it finds a `<vehicles>` or `<errorMessage>` element, which classifies a
404 HTML page without trusting a header. `withCache` passes `vehicles` straight
through — its entries are keyed by stop code and mean nothing here.

**The fixture is built from the vendor sample in `docs/api/README.md:262`**, not
captured — a live call needs Truman's AppID, which is in his keychain. It must
contain: a live bus, a bus whose `route_short_name` is the literal `"null"`, a
stale bus with plausible Oahu coordinates, and a `<driver>` element.

**What was built.** As contracted. `parseVehicles` collects each `<vehicle>`
block's leaf elements into a **map in one pass** rather than running a regex per
field — the body is 333 KB and the document is flat, so one scan answers
everything. It decodes XML entities, because headsigns are free text off a
destination sign and `KAPOLEI &amp; MAKAKILO` is real. Self-closing `<trip/>`
reads as no trip.

`withCache` delegates with an arrow rather than `inner.vehicles.bind(inner)`:
binding reads the property at construction, and the cache's own test doubles are
partial clients that have no `vehicles` until one is called.

**Tests:** `reads a vehicle's fleet number and position`; `never carries a
driver`; `a route_short_name of "null" reads as no route`; `an unreadable vehicle
does not sink the fleet`; `a rejected key is unauthorized, not an api error`; `an
HTML error page is malformed`; `an arrival carries the shape its bus is running`.

---

## Task 6 — The live bus layer, then **device round 2**

**Files:** create `features/map/useVehicles.ts`, `features/map/BusMarker.tsx`;
modify `features/map/MapScreen.tsx`. Tests:
`features/map/__tests__/useVehicles.test.ts`, `BusMarker.test.tsx`.

**Contract:**

```
export const FRESH_MS = 5 * 60_000
export const VEHICLE_POLL_MS = 60_000
export const AGE_TICK_MS = 30_000

export type BusOnMap = { readonly vehicle: Vehicle; readonly ageMs: number }
useVehicles(client: TheBusClient, route: string | null): {
  buses: BusOnMap[]            // fresh only, filtered to `route`; empty when route is null
  failure: ApiFailure | null
  fetchedAt: Date | null
}
busLabel(bus: BusOnMap): string          // "252 · here 20 s ago"
```

**Settled:** every live bus on the route, not the one bus behind an arrival — 23
of 25 sampled arrivals carry the `"0"` position sentinel. **A 5-minute freshness
window, applied as one rule in both directions**: a bus is drawn while its last
report is fresh and leaves the map when it stops being fresh. 232 of 235 live
buses reported within five minutes and the next-freshest was over ten hours old,
so this is nearly judgement-free. **A failed fetch needs no special case** — the
ages keep growing and the buses age off on their own. **Do not reintroduce the
separate outage timer** that was proposed and dropped. Poll at 60 s, matching
`features/arrivals/useArrivals.ts:28`; pause and refetch on `AppState` the way
that hook does. No request at all when route mode is off.

**`ageMs = (now − fetchedAt) + (serverTime − lastMessage)`** — two same-clock
differences, so device skew cancels. `serverClockOffset` in
`features/arrivals/format.ts:72` is the existing statement of this idea.

**The age is recomputed on `AGE_TICK_MS`, never per second.** iOS re-snapshots a
custom marker view whenever it changes, and a label ticking once a second
re-snapshots every bus on screen once a second — the documented way to make a map
with custom markers unusable (`features/map/StopMarker.tsx:70`). One tick drives
both the label and the freshness filter, so a bus going stale between polls still
ages off. `BusMarker` is `memo`ised on its label string, so a bus whose text did
not change costs nothing.

**`BusMarker` copies `StopMarker`'s rules exactly and they are non-negotiable:**
the label is **always mounted** and hidden with `opacity`, it is
`position: 'absolute'` so it sits outside the marker's frame, there is **no
`zIndex`**, and `tracksViewChanges` pulses false after the snapshot.

**Then push, and run device round 2** — the churn round. This is the layer the
spec names as the risk to plan around.

**Tests:** `drops a bus whose last report is older than five minutes`; `keeps a
bus reporting within five minutes`; `a bus ages off between polls`; `a failed
fetch keeps the buses and lets them age`; `only buses on the route are drawn`; `a
bus with no route is left off`; `asks for nothing when route mode is off`; `the
label reads the fleet number and the age`.

---

## Task 7 — Tapping an arrival highlights its bus

**Files:** modify `features/map/StopCard.tsx`, `features/arrivals/ArrivalRow.tsx`,
`features/map/MapScreen.tsx`, `features/map/BusMarker.tsx`. Tests:
`features/map/__tests__/StopCard.test.tsx`, `MapScreen.test.tsx`.

**Contract:** `ArrivalRow` gains optional `onPress` and `selected`; `StopCard`
gains optional `onSelectArrival`. **Only the map passes them**, so `/stop/[code]`
is unchanged. `MapScreen` holds the selected arrival's `tripId` and `shape`; the
`BusOnMap` whose `vehicle.tripId` matches renders highlighted, and `RouteLine`
draws that arrival's named variant in place of the representative.

**Settled:** the join is on trip id. **How often it lands is unknowable from
here** — it needs a live call with Truman's AppID. Build it to light up when the
join succeeds and **promise no hit rate**. The variant line is tied to the
selected *arrival* rather than to a successful join, because `shape` is present on
every arrival while a position is present on one in ten; that reading of "the bus
view draws the named variant" goes to Truman on the device round.

**Tests:** `highlights the bus whose trip matches the arrival`; `an arrival with
no bus on the map highlights nothing`; `draws the variant the arrival names`;
`clearing the selection restores the representative line`; `the arrivals screen
is unchanged by all of this`.

---

## Closing the increment

`npm test`, `npm run test:scripts`, `npm run typecheck`, and **`npm ci`** — the
last because it is the only thing that catches a lockfile peer conflict and is
not run by default.

Then a review pass over the whole diff at the increment boundary — that is where
the cross-cutting findings live — and `docs/backlog.md` takes whatever is not
worth fixing now, including **where `adherence` gets shown**, which is parsed and
carried but deliberately unrendered.

Merging to `main` needs Truman's explicit permission.
