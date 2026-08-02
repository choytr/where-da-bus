# Increment 3 — the map, tabs, and theme

**Status:** specified 2026-08-02, not started.
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

**Pins and rows are the same set by construction**, which is what makes
selection well defined. An earlier design paired a viewport pin set against a
user-anchored list, where a pin the user panned to had no row to select.

**Selection.** Tapping a pin or a row does the same thing: the list scrolls to
that row, the row expands in place, and the sheet rises to its medium detent.
The sheet is one list in two states, not two modes — the selected row expands
among its neighbours rather than replacing them, so the second tap is
discoverable because the row visibly became larger.

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
overturns the standing advice not to add an XML parser. The rush-hour live count
is still unmeasured and should be taken before committing to the feature.
