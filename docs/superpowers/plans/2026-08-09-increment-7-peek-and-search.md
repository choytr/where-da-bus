# Increment 7 — plan

Spec: `docs/superpowers/specs/2026-08-09-increment-7-peek-and-search.md`.

**Contracts, not code.** Files touched, exported signatures, test names, and
decisions already settled.

**All nine tasks are done.** What remains is the close-out below: a screenshot
round with Truman, a device round, and a review over the whole diff.

Run after each task: `npm test`, `npm run typecheck`. Task 4 also needs
`npm run test:scripts`. Before the increment closes, `npm ci` as well.

**Screenshots go to Truman at the end of Task 9** — the map search, all three
filters. The peek and the Stops tab are already confirmed. Anything about
appearance is inference until he says otherwise.

---

## Tasks 1–3 — the sheet — **DONE, and device-confirmed**

Detents in points from a **measured** container; sheet content clear of the tab
bar; row taps centre the map, pin taps do not. Four device rounds reshaped the
peek along the way and the spec records only where it landed. `MEDIUM_FRACTION`
and `PEEK_BAND` / `PEEK_ROW` are the tuning knobs.

**The trap, if you touch this again:** `detentsFor` takes the height `MapScreen`
measured with `onLayout`, never `useWindowDimensions()`. The tab scene is inset
above the tab bar and computing against the window breaks the peek and the
tallest detent at the same time.

---

## Task 4 — Routes are searchable — **DONE**

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

## Task 5 — One search engine — **DONE**

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

## Task 6 — Filter chips and a result list — **DONE**

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

## Task 7 — The Stops tab gains a Routes filter — **DONE**

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

---

## Task 8 — The map's search bar and fullscreen search — **DONE**

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
the camera where it was`. Two more were added on the way: `opens the route
screen by route_id, from a row showing neither`, and `carries the required
attribution over the search results` — the overlay presents stop and route
names and so owes the legend, pinned under its list like every other surface.

**Two things settled while building it.** `frameOn` gained the same `against`
parameter `panTo` has, because a searched stop raises the sheet and framing
against the peek it is leaving would put the stop under where the sheet is
about to be. And the selected stop is `{ ...stop, meters: 0 }`: the anchor
*is* the stop, so zero is what the nearby query is about to say too.

`MapScreen.test.tsx`'s `useStopQueries` double had to become one held object —
it minted fresh `jest.fn`s per call, and `useSearch` keys its debounce effect on
those identities, so the debounce restarted on every render and no search ever
resolved.

---

## Task 9 — Address mode — **DONE**

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

**Settled while building it.** The lookup and its labelling went into
`features/map/address.ts` — `lookUpAddress` and `addressLabel`, both with their
network calls injected the way `findOnOahu`'s is, so `features/map/__tests__/address.test.ts`
exercises the whole state machine without the native module. `SearchOverlay` is
the one place that imports `expo-location`.

The label is built from `streetNumber`, `street`/`name` and `city`.
`formattedAddress` looks like the obvious source and is documented **Android
only**, so it is `null` on the platform this ships to.

**Go frames, it does not pan** — see the spec, which said otherwise and has been
corrected. `searchFrom` for the anchor, `frameOn` for the camera.

**Then: screenshot round — the map search, all three filters.** There is no
simulator here, so this one is Truman's to run in Expo Go; everything about how
it *looks* is inference until then.

---

## Closing the increment

`npm test`, `npm run test:scripts`, `npm run typecheck`, and **`npm ci`** — the
last because it is the only thing that catches a lockfile peer conflict and is
not run by default.

Then a device round via `gh workflow run ios-ipa.yml --ref dev`, a review pass
over the whole diff at the increment boundary, and `docs/backlog.md` takes
whatever is not worth fixing now. Merging to `main` needs Truman's explicit
permission.
