# Increment 7 — plan

Spec: `docs/superpowers/specs/2026-08-09-increment-7-peek-and-search.md`.

**Contracts, not code.** Files touched, exported signatures, test names, and
decisions already settled.

**Order matters.** Tasks 1–3 rebuild the sheet's geometry and must land first;
every later task renders inside it. Task 4 is independent and can go any time.
Tasks 5–9 are sequential.

Run after each task: `npm test`, `npm run typecheck`. Task 4 also needs
`npm run test:scripts`. Before the increment closes, `npm ci` as well.

**Screenshots go to Truman at the ends of Tasks 3, 7 and 9** — the peek, the
Stops tab, and the map search. Anything about appearance is inference until he
confirms it.

---

## Task 1 — The detents become points

**Files:** `features/map/StopSheet.tsx`, `features/map/MapScreen.tsx`,
`app/(tabs)/index.tsx`, `features/map/__tests__/StopSheet.test.tsx`,
`features/map/__tests__/MapScreen.test.tsx`, `__tests__/App.test.tsx`.

**Contract:**

```
detentsFor(containerHeight, tabBarOverlap, topInset): readonly [number, number, number]
tabBarOverlapOf(containerHeight, windowHeight, tabBarHeight): number
visibleAbove(detents: readonly number[], index: number, containerHeight: number): number
MapScreenProps: { client, tabBarHeight: number }
StopSheetProps: { …, detents: readonly number[], tabBarOverlap: number }
```

**`containerHeight` is measured, not the window.** `MapScreen` reads its own
root view's height with `onLayout`. The tab scene is inset above the bar, so the
window is 83 pt too tall — which broke the peek and the tallest detent at once.
See the spec.

`DETENTS` stops being a module constant. `PEEK_DETENT` / `MEDIUM_DETENT` /
`FULL_DETENT` stay as indices. `visibleAbove` no longer parses strings.

**Settled:** the peek is `tabBarHeight + handle` — **revised on the device round
from `tabBarHeight + handle + card-header budget` (~210 pt), which Truman judged
to take too much map for what it showed.** The resting sheet now shows nothing
but its grab handle; what it *should* show is deferred to a later increment. The
other two stay `0.45 × h` and `0.9 × h`.
`useBottomTabBarHeight()` is read in `app/(tabs)/index.tsx` and passed down,
because it is a React context that **throws** outside a navigator and would
break `MapScreen`'s tests.

**Watch:** seven call sites feed the old fraction into `region.ts` — `frameOn`,
`panTo`, `searchHere`, `mapPadding`, the drift check, the label projection, and
`region.test.ts`. `region.ts` itself does not change; it already takes a
fraction.

**Tests:** `derives a peek that is the grab handle and nothing else`; `derives
the same fraction from points that the percentages used to give`; `a taller tab
bar raises the peek by the same amount`; existing `region.test.ts` unchanged.

---

## Task 2 — Sheet content clears the tab bar

**Files:** `features/map/StopSheet.tsx`, `features/map/StopCard.tsx`,
`features/map/__tests__/StopSheet.test.tsx`.

The tab bar is drawn **over** the sheet, not clipping it, so content renders
underneath it with nothing reserving space. This is the actual fix for "the stop
code's spacing to the bottom bar is really tight and awkward".

**Contract:** the sheet's bottom edge clears `tabBarHeight`. **Revised on the
device round**: the clearance is carried by the required legend, now *pinned* at
that edge for both modes rather than living at the foot of each one's scroll —
Truman noticed the sheet was the app's one surface where it scrolled away.
Everything above the legend is clear by construction, so the scroll hosts keep
only their own 32 pt of breathing room. `lib/Attribution.tsx` records why the
objection that kept the sheet an exception died with the tall peek.

**Tests:** `pins the legend clear of the tab bar`; `pins the legend under the
nearby list rather than at the foot of it`; `pins the same legend under the
card`.

---

## Task 3 — Row taps centre the map on the stop

**Files:** `features/map/MapScreen.tsx`,
`features/map/__tests__/MapScreen.test.tsx`.

**Contract:** `select(stop, { pan }: { pan: boolean })`. The sheet's `onSelect`
passes `pan: true`; `onPinPress` passes `pan: false`. Panning calls
`centredOn(camera, stop, visibleAbove(detents, MEDIUM_DETENT))` — the detent the
sheet is *heading to*, and `animateToRegion`, so the zoom is untouched.

**Settled:** pin taps do not pan (Truman's call, made against the argument that
a pin tapped low on screen ends up behind the risen sheet — **look for that on
the device round**). `select` stays one function so pin and row taps cannot
drift apart in *what* they select. The sheet still only rises from below medium.

**Tests:** `centres the map on a stop chosen from the list`; `does not move the
camera when a pin is tapped`; `centres against the medium detent, not the one
the sheet is leaving`.

**Then: first screenshot round — the peek, both modes.**

---

## Task 4 — Routes are searchable

**Files:** `data/gtfs/sql.ts`, `data/gtfs/db.ts`,
`data/gtfs/__tests__/sql.test.mjs`.

**Contract:**

```
SEARCH_ROUTES   // matches short_name or long_name, case-insensitive, LIMIT ?
searchRoutes(query: string): Promise<RouteSummary[]>
```

**Settled:** 118 routes, so a `LIKE` scan — **no FTS table, no
`SCHEMA_VERSION` bump, no republished generation.** Match on `short_name` and
`long_name`; **never on `route_id`**, which lies: `route_id: '13'` is route
`14`, `route_id: '25'` is route `32`. Exact `short_name` matches sort first.

**Tests:** `finds a route by its number`; `finds a route by its name`; `prefers
an exact number match over a substring`; `does not match a route by its
route_id`; `an empty query returns nothing`.

---

## Task 5 — One search engine

**Files:** `features/search/useSearch.ts`,
`features/search/__tests__/useSearch.test.tsx`.

**Contract:**

```
type SearchFilter = 'address' | 'stops' | 'routes'
type SearchResult =
  | { kind: 'stop'; stop: Stop }
  | { kind: 'route'; route: RouteSummary }
type SearchState =
  | { state: 'off' }
  | { state: 'running'; results: SearchResult[] }
  | { state: 'done'; results: SearchResult[] }
  | { state: 'failed' }
useSearch(query: string, filter: SearchFilter): {
  state: SearchState
  /** Local match counts, computed regardless of filter, for the nudge. */
  otherMatches: { stops: number; routes: number }
}
```

Stops mode runs `searchByCode` then `searchByName`; Routes mode runs
`searchRoutes`; Address mode runs neither and reports `off` until a submit
(Task 9). `otherMatches` always runs, because the local queries are free and are
what makes a wrong filter recoverable.

**Settled:** debounced on the same shape `StopsScreen` already uses — see the
real-timer caveat on the existing debounce test in `docs/backlog.md`.

**Tests:** `finds a stop by its code`; `finds a stop by name`; `finds a route`;
`reports stop matches while the address filter is selected`; `reports nothing
for an empty query`; `a failed query is not an empty result`.

---

## Task 6 — Filter chips and a result list

**Files:** `features/search/FilterChips.tsx`, `features/search/ResultList.tsx`,
`features/search/RouteRow.tsx`, `features/search/__tests__/`.

**Contract:**

```
FilterChips({ filters: SearchFilter[], selected, onSelect })
ResultList({ state, otherMatches, onSelectStop, onSelectRoute, onSwitchFilter })
```

`ResultList` renders the nudge itself — *"5 stops and 1 route match — switch to
Stops"* / *"No stops match — search as an address"* — because it is the only
component that sees both the empty result and the other counts.

**Settled:** chip styling is provisional. `RouteRow` shows `short_name` and
`long_name`; it does **not** show `route_id`.

**Tests:** `offers only the filters it is given`; `shows a nudge when the
selected filter found nothing and another would have`; `switching filter from
the nudge reports the new filter`; `a route row shows the number a rider sees on
the bus`.

---

## Task 7 — The Stops tab gains a Routes filter

**Files:** `features/stops/StopsScreen.tsx`,
`features/stops/__tests__/StopsScreen.test.tsx`.

**Contract:** chips `Stops | Routes` above the existing field, defaulting to
`Stops`. Existing behaviour is unchanged in Stops mode, favorites included. A
route result opens `/route/[id]`.

**Settled:** no Address filter here. The favorites list and its notice stay as
they are; searching still replaces the list rather than adding to it.

**Tests:** `defaults to searching stops`; `finds a route once the Routes filter
is chosen`; `opens the route screen from a route result`; the existing search
and favorites tests must pass unchanged.

**Then: screenshot round — the Stops tab.**

---

## Task 8 — The map's search bar and fullscreen search

**Files:** `features/map/MapScreen.tsx`, `features/map/SearchBar.tsx`,
`features/map/SearchOverlay.tsx`, `features/map/__tests__/`.

**Contract:** a persistent bar at the map's top reading a **plain
placeholder** — it never names the anchor, decided 2026-08-09. Tapping it opens
a fullscreen search with chips `Address | Stops | Routes`, defaulting to
`Address`. A stop result closes the search, calls `setAnchor(stop)`, frames the
camera and selects it — the rider stays on the map. A route result opens
`/route/[id]`.

**Settled:** ⌖ and the *Search this area* pill move down to clear the bar;
placement is provisional. This reopens Increment 6's deferral of persistent
chrome at the map's edges — Truman reopened it knowingly on 2026-08-09.

**Watch:** the overlay must be a **sibling** of `MapView`, never a child.
Mounting anything inside a `react-native-maps` component is the rule behind the
SIGABRT — see the map section of `docs/backlog.md`.

**Tests:** `opens the search from the bar`; `a stop result anchors the map and
selects it`; `a stop result does not leave the map`; `closing the search leaves
the camera where it was`.

---

## Task 9 — Address mode

**Files:** `features/map/SearchOverlay.tsx`, `features/map/MapScreen.tsx`,
`features/map/__tests__/`.

**Contract:** on submit, `findOnOahu(query, Location.geocodeAsync)` →
`reverseGeocodeAsync` the hit → a confirmation reading **"Did you mean 2500
Campus Rd, Honolulu?"** with Go / Cancel. Go anchors and frames the map, the
same path a long-press *Search here* takes. Cancel returns to the field with the
text intact.

**Settled:** `data/geocode/oahu.ts` is already built and tested and is what runs
here. **Its two-attempt steer must not be simplified** — `, HI` rescues
`"university"` from Pennsylvania and `"beach"` from *Montana*, and *breaks*
`"ala moana beach"`, which returns zero results with it appended. The three
failures stay apart: `offIsland` ("that address is real, and it is not on this
island"), `none`, `failed`. Autocomplete is out, re-verified 2026-08-09 against
the installed types.

**Watch:** a failed `reverseGeocodeAsync` must not lose a good geocode —
confirm against the typed text in that case rather than refusing to move.

**Tests:** `confirms before moving the map`; `anchors the map once confirmed`;
`cancelling leaves the map alone`; `an address off the island says so`; `a
failed lookup is not "no such address"`; `confirms with the typed text when the
reverse lookup fails`.

**Then: screenshot round — the map search, all three filters.**

---

## Closing the increment

`npm test`, `npm run test:scripts`, `npm run typecheck`, and **`npm ci`** — the
last because it is the only thing that catches a lockfile peer conflict and is
not run by default.

Then a device round via `gh workflow run ios-ipa.yml --ref dev`, a review pass
over the whole diff at the increment boundary, and `docs/backlog.md` takes
whatever is not worth fixing now. Merging to `main` needs Truman's explicit
permission.
