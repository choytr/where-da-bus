# Increment 9 — plan

Spec: `docs/superpowers/specs/2026-08-09-increment-9-show-on-map.md`.

**Contracts, not code.** Files touched, exported signatures, test names, and
decisions already settled.

Run after each task: `npm test`, `npm run typecheck`. Task 1 also needs
`npm run test:scripts`. Before the increment closes, `npm ci` as well.

**Push at a task boundary, never mid-task.** Every push to `dev` runs the Tests
workflow, and Truman has asked twice for fewer.

**Two device rounds, and neither is at the end.** After **Task 4**, when buses
first change what they draw and a new always-mounted marker pool first appears
inside `MapView`; and after **Task 6**, when the whole spine is reachable. Both
are the seam at `docs/backlog.md`'s *"Never mount, unmount or reorder a child"*
entry, whose SIGABRT **is open** — it returned on the Increment 8 `.ipa`.
`gh workflow run ios-ipa.yml --ref dev`.

---

## Task 1 — `route_directions` in the asset, `SCHEMA_VERSION` 2 → 3

**Files:** modify `scripts/build-gtfs/derive.mjs`, `emit.mjs`,
`data/gtfs/sql.ts`, `data/gtfs/db.ts`; rebuild and commit `assets/db/gtfs.db`.
Tests: existing `derive.test.mjs`, `emit.test.mjs`,
`data/gtfs/__tests__/sql.test.mjs`.

**Contract:**

```
// scripts/build-gtfs/derive.mjs
deriveRouteDirections(tripsRows): { route_id, direction_id, headsign }[]
  // distinct triples; 333 rows on the 2026-06-29 feed

// data/gtfs/sql.ts
SCHEMA_VERSION = 3
CREATE TABLE route_directions (route_id, direction_id, headsign,
                               PRIMARY KEY (route_id, direction_id, headsign))
DIRECTION_HEADSIGNS   // (route_id) -> direction_id, headsign
FLOOR gains `routeDirections: 300`; FLOOR_COUNTS and TableCounts gain it

// data/gtfs/db.ts
RouteDirection gains `headsigns: string[]`   // routeStops fills it; no new hook
```

**Settled:** the headsign join is **exact string equality** against GTFS
`trip_headsign` — verified byte-identical to the live feed's `headsign`. A
direction has **many** headsigns (Route 2's direction `1` has five), so this is
many-to-one; a single equality test is wrong. `route_directions` joining
`FLOOR_COUNTS` is what makes a stale published database fail **structurally** in
`files.ts` rather than only by filename — that is the point of adding it, not
housekeeping.

**Also in this task, and easy to forget:** retire the "leave old generations up
forever" rule from `CLAUDE.md` and
`docs/superpowers/specs/2026-08-03-increment-5-self-refreshing-data.md`, and
note the rebuilt-floor exception to *"do not run `npm run build:gtfs` and commit
the result"*. Before merge, `gh workflow run gtfs-data.yml` with `force` so a v3
generation exists.

---

## Task 2 — Hide the other direction's buses

**Files:** modify `features/map/useVehicles.ts`, `features/map/MapScreen.tsx`.
Tests: `features/map/__tests__/useVehicles.test.ts`.

**Contract:**

```
useVehicles(client, route: string | null, headsigns: readonly string[] | null)
  // headsigns null  -> no direction filter (today's behaviour)
  // headsigns given -> keep a bus when its headsign is one of them
  // a bus whose headsign matches nothing is KEPT, not dropped
```

**Settled:** an unrecognised headsign **shows the bus**. That is what keeps the
twelve ambiguous routes — 123, 14, 444, 51, 52, 521, 53, 535, 54, 6, 7, 8 — at
today's behaviour rather than emptying them, and it is what makes a stale
`route_directions` degrade gracefully. 4.00% of trips island-wide are
ambiguous; the other 96% attribute cleanly.

**Tests:** `drops a bus running the other direction`; `keeps a bus whose
headsign is unknown`; `filters nothing when no headsigns are supplied`.

---

## Task 3 — The bus label expands when selected

**Files:** modify `features/map/BusMarker.tsx`, `features/map/labels.ts`,
`features/map/MapScreen.tsx`; create `features/map/busDetail.ts`. Tests:
`features/map/__tests__/BusMarker.test.tsx`,
`features/map/__tests__/labels.test.ts`, `busDetail.test.ts`.

**Contract:**

```
// features/map/busDetail.ts
latenessWords(adherence: number | null): string
  // POSITIVE MEANS EARLY. Nothing bounds it to ±60.
  // null -> "Not reporting"; on-time band -> "On time"
busLabel(bus): string                 // now the fleet number ALONE
busDetailLines(bus): readonly string[]   // [fleet, lateness, age]

// features/map/BusMarker.tsx
BusMarkerProps gains `selected: boolean`, `stopUnder: Stop | null`,
  `onPressStopUnder: (stop: Stop) => void`
```

**Settled:** the collapsed label sheds the age down to the fleet number; the age
moves into the popup. **No headsign anywhere** — the sheet header already names
route and direction. The popup is the accepted fix for lateness being
communicated by ring colour alone.

**The selected bus keeps its label at any zoom**, overriding `scaleOf`'s
route-scale silencing — one bus only. `labels.ts`'s collision map must learn
that one label has a variable height and **wins ties**.

**Do not unmount anything to do this.** The label is already always mounted and
hidden with `opacity`; keep it that way.

**Tests:** `shows only the fleet number when unselected`; `adds lateness and age
when selected`; `says early rather than late for a positive adherence`; `keeps
the selected bus's label at route scale`.

---

## Task 4 — The tap conflict, and the arrows — DEVICE ROUND AFTER THIS

**Files:** modify `features/map/MapScreen.tsx`, `features/map/BusMarker.tsx`;
create `features/map/arrows.ts`, `features/map/RouteArrows.tsx`. Tests:
`features/map/__tests__/arrows.test.ts`,
`features/map/__tests__/MapScreen.test.tsx`.

**Contract:**

```
// features/map/arrows.ts
arrowPlacements(line: readonly Coords[], visible: Region, count: number)
  : readonly { at: Coords; bearingDeg: number }[]
  // always returns exactly `count` entries; off-line ones carry opacity 0

// features/map/RouteArrows.tsx
ARROW_COUNT = 8            // constant for the life of the map
```

**Settled — the bus wins the tap and hands the stop down.** `onBusPress`
currently gives the tap away entirely to `stopUnderBus` (`651bb07`, confirmed on
a device); that behaviour must survive. Selecting the bus now wins, and when a
stop is underneath **the popup gains a tappable line naming it**. Nothing
becomes unreachable and no covered pin has to be hit.

**Settled — a fixed pool, always mounted.** Eight arrow markers exist for the
life of the map, redistributed along the *visible* stretch of the line and
rotated to follow it; opacity zero outside route mode. **Never one marker per
segment** — that is a wholesale swap on every direction flip, into the seam
with the open SIGABRT. `MapPolylineProps` has no arrow support; this was
checked, not assumed.

**Tests:** `selects the bus rather than the stop underneath it`; `offers the
covered stop in the popup`; `returns a constant number of arrows at every
zoom`; `points along the line`.

---

## Task 5 — The route pill

**Files:** modify `features/map/MapScreen.tsx`, `features/map/SearchBar.tsx`;
create `features/map/RoutePill.tsx`. Tests:
`features/map/__tests__/RoutePill.test.tsx`.

**Contract:**

```
RoutePill({ routeName, onClose }): renders under the search bar; null when
  route mode is off
```

**Settled:** **no attribution work.** A pill presents OTS data on the map and
the peek renders no legend — raised, and ruled on by Truman twice, on the
grounds that the sheet carries the legend for the same data and that the peek
already shows a route name and a stop row without one. *"That's honestly fine."*
Do not reopen this as a compliance finding.

---

## Task 6 — Long-press menus and show-on-map — DEVICE ROUND AFTER THIS

**Files:** create `lib/rowMenu.ts`; modify `features/stops/StopRow.tsx`,
`features/arrivals/ArrivalRow.tsx`, `features/search/RouteRow.tsx`,
`features/map/RouteList.tsx`, `features/map/MapScreen.tsx`,
`app/(tabs)/index.tsx`. Tests: `lib/__tests__/rowMenu.test.ts` plus one
per row component.

**Contract:**

```
// lib/rowMenu.ts — ActionSheetIOS from React Native core. No native module.
showRowMenu(actions: readonly RowAction[]): Promise<void>
type RowAction = { label: string; run: () => void }
```

| Row | Actions |
|---|---|
| `StopRow` | Show stop on map · Add/remove favorite |
| `ArrivalRow` | Show live bus on map *(only with a reporting bus)* · Show route on map |
| `RouteRow` | Show route on map |
| `RouteList` row | Open arrivals · Add/remove favorite |

**Settled:** show-on-map **switches to the Map tab**, confirmed explicitly — not
a push onto the current stack. The map's own stop card omits *show stop on map*.
**No discoverability affordance, by decision** — long-press is a discovered
affordance and that is not an oversight to fix later.

**"Show live bus on map" is absent, not disabled, when the arrival has no
reporting bus.** Decidable locally from the `Arrival`'s own `vehicle` and
`estimate`; no request. **Re-measure how often it is available** — the project
says ~96% of arrivals are schedule-only, `MapScreen` says the trip join works
for one in ten, and those disagree.

**Most of this is routing.** `MapScreen` already holds `selectedArrival` and
`highlightedBus` and does the `tripId` join, the larger dot, the fleet number at
any zoom and the trip's own shape. What is missing is arriving in that state
from another screen.

---

## Task 7 — The small wins

**Files:** modify `app/(tabs)/_layout.tsx`, `features/arrivals/BoardHeader.tsx`,
`features/arrivals/ArrivalsScreen.tsx`, `features/search/useSearch.ts`. Tests:
`features/arrivals/__tests__/ArrivalsScreen.test.tsx`,
`features/search/__tests__/useSearch.test.ts`.

- **Tab icons.** `tabBarIcon` on all three tabs; `@expo/vector-icons` is already
  installed via `expo` and in the lockfile — do **not** add a dependency.
- **The arrivals screen gains the card's meta block:** route chips **always**,
  distance **when location is available** and absent otherwise, matching
  `StopCard`'s `meters === null ? null` shape. Costs the screen a
  `routesForStops` query it does not currently make.
- **The search filter reset:** distinguish a filter change from a query change
  in `useSearch`'s effect and reset to `NO_RESULTS` on the former. The
  carry-forward exists so a *keystroke* never blanks the list under a thumb,
  which an explicit filter change is not.

**Tests:** `shows route chips for the stop`; `omits distance when location is
unavailable`; `clears results when the filter changes`.

---

## Closing the increment

- Whole-diff review, once, at the boundary — that is where the cross-cutting
  findings live. `docs/backlog.md` takes everything not worth fixing now.
- `npm ci`, not just `npm test`.
- `gh workflow run gtfs-data.yml` with `force`, and confirm a v3 generation and
  `manifest-v3.json` exist **before** merging.
- Update `docs/handoff.md` and `docs/backlog.md`.
- Merging `dev` into `main` needs Truman's explicit permission, every time.
