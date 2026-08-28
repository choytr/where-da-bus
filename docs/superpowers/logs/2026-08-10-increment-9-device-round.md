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
was *panning after waking the phone*, which presses nothing. **Whether a route
was showing then was asked the same day and could not be recalled** — recorded
as unknown, deliberately, rather than guessed. Do not re-ask it; capture both
halves at the moment of the next crash instead.

**Truman's standing instruction from this round:** *"UI/UX stuff should be best
left to me to tweak, so I'll just have you do everything else. Just get stuff
working well and reliably and I'll tweak it to my preferences when I have the
time."* The tuning knobs left named for him: `SHEET_DRAG_THRESHOLD`,
`ARROW_SPACING_METERS`, `PAN_SCREENS_FOR_OFFER`.

---

## Round 4 — 2026-08-21, in Expo Go

The three fixes from round 3, on a phone. **No screenshots**; this is the whole
record.

**What worked:** the popup's *next stop* ("works and is nice"), and the firmer
sheet swipe — `SHEET_DRAG_THRESHOLD` is his knob and he will tweak it himself.

**What did not, and it was one bug wearing two hats.**

> "There are arrival rows that say live bus but don't seem to correspond to any
> on the map when pressed." … "I really want to have the data of the map and the
> arrivals synced. My brain is telling me that those two should correspond, but
> there's like bus icons on the map that don't correspond to arrival rows with
> live buses."

**`enterRouteMode` opened every route at direction 0**, unconditionally, while
the map hides the other direction's buses by design (`drawsInDirection`, from
Increment 9). So a rider tapping a live arrival signed the other way got a map
that had deliberately hidden the very bus the row promised — and could not fix
it by tapping again, because the early return skipped a route already showing.
The counts disagreed for the same reason: the board lists both directions at a
stop, the map counted one direction island-wide.

The join needed nothing new. GTFS `route_directions` carries each direction's
headsigns and the live feed's headsign is byte-identical to them, so the request
now resolves a direction and opens in it (`features/map/direction.ts`).

**`hasDrawableBus` needed no direction term after all**, which is worth writing
down because the opposite was assumed while speccing. The gate checks that the
fleet carries the arrival's *trip*; the map opens the direction holding the
arrival's *headsign*; a vehicle on that trip carries that headsign. The
direction fix makes the existing gate correct rather than leaving it a second
hole.

**Three smaller things, all his calls:**

- **A tap on a live row now centers on the bus and opens its popup.** It only
  ever set `selectedArrival` — bigger dot, fleet number — while
  `selectedBusNumber`, which is what opens the popup, stayed null. Street zoom
  (`BUS_FRAME_METERS`, 500 m) rather than fitting bus and stop together: he was
  offered both and chose to go to the bus.
- **A fullscreen sheet now drops to medium when a stop is selected.**
  **This reverses a round-1/2 decision** — see the test, which asserted the
  opposite by name. The old reasoning was that dropping the sheet moves the row
  out from under the thumb; it does not, because selecting a stop replaces the
  whole list with that stop's card.
- **A row whose promised bus is not on the map says so** ("Bus 261 stopped
  reporting") instead of reading *Live · Bus 261* beside an empty map. Gated on
  the fleet having actually answered, so a fetch in flight never renders as a
  bus gone dark.

**Deferred, deliberately:** reconciling the *Live* badge against the fleet feed,
which would make roughly ten times as many rows read as tracked and over-claims
about the ETA being real-time. Truman chose to re-observe after the direction
fix first — the symptom may simply be gone.

**Not re-observed yet.** Nothing in this round has been on a phone.

### Round 4b — the screenshots, same evening

Two screenshots of KUHIO AVE + LEWERS ST with Route 2L drawn, which caught the
*"stopped reporting"* line being wrong twice over.

- **It named a bus on a route the map was not drawing.** The board there carries
  six routes; `useVehicles` holds buses for the one being drawn. Tapping the
  Route 2 row found no bus — none is fetched — and the row announced that bus
  260 had stopped reporting. Bus 260 was fine. Being confidently wrong is worse
  than the silence it replaced: the line exists to make the two views
  trustworthy, and a false claim spends exactly the trust it was added to earn.
- **It kept the live dot.** Colour and glyph followed `isLive`, which the vendor
  still reports as true, so a filled green ● sat beside words saying the bus was
  gone.

**And the deeper reason that row could not be answered: the map was showing a
different route.** Truman's call — *switch the map to that route* — so tapping
any row now redraws the map as that route, in that bus's direction, and centers
on the bus. That is what makes the two views correspond by construction: on a
six-route board, whatever row you tap is the route you end up looking at. Before
this, most rows on such a board did nothing a rider could see, which is the
thing that started the whole thread.

Still not re-observed on a phone.

