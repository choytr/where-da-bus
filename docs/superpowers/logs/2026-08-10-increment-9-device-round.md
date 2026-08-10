# Increment 9 — device round, 2026-08-10, ~02:00 HST

Two screenshots, `~/wheredabus-device/screenshots/2026-08-10/IMG_4668.png` and
`IMG_4669.png`, transcribed here because **images do not survive a context
compaction and text does**. Both are route mode on Route 10, dark theme, at
street scale over Kalihi / Liliha.

Truman's verdict, verbatim:

> - The arrows look... decent. Not the most readable. They also don't work,
>   they're all pointing straight up regardless of rotation or route direction.
> - The pill looks great! Nice touch on the red line legend.
> - The long press stuff works and is so helpful.
> - The tab icons... need... work... lol

## What the shots show

**The pill.** `— Route 10 ✕`, centered under the search bar, red dash at the
left. Reads cleanly against both the map and the search bar above it. No
change.

**The arrows.** Small solid triangles sitting *on* the red line, four or five
visible per screen, and every single one points due north. In `IMG_4669` the
line runs diagonally down-right through Liliha St and the arrowheads still
point up. They are also drawn in `palette.route` — the same red as the line —
so at a glance they read as bumps in the stroke rather than as arrowheads.

**The tab bar.** `◎` renders as a thin oversized ring; `≡` as three lines; `⚙`
renders as a **full-colour emoji gear**, because iOS resolves that codepoint to
its emoji presentation. The three do not read as one set.

**Route mode itself** is working: pins are the route's stops, the line follows
the road, the band reads `Toward AUIKI ST + OPP MOKAU…  ·  No buses running`,
and the sheet lists the stops in sequence.

## What was wrong, and why

**`Marker`'s `rotation` prop is `@platform iOS: Google Maps only`.** Documented
in `node_modules/react-native-maps/lib/MapMarker.d.ts:195`, read after the fact.
This is the **third** prop in this family to be Google-only on iOS —
`tappable` and `zoomTapEnabled` are the other two, both already in
`docs/backlog.md`. The rule that follows: **read the `@platform` line before
using any `react-native-maps` prop here.**

Fixed by rotating the *child view* with a `transform`, which is captured into
the annotation's bitmap, rather than asking MapKit to rotate the annotation.
Also swapped the `▲` glyph for a borders triangle — an exact shape at an exact
size, rotating about its own center, instead of a font whose metrics differ per
platform — and coloured it `palette.background` so it reads as a notch cut out
of the line rather than as more line.

**The tab glyphs were the wrong tool.** Text is right for a one-off control —
⌖, ✕, ⌕, ★ all work — and wrong for a set of three that has to look like a
family. `@expo/vector-icons` turned out not to be a new dependency at all: it
ships with `expo`, was already in the lockfile at the version installed
(15.1.1), and Expo Go bundles it. npm had simply nested it where `app/` could
not resolve it. `npx expo install` hoisted it; `npm ci` verified clean.

## No live buses to look at, and that is not a bug

Truman could find none at 02:00. Measured from the dev machine against the live
fleet endpoint, 12:18 UTC / 02:18 HST:

- **1,184 vehicles in the fleet; 32 reporting within 15 minutes.**
- **0 of those 32 carry a route.** Every one reports
  `route_short_name: "null"`, `headsign: "null"` and `trip: "null_trip"` —
  they are deadheads and pull-ins, not buses in service.

So `useVehicles`' `sameRoute` drops all of them and route mode's bus layer is
empty *by construction* at this hour. The band's "No buses running" is telling
the truth.

The arrivals endpoint disagrees, and it is worth knowing why: two arrivals
across the twenty busiest stops were `estimated="1"`, both **bus 261 on Route
2** toward `KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN` — due at stop **45**
(S Beretania St + Punchbowl St) at 2:26 AM and stop **53** (Liliha St + N King
St) at 2:37 AM. The arrivals feed knows that bus is running Route 2; the fleet
feed, for the same bus at the same moment, says `route_short_name: "null"`.

**The consequence for Increment 9**, recorded in `docs/backlog.md`: *Show live
bus on map* is offered for such an arrival — `hasReportingBus` reads the
`Arrival`, which says live and names bus 261 — and the map then draws the route
and opens the card but cannot draw the bus, because the fleet feed will not
attribute it. Daytime is the normal case (the API README measures 218 of 235
fresh vehicles carrying a real route at 11:43 HST), so this is a night-time
artefact rather than a broken feature.

**The live-bus feedback is therefore still owed**, in daylight: the popup, the
lateness wording, the direction filter and the covered-stop hand-down have none
of them been seen working.
