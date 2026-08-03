# Increment 3 — the map, tabs, and theme

**Status:** built 2026-08-02, device-verified from an `.ipa`, then revised —
see **Revision** below, which is also built and is **not** device-verified yet.
**Supersedes** the Increment 3 row of the roadmap in
`2026-07-29-wheredabus-design.md`, which bundled the map with route polylines
and live vehicle positions. Those move out; see *Deferred* below.

## What this increment is

A map of nearby stops, a three-tab structure to hold it, and the theme control
that the tab structure makes possible. It deliberately excludes everything that
needs new data in the bundled asset or a new parser.

The map is the increment's whole risk. `react-native-maps@1.20.1` is bundled in
Expo Go SDK 54, so it costs nothing from the fast loop — but no screen in this
app has ever rendered one, and nothing else should depend on it until a device
has shown it working.

## The tabs

`app/(tabs)/` holds three: **Map**, **Stops**, **Settings**. `/stop/[code]` and
`/route/[id]` stay at the *root* and push over the tab bar, so each is defined
once rather than living in two tab stacks.

Today's `HomeScreen` splits across two of them. Nearby goes to the map sheet;
search and favorites go to the Stops tab.

## Map tab

**Stops are anchored to a point, not to the viewport.** The anchor is the user's
location by default. Tapping the map moves it. A recentre button resets it. The
set is the existing nearby query — roughly 25 stops within 1.5 km — run once per
anchor change.

> **Superseded 2026-08-02** — *anchoring* stands and is not in question; the
> *gesture* does not. Tap no longer moves the anchor. See **Revision** below.

Nothing requeries on pan or zoom. That is the design's load-bearing decision and
it was reached by reversing an earlier one:

- Re-querying on drag settle means re-rendering up to 150 `<Marker>` components,
  which are real native views. The SQL is not the cost — a bounding-box query
  over `idx_stops_lat_lon` returns 480 rows in **0.5 ms**. Marker churn is.
- A list that reshuffles continuously while the user drags is unpleasant even
  when it is fast, and no optimisation fixes that.
- Anchoring removes the zoom-floor mechanism entirely. With ~25 pins there is no
  density threshold to manage; a viewport query would have put 954 stops on
  screen at city zoom in Honolulu.

Tap-to-search is also a capability the app does not otherwise have: checking
service near an unfamiliar destination *before leaving the house*. The
discontinued DaBus app did this and it is the reason the pattern was chosen.

Its nearby-stops map is at `docs/reference/dabus2-screenshots.jpg`, and the
middle panel is worth looking at before drawing pins: that is the Mānoa campus
at close zoom, and the stop icons already overlap into an unreadable mass. It is
the clearest argument available for an anchored ~25 rather than everything in
view. `docs/reference/README.md` reads the rest of it, including where this
design deliberately departs — DaBus2 used four tabs and no bottom sheet.

**Pins and rows are the same set by construction**, which is what makes
selection well defined. An earlier design paired a viewport pin set against a
user-anchored list, where a pin the user panned to had no row to select.

**Selection.** Tapping a pin or a row does the same thing: the list scrolls to
that row, the row expands in place, and the sheet rises to its medium detent.
The sheet is one list in two states, not two modes — the selected row expands
among its neighbours rather than replacing them, so the second tap is
discoverable because the row visibly became larger.

> **Superseded 2026-08-02** — built as specified, driven on a device, and the
> prediction in the last clause is what failed: the row growing did not read as
> an invitation to tap it again. It is now two modes. See **Revision** below.

- Compact row: today's `StopRow`, unchanged. The per-row route list
  (`180 m · 2 · 13 · A`) is what lets a user choose between two stops 100 m
  apart, which is the decision being made while looking at a map.
  **Provisional** — revisit once it can be held.
- Expanded row: the same row plus the next 2–3 arrivals through `useArrivals`,
  which already owns the §4 loading / data-with-age / error model. Tapping an
  expanded row opens the full board.

Two consequences to handle: the map screen now polls, so a changed selection
must cancel the previous stop's fetch; and the expanded row must be a single tap
target so tapping an arrival line inside it does not do something else.

## Stops tab

A search field whose empty state is the user's favorites, replaced by results as
they type. A standalone search tab would open to a blank screen with a keyboard;
favorites-as-empty-state means nothing is ever dead.

This also keeps a text field out of the bottom sheet. A field inside a sheet over
a map raises the keyboard, which forces the sheet to a full detent, which fights
the sheet's own gestures. Apple Maps does it; it is not worth doing here on a
loop that iterates through Expo Go on a phone.

Row tap goes straight to the full arrivals screen — there is no map to pan.

## Settings tab

Theme: **light / dark / automatic**, persisted. Feed status from
`feedValidity.ts`. Attribution and disclaimer from `lib/legal.ts`.

The theme provider is **task 1**, before any screen work. `useColorScheme` only
ever reports the OS setting, so "automatic" is not expressible while seven files
call it independently and carry their own copy of the same hex. Adding a map
screen and three tab screens first would make that ten or more files.

## Stated assumptions

- **Location denied** — the anchor defaults to Honolulu and tap-to-search still
  works. Denial stays a supported state, not an error.
- **An anchor with no stops nearby** gets an explicit empty state, distinct from
  a failure.
- **Theme preference** lives in AsyncStorage beside favorites.
- Radius and cap reuse the nearby query's 1.5 km / 25 rather than introducing a
  second set of numbers.

## Revision — 2026-08-02, after using it

Everything above was built, reviewed at the boundary, and driven on a physical
iPhone from a sideloaded `.ipa`. What follows replaces three of its decisions.
It is recorded here rather than in a new spec because the increment's *shape* —
anchored stops, one set behind both pins and rows, no viewport query — survived
contact with a device unchanged. Only the interactions on top of it did not.

Decided by Truman on 2026-08-02, in the session that also fixed the marker
propagation bug (`6e27094`) and capped the sheet below full height (`5822083`).

### The sheet is two modes

The list and a selected stop are no longer the same view. No selection shows
the nearby list; a selection **replaces** it with a detail card, with a back
control returning to the list. Apple Maps and Google Maps both work this way and
riders arrive already knowing it.

The card is **the full arrival board**, not a preview of one. This is the part
worth defending: the shipped design had *three* levels of stop detail — the
compact row, the three-arrival expansion, and `/stop/[code]` — and the middle
one is where the confusion lived. Two levels is the fix; adding an affordance to
the third was treating the symptom. So `ArrivalsScreen`'s body is extracted and
both hosts render it, and `ExpandedStopRow` goes away.

Pull-to-refresh is dropped **in the sheet only**. `@gorhom/bottom-sheet` ships an
Android-specific `RefreshControl` shim and no iOS equivalent, so on iOS the
pull gesture at scroll offset zero is the sheet's own. `useArrivals`' 60-second
poll is unaffected, and the standalone screen keeps its refresh.

### Tap does not move the anchor; long-press and a button do

Tap-to-search was chosen because DaBus did it and because checking service near
an unfamiliar destination is a real capability (see above, and it is still one).
On a device it fires constantly by accident, and every accident discards the
stop set and the selection together.

Replaced by two paths, both explicit:

- **"Search this area"**, appearing once the camera has drifted roughly a
  quarter of the visible width from the anchor, re-anchoring to screen centre.
  Discoverable without being taught, which long-press can never be.
- **Long-press**, dropping a temporary marker with a *Search here* callout.
  Nothing queries until the callout is tapped, so a stray long-press costs one
  dismissal rather than the whole view.

A plain tap now only dismisses the detail card, and does nothing otherwise.

### The camera moves in exactly two situations

On ⌖ recentre, and on the first location fix. Not on re-anchoring, not on
selection, not on a poll.

> **Amended 2026-08-03, after driving it** — **three** situations. Truman asked
> for *Search here* to centre the map on the point long-pressed, and that is now
> what it does. The reasoning is the one thing this section did not weigh: a
> long press *names* a point, and the point named is often near a screen edge or
> under the sheet, so answering without travelling to it puts the answer where
> the rider cannot see it. It **pans and does not reframe** — the first version
> rebuilt the window from the query radius and threw away a zoom the rider had
> set, which he caught on the device the same day. ⌖ and the first fix still
> reframe, because both are the map being *opened* on somewhere. **The rule
> below is otherwise intact and was re-confirmed**, including for *Search this
> area*, which names the area already on screen and therefore has nowhere to
> travel to. The rule is now stated rather than emerging from an
effect's dependency array, which is a change of mechanism as well as of
behaviour: `region` can no longer be the thing that drives the camera, because
the anchor moves in cases where the camera must not.

This costs the invariant `region.ts` was written for — that the camera frames
exactly the query radius, so map and list cannot disagree about "nearby". At
tight zoom after a *Search this area*, the map now shows a few pins while the
sheet lists up to 25. **Accepted deliberately:** a camera that moves under a
rider who did not ask was judged the worse failure of the two.

### Location is requested when the map is ready

`useLocation` still requests nothing on its own, and the Stops tab still asks
for nothing — but the map now calls `request()` from `onMapReady`, so the first
launch opens on the rider rather than on downtown Honolulu. The prompt is tied
to *opening the map*, which is a deliberate act, rather than to mounting a
component; it fires over a drawn map instead of a grey rectangle.

Two consequences follow and are part of this decision, not separate work:

- **Denial has to be recoverable.** iOS presents its dialog once per install, so
  after a refusal `requestForegroundPermissionsAsync` returns `denied` silently
  and ⌖ does nothing forever. It now opens Settings instead, and `'error'`
  retries. This closes the backlog's *"`location.status === 'error'` is
  terminal"*.
- **⌖ must take a fresh fix every time.** The hook cached one position for the
  app's lifetime, so recentring after a bus ride returned the rider to where
  they boarded — on a transit app, the exact moment the button exists for.

### Unchanged, and worth saying so

Peek stays a grab handle rather than becoming a one-stop view; the attribution
stays a scrolling list header. Selection still raises the sheet, but only from
*below* the medium detent — it never takes back height a rider asked for.

## Deferred, with findings banked

Recorded here so they are not re-derived. All measured 2026-08-02.

**On-device feed refresh → Increment 4.** Needed eventually and confirmed as
such; it has no dependency on the map, and the Settings tab now gives it a home.
`feed_end_date` is `20260822`, so the shipped asset needs a
`npm run build:gtfs` and a commit before then regardless.

**Route polylines → after that.** The budget question the design spec raised is
answered: `shapes.txt` is 9.8 MB of CSV but only because `shape_id` repeats on
every one of its 278,384 rows. All 532 shapes, Douglas–Peucker simplified at 5 m
and polyline-encoded, are **~200 KB** — sub-pixel at any zoom where a whole route
fits on screen. At 10 m it is 152 KB. Nothing needs to be dropped, and every
`shape_id` in `trips.txt` resolves. The spec's claim that a refresh path is
*required* before shapes ship does not survive scrutiny: route geometry is more
stable than the stop list already shipping from the same expiring feed.

**Live vehicle positions → after that.** See `docs/api/README.md` — the vehicle
endpoint answers with the entire fleet for a parameterless request, which
overturns the standing advice not to add an XML parser. The daytime live count
was taken on 2026-08-02 at 11:43 HST: **235 vehicles reporting within 15
minutes**, against 46 at 01:07 the night before. That is enough to draw a map
with, so the feature is worth building; a weekday peak, which will be higher
still, has not been measured and does not need to be before starting.
