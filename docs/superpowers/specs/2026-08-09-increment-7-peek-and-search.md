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

**Headings in the sheet are dropped**, having been Truman's own opening
proposal. See below — the height fix subsumes them.

---

## The peek

### The measurement this starts from

The collapsed sheet is `'14%'` in `DETENTS`. On Truman's device that is ~119 pt,
of which the tab bar takes ~83 (49 pt of bar over a 34 pt inset) and the grab
handle ~20 — **leaving on the order of 16 pt for content**. That one number is
behind three separately-reported complaints: the peek showing only legal text,
"it peeks but doesn't show any meaningful information", and "the stop code's
spacing to the bottom bar is really tight and awkward".

**~~The tab bar does not clip the sheet; it is drawn over it.~~** *Wrong, and
corrected 2026-08-09 by measurement.* This was inferred rather than measured,
and building on it broke both ends of the sheet: the peek showed a screenful of
stops it was meant to hide, and the tallest detent ran up under the status bar.

The sheet's container is **React Navigation's tab scene, which is inset above
the bar** — 83 pt shorter than the window on Truman's phone. A snap point of
90% × *window* inside that container lands 7 pt from the top; a peek of
`tabBar + handle` shows the whole `tabBar` worth of content above the bar. Two
symptoms, one cause.

`MapScreen` now measures its own root with `onLayout` and derives everything
from that, including how much of it the bar covers (`tabBarOverlapOf`). That is
correct under either arrangement, which is the point: it never has to be right
about React Navigation. **This is the fifth time on this project that reasoning
about native behaviour instead of measuring it produced a confident wrong
answer.**

### What the peek shows

**Nothing. The grab handle, clear of the tab bar, and that is all.**

*Revised 2026-08-09, on the device round after Tasks 1–3.* The peek was built
as specced below and Truman's verdict on ~211 pt was that it took too much map
for what it bought. His call: *"We can't get anything right, so can we just hide
the sheet's content by lowering it and only show the top draggable bit? I will
fine-tune what I want to show there in the future."*

A peek that shows *part* of something has to be right about which part, and
neither candidate was. A peek that shows nothing is honest about being a grab
handle, and the map gets the height back. **What belongs in a resting sheet is
deferred, deliberately, to a later increment with a device in hand.**

The superseded reasoning, kept because it is what the measurement supported
before the device disagreed with it: one full `StopRow` for the nearby list, but
sized off the *card* — `StopCard`'s top is a bar (‹ Back, ★) over `BoardHeader`
(name 20 pt, `Stop 596`, `Updated 30 s ago`), ~104 pt against the ~92 pt a
one-row peek would give — so that the selected-stop mode was not left cramped.
That arithmetic put it near 210 pt. It was right about the arithmetic and wrong
about the screen, which is exactly what a device round is for.

**Sheet content never renders under the tab bar.** This is the actual fix for
the crowding, and it holds at every detent, not just the peek. With the peek cut
back, the clearance is carried by the legend pinned at the sheet's bottom edge
rather than by each scroll host's padding — see below.

### The legend is pinned in the sheet too

*Added 2026-08-09, same round.* The sheet was the one surface where the required
legend scrolled away with the content, and Truman noticed. Every other surface
renders it as a sibling of its scroll view.

`lib/Attribution.tsx` recorded a real objection to pinning it here: the strip
would sit at the sheet's own bottom edge, which at the collapsed detent was
precisely the sliver the legend had just been evicted from. **That objection
dies with the tall peek.** A sheet showing only its handle presents no Data, so
it owes no legend, and the strip is simply behind the tab bar there. At every
detent that does show stops or arrivals the legend is pinned and visible, which
is the more prominent placement rather than the less.

It costs ~35 pt of the 45% detent, which the scroll-footer version did not.

### Headings, and why they are not built

Truman proposed "Nearby Stops" and "Selected Stop". Rejected during the
grilling, by him, once the two modes' top edges were put side by side: the list
renders a `StopRow` and the card renders a **‹ Back** control, and a back
control appears in exactly one of them. Once the peek is tall enough to show
either, a heading spends ~24 pt of map naming what the content already says.

The real question underneath — *why these stops?* — was considered for the
search bar instead and rejected there too; see below.

### `BoardHeader`'s type is not shrunk

Truman's instinct was to make the stop name smaller. Aimed at the right place,
wrong file: `BoardHeader` is shared with `/stop/[code]`, which has a whole
screen and no crowding to solve. The peek pays for itself in height instead.

### The 45% detent is untouched

`docs/backlog.md` records why: one and a half arrival rows is the intended
shape. This increment does not raise it.

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
that snapping unconditionally to 45% while reading the list at full height
yanked the row out from under the thumb that had just touched it. Truman's
"the sheet moves to 45%" is what happens from the peek, which is that case.

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

- ~~The ~210 pt peek~~ **settled on the device round: the peek is the handle
  alone.** The bar's placement against ⌖ and *Search this area*, and chip
  styling, remain **provisional** and go to Truman with screenshots.
- Everything about how this *looks* is inference until he confirms it on a
  device. There is no simulator here.

## Decided in implementation, recorded so it is not re-opened

Not design decisions, and not Truman's to make — see the memory note of
2026-08-09.

- **All three detents become points.** `detentsFor(windowHeight, tabBarHeight)`
  is the one place the peek's arithmetic lives, and `visibleAbove(detents,
  index)` becomes `1 − detents[index] / windowHeight`: no string parsing, still
  pure, still unit-testable. Encoding the peek back into a percentage string was
  rejected as a measurement stored in the wrong unit.
- **The tab bar height comes from `useBottomTabBarHeight()`**, read in
  `app/(tabs)/index.tsx` and passed down like `client`. It is a React context
  that **throws** outside a navigator, so calling it in `MapScreen` would break
  the screen's own tests; and it returns the real height including the inset,
  which retires the 49 + 34 guess about UIKit.
- **One query engine, two hosts.** The hosts differ in which filters they offer
  and what a result does, not in how they search.
