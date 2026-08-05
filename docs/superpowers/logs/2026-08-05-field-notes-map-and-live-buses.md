# Field notes — map selection, live buses, search sections

**Source:** a chat session on 2026-08-05, from Truman using the app in the
field. Notes, not a plan. They are reconciled here against the code and against
`docs/api/README.md`, and each item is marked with where it lands.

**Most of this is Increment 7.** Increment 6's spec deferred live vehicles
deliberately and cut route polylines entirely; that decision stands. Four items
touch Increment 6 and are called out below. The rest is the seed for the next
grilling, so it is written down rather than re-derived from a chat log.

---

## Where each item lands

| # | Item | Lands |
|---|---|---|
| 1 | Shared map selection payload | Increment 7 — first, it unblocks 2/6/7 |
| 2 | Live bus position from an arrival | Increment 7 |
| 3 | Bus detail sheet on row tap | Increment 7 |
| 4 | "Track this bus" / "I'm on this bus" | Increment 7, partially |
| 5 | Sectioned search (routes + stops) | Independent — **needs a placement call** |
| 6 | Route page → whole route on the map | Increment 7; depends on 1 **and on Increment 6's Task 3** |
| 7 | Nearby list → map selected state | Increment 7, falls out of 1 |
| 8 | Arrivals route filter | Independent — **needs a placement call** |
| 9 | Crash repro | **Increment 6** — recorded in `docs/backlog.md` |

---

## What Increment 6 changes because of these notes

**The spec's "live vehicles need an XML parser" is right about the wrong
thing.** That claim is about a *fleet-wide* layer, which does need
`/vehicle/`'s XML. Showing the bus behind *one arrival on one board* needs
neither a parser nor a second request — see #2. The spec has been corrected in
place; live vehicles stay deferred either way, but for a smaller reason than it
gave.

**The crash has a suspected repro**, which is most of the fight. It is in the
backlog now. Task 2 — narrowing `DatabaseGate` — is what stops the next
occurrence being reported to the user as "reinstall the app", and it is what
keeps the next one diagnosable. That was already Task 2's second-listed
justification; this makes it the first.

**Task 3 is a prerequisite for #6**, which nobody planned. Drawing an entire
route's stops on the map reads `route_stops`, and 18 of 236 directional
patterns currently skip a stop the route genuinely serves. Building #6 before
Task 3 ships would draw routes with holes in them.

---

## 1. One selection payload, one update-map function

**Settled in the notes:** all map features go through a single payload and a
single update function. The payload models **a collection of stops with an
optional focused member**, because single-stop selection is a special case of
that and the reverse is not true. Get it right before the callers exist.

**What the code actually holds today**, because the retrofit is not where it
looks:

- `MapScreen.tsx:121` — `selectedStop: StopWithDistance | null`. That is the
  focus half, and it generalises easily.
- `useAnchoredStops.ts` — the *set* half, and it is the part that resists.
  There is one anchor, the stops are whatever the SQL finds within
  `NEARBY_RADIUS_METERS` of it, and the camera region is derived from the same
  point. The file's own header calls the anchor "the whole design" and says the
  absence of pan and zoom handlers is deliberate.

So the real change is not adding a focus field. It is that **"which stops are
on the map" stops being a function of one coordinate.** A route's stops are a
set with no anchor and no radius; the camera has to frame a polyline-shaped
bounding box rather than a circle. `regionAround` in `region.ts` takes a point
and a radius and would need a sibling that takes a list of points.

Nothing above argues against the note — it argues that the payload is the small
half and the anchor generalisation is the large one, so a plan that budgets for
"add a field" will be wrong.

## 2. Live bus position, from the arrival already on screen

**Verified against `data/thebus/types.ts` — the note is correct.** `Arrival`
carries `tripId`, `vehicle: string | null` (null where the vendor sent `"???"`)
and `position: Coords | null` (null unless there is a real GPS fix; never the
`"0"`/`"0"` Gulf-of-Guinea sentinel). No join, no second endpoint, no XML.

**Re-match on `tripId`, not `vehicle`** — correct and buildable today, `tripId`
is on the type.

**The population is ~3%, and this is the thing to design around.** Per
`docs/backlog.md` and `docs/api/README.md`, `vehicle === "???"` co-occurs with
`estimated !== "1"` in 1,228 of 1,269 sampled arrivals. So `position !== null`
on roughly **one row in thirty**. The tap affordance is dark on almost every
row, and the bus-detail sheet's *common* case is the null one. The notes call
that a footnote; the numbers make it the primary state.

**Pause polling when unfocused or backgrounded** — right, and there is a
mechanism for it. Use `schedule`/`repeat` from `lib/schedule.ts`; the timer
handle must not escape a closure, and `CLAUDE.md` says why. `ArrivalsScreen`
already drives an `AppState` transition, and the test-side trap is written down
in `CLAUDE.md` — drive those through an async `act`.

**Polylines were cut from Increment 6 and stay cut.** The note has the bus
rendering on a polyline of its route and shares that asset with #6. Nothing in
the GTFS asset carries shapes today: `scripts/build-gtfs` emits stops, routes,
`stop_routes` and `route_stops`, and `shapes.txt` is not read. A polyline is a
new table, a schema bump and a republished generation — not a free share.
Drawing the bus without one is the smaller first version.

## 3. Bus detail sheet

**The row is free** — verified, `features/arrivals/ArrivalRow.tsx` has no press
handler and the only `Pressable` on that screen is the refresh control.

Row tap over a kebab, and a sheet over a screen, both accepted as stated. The
sheet is the later home of "track this bus", so there is one entry point rather
than two.

The tradeoff the notes accept — the route badge inside the row stops being
independently tappable — is real and worth restating at build time, because
`StopRow`'s badges *are* tappable and the two rows will then behave differently.

## 4. "Track this bus", and one open question closed

**The open question is answered: yes, and it costs an XML parser.**
`https://api.thebus.org/vehicle/?key=<AppID>&num=<vehicle_num>` returns 200
`text/xml` with `latitude`, `longitude`, `adherence`, `last_message`,
`route_short_name` and `headsign`. `vehicleJSON` 404s — there is no JSON form.
Verified live 2026-08-02; full findings in `docs/api/README.md`.

Three constraints that come with it:

- **`<driver>` is an employee number.** It is in that XML. It must never be
  displayed, logged or persisted — `CLAUDE.md`, from the vendor documentation.
- **`last_message` filtering is mandatory.** The fleet response carries ~929
  stale vehicles with plausible Oahu coordinates that plot as buses sitting on
  real streets. Unlike the `"0"`/`"0"` sentinel, they do not look wrong.
- **It only helps for a bus that has a number.** `num=` needs `vehicle`
  non-null, which is the same ~3% population as #2.

So the boarding problem the notes describe — the arrival drops out of the
boarding stop's response exactly when tracking starts to matter — is solvable
by the vehicle endpoint rather than only by polling a stop further down the
route. Still low priority; "track this bus *from a stop*" is the part that
works with the current shape and is worth building first, as the notes say.

## 5. Sectioned search — routes and stops

Independent of everything else here. `SectionList` is the native answer.

**Cap each section with "show more" rather than collapsing** — accepted as
stated. If collapse is wanted later: reset to expanded on a new query, persist
collapse state only within a query.

Worth knowing before this is built: five alternate stop names are missing from
the FTS index (`docs/backlog.md`, Data quality), so searching `radford` already
returns 6 stops instead of 8. Sections will not change that and should not be
blamed for it.

## 6. Route page → map

An individual stop on the map, and an entire route with all its stops.

**Ship it plain.** `react-native-maps` renders a few hundred markers sluggishly,
not brokenly. Clustering and zoom-gated visibility are a later concern.

Depends on #1, and on Increment 6's Task 3 — see above.

## 7. Nearby list → map selected state

Tapping a stop in the Nearby list puts that stop's marker into its selected
state. `MapScreen.tsx:476` already colours the selected pin with
`palette.live`; what is missing is that the list and the map do not share the
selection. Smallest item here, and it falls out of #1 for free.

## 8. Arrivals route filter

Self-contained, no dependencies.

**Note the map-edge deferral does not apply.** Increment 6 defers new
persistent chrome at the *map's* edges, because a vehicle layer will want that
space. The arrivals board is a different surface and is not covered by that.

## 9. The crash

**Narrowed with moderate confidence to the tap-hold *Search here*
interaction** (`MapScreen.tsx:462`, `onLongPress`). Recorded in
`docs/backlog.md` with the conditions; exact repro steps still want writing
down the next time it fires.

---

## Open questions, for the next grilling

Three left. The fourth — a vehicle-position endpoint queryable by vehicle
number — is answered above.

- **Lost signal.** A tracked bus drops out of the feed mid-trip: stale marker,
  marker disappears, or an explicit "lost signal" state. Pick one and the
  polling loop writes itself. This project's rule that two different facts must
  never render alike points hard at the third option.
- **Marker movement.** Jump to each new fix, or ease between the last two.
  DaBus's smoothness was probably easing.
- **Route filter persistence.** Per-stop, or reset on navigation.
