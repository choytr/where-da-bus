# Increment 7 — the sheet at rest, and finding things

Grilled 2026-08-09. Everything below was settled in that conversation; the
reasoning is recorded so it is not re-argued, and the rejected alternatives are
kept because two of them look obviously right until you see the measurement.

## What this is

**Two halves that share one screen.** The map's bottom sheet is rebuilt so its
collapsed state says something, and a search is built that reaches everything
the app knows — stops, routes, and addresses.

They are one increment because the second lands on the first: the map's new
search bar and the sheet's new height both change what `visibleAbove()` means,
and building them apart means writing the camera framing twice.

## What this is not

**Routes on the map is Increment 8**, and it now has a shape. A route result
should eventually draw that route's stops as the map's pins, with polylines
under them; the one-bus-behind-a-single-arrival view belongs there too, because
`Arrival` already carries `tripId`, `vehicle` and `position` and needs no XML
parser. All three mount children inside `MapView`, which is the code path with
a SIGABRT history — see the map section of `docs/backlog.md`. They get their
own device rounds rather than riding along on a search increment.

**A fleet-wide vehicle layer stays deferred**, unchanged: `vehicle/` with no
parameters returns ~1,184 vehicles as 333 KB of XML.

---

## The peek

Rebuilt across four device rounds. **What shipped is the settled answer; the
intermediate heights are in the commit history and are not worth re-deriving.**

### The one thing that must not be re-assumed

The sheet's container is **whatever view it is mounted in**, and React
Navigation's tab scene is inset above the tab bar — 83 pt shorter than the
window on Truman's phone. An earlier draft of this spec asserted the opposite
(*"the tab bar does not clip the sheet; it is drawn over it"*), and building on
it broke both ends at once: the peek showed a tab bar's worth of stops it meant
to hide, and a snap point of 90% × *window* landed 7 pt from the top of an
813 pt container, under the status bar. Two symptoms, one wrong inference.

`MapScreen` measures its own root with `onLayout` and derives everything from
that, including how much of it the bar covers (`tabBarOverlapOf`), so nothing
has to be right about the navigator. **The fifth time on this project that
reasoning about native behaviour instead of measuring produced a confident wrong
answer.**

### What the peek shows

**The grab handle, one band, and one row** — `PEEK_BAND` naming the mode,
`PEEK_ROW` showing something under it. Both modes fill the band to exactly the
same height, or the resting sheet changes height the moment a stop is selected
and reads as a twitch. The list shows *Nearby Stops* over its nearest stop; the
card shows **‹ Nearby · ★** over `BoardHeader`.

The tallest detent is 90% of the container **or** as tall as it can be while
clearing the safe area, whichever is shorter — the cap makes the notch
unreachable by construction. The middle detent is tuned by eye
(`MEDIUM_FRACTION`); `docs/backlog.md` used to argue against raising it and
Truman overruled that on a device.

### The legend is pinned in the sheet too

The sheet was the app's one surface where the required legend scrolled away with
the content. It is now pinned as a sibling of whichever mode is showing, like
every other surface — **except at the peek**, which presents no Data and so owes
no legend. That exception is not a dodge: a fixed-height block in a flex column
does not shrink, so rendering it at a peek too short to hold it takes the space
from the list and collapses it to nothing.

`@gorhom/bottom-sheet`'s own `footerComponent` was tried and rejected: it clamps
the footer into view with `Math.max(0, …)` so it can never leave the sheet,
which at a short peek pins the legend directly under the handle.

### Headings, reinstated

They were Truman's opening proposal, withdrawn during the grilling, and asked
for again once he saw a peek without one: *"having just the top tab thing
visible is horrendous."* His call both times. The withdrawal assumed a peek tall
enough to show a `StopRow` or the card's header, where a heading would name what
the content already said; at one band there is no such content.

**`PEEK_BAND` lives in `features/map/peek.ts`, alone.** `StopSheet` renders
`StopCard`, so a constant exported from one and imported by the other is a
cycle — and its victim would be a `StyleSheet.create` evaluated at module scope
with `undefined` for a height.

The question underneath a heading — *why these stops?* — was considered for the
search bar and rejected there; see below.

### `BoardHeader`'s type is not shrunk

Truman's instinct was to make the stop name smaller. Aimed at the right place,
wrong file: `BoardHeader` is shared with `/stop/[code]`, which has a whole
screen and no crowding to solve. The peek pays for itself in height instead.

## Selecting a stop moves the map

**Tapping a row in the sheet centres the map on that stop**, in the middle of
the part a rider can actually see. `centredOn()` already does exactly this and
is tested; what changes is that selection calls it.

**Against the detent the sheet is heading to**, `MEDIUM_DETENT`, not the one it
is leaving. Selection raises the sheet, so panning against the peek fraction
would drop the stop below where the sheet is about to be.

**Pin taps do not pan.** Truman's call, made against the argument that a pin
tapped low on screen ends up behind the risen sheet — the same reason row taps
need it. **Accepted consequence, to be looked for on the device round rather
than pre-empted with logic.** `select()` stays one function so pin and row taps
cannot drift apart in *what* they select; the row path passes a flag for the
camera.

**The sheet still only rises from below medium.** Increment 6 found on a device
that snapping unconditionally while reading the list at full height yanked the
row out from under the thumb that had just touched it.

---

## Search

### Filters, not inference

Three chips — **Address / Stops / Routes** — one selected at a time. Truman's
proposal, and it replaced a "be smart about what they typed" design that the
data refutes:

- **All 3,830 stop codes are numeric**, and **73 route numbers are also valid
  stop codes** — 5, 6, 7, 8, 14, 40, 41, 44, 53, 88, 91, 401… Typing `40` means
  Route 40 (Honolulu–Makaha) *and* stop 40, both real. No classifier resolves
  that from two characters. Non-numeric tokens (`1L`, `C`, `PH1`, `A LINE`,
  `W2`) are unambiguous, but that is the minority case.
- **An address heuristic would be worse than none.** The obvious rule — a street
  suffix, or a number followed by a word — refuses `ala moana`, `beach` and
  `university`, which are precisely the three the 2026-08-08 device probe proved
  *work*.

A ranked merged list was also rejected: the ranking would be a tuned heuristic
with no device to tune it on, which is how `MAX_LABELS = 6` got into the
codebase.

### Cross-mode nudges

A filter is only survivable if picking the wrong one is not a dead end. The
local queries cost nothing, so they run regardless of the selected filter and
report only a count:

- Address mode, typing `ala moana` → *"5 stops and 1 route match — switch to
  Stops"*, live, before a submit.
- Stops mode, `2500 campus rd` matching nothing → *"No stops match — search as
  an address"*.

One tap either way. In Address mode this also fills a screen that would
otherwise be empty while waiting for a submit.

### The two hosts

**Stops tab** — the existing field gains filters: **Stops** (default) and
**Routes**. No Address. Results act as they do today: a stop opens the arrivals
board, a route opens `/route/[id]`.

**Map** — a **persistent bar at the top**, opening a **fullscreen search**,
defaulting to **Address**.

This reopens Increment 6's deferral of "new persistent chrome at the map's
edges" into the vehicle increment. Truman reopened it deliberately, having been
shown the conflict. ⌖ and the *Search this area* pill move down to make room;
their placement is provisional until a device round.

A ⌕ button instead of a bar, and folding address search into the Stops tab,
were both offered and rejected.

**A stop result on the map anchors the map there, frames the camera and selects
it** — the card opens at 45%, and the rider stays on the map. That is the only
thing a map search does that the Stops tab cannot, and therefore the only reason
it exists. A route result opens `/route/[id]`, deferred to Increment 8's
"show route on map".

### The bar reads a plain placeholder

Naming the current anchor — *"Near you"*, *"2500 Campus Rd"*, *"Dropped pin"* —
was offered as the honest home for the "why these stops?" question the headings
idea was reaching for. **Rejected**: it costs a reverse-geocode per long-press
anchor and a set of invented labels, for a line nobody asked for. The bar says
what it does and nothing else.

### Routes are searchable, and the ids lie

`route_id: '13'` has `short_name: '14'`; `route_id: '25'` is route **32**.
**Search matches `short_name` and `long_name`; navigation uses `route_id`.**
Matching on the id would hand a rider the wrong bus.

**118 routes, so a `LIKE` scan — no FTS table, no `SCHEMA_VERSION` bump, no
republished generation.** This was the one place the increment could have grown
a data-migration tail, and it does not.

### Address mode

Geocode on submit → `reverseGeocodeAsync` the result → **"Did you mean 2500
Campus Rd, Honolulu?"** with Go / Cancel → Go anchors and frames the map, the
same path a long-press *Search here* takes.

`data/geocode/oahu.ts` is already built and tested and is what runs here. Its
two-attempt steer is not to be simplified: `, HI` rescues `"university"` from
Pennsylvania and `"beach"` from *Montana*, and *breaks* `"ala moana beach"`,
which returns zero results with it appended.

The three failures stay apart, as §4 requires — `offIsland` ("that address is
real, and it is not on this island"), `none`, and `failed`.

### Autocomplete, re-verified and still out

Re-checked 2026-08-09 against the installed type definitions, not the docs:

```
geocodeAsync(address: string): Promise<LocationGeocodedLocation[]>
LocationGeocodedLocation = { latitude, longitude, altitude?, accuracy? }
```

**Nothing printable comes back** — no street, no name, no city. Those fields are
on `LocationGeocodedAddress`, which only `reverseGeocodeAsync` returns, and that
needs coordinates you must already have. So a suggestion list costs **two round
trips per keystroke to render one row** (the probe saw exactly one result in
seven queries), and `CLGeocoder` throttles per app — a fast typist would break
the submit path for the whole session.

Real multi-suggestion autocomplete needs `MKLocalSearchCompleter` (a native
module, leaving the Expo Go loop) or a web geocoder (a second key, a second
terms-of-use). Both are architecture decisions, not features.

Truman briefly parked address search entirely over this, then reinstated it with
"let's just try the *Did you mean* thing first." **Address mode is in.**

---

## Stated assumptions

- The sheet is settled and device-confirmed. **The map search bar's placement
  against ⌖ and *Search this area*, and chip styling, are still provisional**
  and go to Truman with screenshots.
- Everything about how this *looks* is inference until he confirms it on a
  device. There is no simulator here.

## Decided in implementation, recorded so it is not re-opened

Not design decisions, and not Truman's to make — see the memory note of
2026-08-09.

- **The detents are points, not percentage strings.** `detentsFor` is the one
  place their arithmetic lives, and it takes a *measured* container height — see
  the peek section for what assuming the window instead cost.
- **The tab bar height comes from `useBottomTabBarHeight()`**, read in
  `app/(tabs)/index.tsx` and passed down like `client`, because it is a React
  context that **throws** outside a navigator. `@react-navigation/bottom-tabs`
  is a direct dependency for it, declared at expo-router's own range.
- **One query engine, two hosts.** `useSearch`. The hosts differ in which
  filters they offer and what a result does, not in how they search.
- **The numeric short-circuit in the Stops tab is gone.** 431 of the feed's
  3,830 stop names contain a digit, so routing a numeric query to the exact code
  lookup alone made them unfindable by the number in their name. Code first,
  then names.
