# Increment 9 — device rounds

Three rounds: two on **2026-08-10** and one on **2026-08-21**. Kept in one
file because they are one conversation about one increment.

## Round 1 — 2026-08-10, ~02:00 HST

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


---

## Round 2, ~03:14 HST — two more on the arrows

**Two shots, pasted into the conversation and never saved to disk** — so unlike
round 1 there is no file to go back to, and this transcription is the only
record. Both are Route 10 in dark mode over Liliha / Nuuanu at 3:14. The first
is north-up; the second has the map rotated, with MapKit's compass showing `N`
off-vertical and its needle to the upper right.

What they show: in the north-up shot the arrowheads correctly follow the line —
one points down-left along Liliha St toward Kuakini, another down-right along
Nuuanu Ave — so the per-segment bearing is right. In the rotated shot the line
has turned under them and the arrowheads have not, leaving several pointing
across the road rather than along it. The arrowheads are solid black triangles
in both.

> Bottom bar icons look fantastic now.
>
> The arrows are rotated correctly only when the user is facing north. Rotating
> at all doesn't rotate the arrows. Also they look weird just black.

**Tab icons: closed.** Ionicons, filled when selected.

**The arrows were screen-aligned.** Rotating the *child view* fixed the
per-segment bearing — the first shot shows arrowheads correctly following the
line down Liliha St — but a marker's view does not turn with the map: MapKit
rotates the map underneath the annotations and leaves them upright. So the
bearing was right in *compass* terms and wrong on *screen* the moment the rider
turned the map.

Fixed by subtracting the map's heading, which turns a compass bearing into a
screen angle. `Region` carries no heading, so it comes from `getCamera()` on
each settle — one native round trip at the cadence the labeller already runs
at, with a `catch` that leaves the arrows at their last angle, because a
heading that cannot be read is not a reason to take the map down.

**Confirmed in round 3, and the answer is yes:** `onRegionChangeComplete` does
fire for a gesture that only rotates. The original worry, kept for the
reasoning: If it does not, the arrows
will lag a rotation until the next pan. There is no other hook — `onRegionChange`
is per-frame — so this is the design either way; what is unknown is how often
it is briefly wrong.

**And they were black.** `palette.background` in dark mode is near-black, so the
arrowheads read as holes punched in the line. The thing an arrowhead is seen
against is the **line**, not the map, and the line is a saturated red in both
themes — so the arrow is now a plain white constant. Third colour attempt:
route red vanished into the line, background made a hole, white is what every
transit map draws on a coloured route.

---

## Round 3 — 2026-08-21, in Expo Go

Eleven days after rounds 1 and 2. **No screenshots**; this is the whole record.
Truman was on Expo Go, not the `.ipa`, so everything on `dev` was live.

What he confirmed working: the arrows stay put while panning and keep their
rotation through a rotate gesture, snapping when he lets go; the popup's stop
line is reachable and does something; a map tap deselects the bus; the new
*Search this area* behaviour; the pill sizes; the tab icons.

**That the arrows snap on release answers an open question**: the rotate-only
gesture *does* fire `onRegionChangeComplete`, so the heading is never stale for
longer than the gesture. Nothing more to do there.

What he asked for, and what was done:

- **The popup should name the bus's *next* stop, not the one it is covering.**
  Built as `features/map/nextStop.ts`. It gives up the covered-pin guarantee
  from `651bb07` — a pin under a dot is again only reachable by nudging the
  map — which he asked for explicitly.
- **Tapping an arrival row did nothing.** `/stop/[code]` is pushed onto the
  *root* stack over the tab bar, so `navigate('/')` changed the tab underneath
  a screen still covering it. `showOnMap` dismisses first now.
- **"It looks like it's using different data than the live bus on the map."**
  It is not: both read the fleet endpoint. The map only starts fetching when
  route mode opens, so there is a request's delay before the dot appears, and
  the band says *"Looking for buses…"* through it. Not a defect; recorded
  because it will look like one again.
- **The sheet takes too weak a swipe.** `SHEET_DRAG_THRESHOLD` in
  `StopSheet.tsx`; `activeOffsetY` is the only knob the library exposes.

**And two crashes, eight minutes apart** — see `docs/backlog.md`, which carries
the analysis. The important half: one was the familiar route-view X, the other
was *panning after waking the phone*, which presses nothing. **Ask whether a
route was showing** before theorising.

**Truman's standing instruction from this round:** *"UI/UX stuff should be best
left to me to tweak, so I'll just have you do everything else. Just get stuff
working well and reliably and I'll tweak it to my preferences when I have the
time."* The tuning knobs left named for him: `SHEET_DRAG_THRESHOLD`,
`ARROW_SPACING_METERS`, `PAN_SCREENS_FOR_OFFER`.
