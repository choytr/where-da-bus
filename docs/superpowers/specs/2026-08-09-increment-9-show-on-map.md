# Increment 9 — show me that on the map

Grilled 2026-08-09, the evening the Increment 8 `.ipa` went on the phone.
**Every decision in *What a rider gets* and *The data* is Truman's and was
settled in that conversation.** The reasoning is recorded so it is not
re-argued, and the measurements are reproduced here because this file is their
permanent home.

## What this is

**The first polish increment.** Increments 1–8 built what the app is for;
everything on that roadmap is shipped and proven on a device. What remains is
making it pleasant, and that cannot be planned from a desk — so this increment
exists to give Truman *finished* things to react to while riding, rather than
half-built ones.

> "It'd be nice to have something to work with rather than incomplete features,
> because as I use it I'll be able to generate feedback on what was built
> instead of nonexistent things."

That constraint decided the shape. Four items in Truman's list were one idea
wearing four hats — *take me to this thing on the map* — and that is the spine.
The rest are small enough to finish alongside it.

## What this is not

**Not the SIGABRT chase.** The crash returned on the Increment 8 `.ipa` (two
aborts, `docs/backlog.md`), and it stays open by explicit decision:
*"let's just log it and not spend another evening tracking another stupid
crash."* Two pieces of this increment — the arrows and the direction filter —
land in route mode, which is that crash's code path. **The device round
therefore matters more than usual**, and is not optional.

**Not address autocomplete.** The only item in the dump needing a native module,
which would push address work onto the CI loop permanently while everything else
here iterates in Expo Go. Deferred until real use says it is worth that.

**Not a geometry fallback** for the twelve routes whose headsigns cannot
disambiguate direction. Measured and accepted — see *The data*.

**Not the versioning refactor.** Truman challenged the schema-versioning
ceremony as premature with one user, and the challenge was half right: see
*What versioning actually costs*.

---

## What a rider gets

### Long-press anything, get it on the map

**Every row in the app gains a long-press menu**, built on `ActionSheetIOS`
from React Native core — no native module, so the Expo Go loop survives.

| Row | Long-press offers |
|---|---|
| `StopRow` — Stops tab, favorites, search results | Show stop on map · Add/remove favorite |
| `ArrivalRow` — the board, and the map's stop card | Show live bus on map *(conditional, below)* · Show route on map |
| `RouteRow` — search results | Show route on map |
| `RouteList` row — the route's stops in the sheet | Open arrivals · Add/remove favorite |

**Show on map switches to the Map tab.** Confirmed explicitly; it is not a
push onto the current stack.

**The map's own stop card omits "show stop on map"** — you are already there.

**No discoverability work, and that is a decision.** Truman's position, recorded
so it is not re-argued as an oversight:

> "Long-press affordances don't have to be communicated. To me they're a
> discovered affordance — people who aren't satisfied with the functionality
> will already be fishing around for more features, and long-press is not very
> uncommon in apps already."

**"Show live bus on map" is offered only when that arrival has a reporting
bus**, and is *absent* otherwise rather than disabled. Most arrivals do not: this
project measured ~96% of arrivals as schedule-only, and `MapScreen`'s own
comment puts the trip join at "about one arrival in ten". Those two disagree
enough to be **re-measured during the work**; either way it is a minority, and a
permanently greyed row reads as broken rather than as informative. The test is
local — an `Arrival` carries its own `vehicle` and `estimate` — so no request is
needed to decide.

> **Re-measured 2026-08-10, and the two figures never disagreed.** 300 live
> arrivals across the twelve busiest stops, at **00:40 HST**: 19 carried a
> vehicle, 19 were `estimated="1"`, and 19 carried a non-zero position — the
> *same* 19. So 6.3% live, which is a night number, and the 96% it agrees with
> is a night number too: `docs/api/README.md` records it as a 22:00 HST sample
> and says in as many words that the window inflates the schedule-only share.
> Daytime fleet freshness is about **five times** the night's — 235 of 1,204
> vehicles fresh at 11:43 HST against 46 at 01:07 — which puts the daytime share
> nearer `MapScreen`'s one-in-ten than the 96% claim.
>
> **A daytime re-measurement was not possible from this side**, Honolulu being
> eleven hours from daylight, and it would not change the design: a minority
> either way, so absent rather than disabled stands.
>
> What the sample does settle is the mechanism. `vehicle`, `estimated` and
> `position` were not merely correlated but identical, so "has a reporting bus"
> is one fact with three spellings, and the menu can decide it from the
> `Arrival` alone with no request.

**Most of this is routing, not new map machinery.** `MapScreen` already holds
`selectedArrival` and `highlightedBus`, joins them on `tripId`, draws that bus
larger, keeps its fleet number at any zoom, and switches the drawn line to that
trip's exact shape. It is gated to route mode and reachable only from the map's
own stop card. What is missing is a way to *arrive* in that state from
elsewhere.

### Tapping a bus

**The label expands in place.** No card, no sheet mode, no camera follow — all
three were offered and set aside.

```
UNSELECTED            SELECTED

    ( )                   ( )
    147               ┌──────────────┐
                      │     147      │   fleet, as before
                      │ 4 min behind │   lateness, in words
                      │ 40s ago      │   age, moved down from the collapsed label
                      └──────────────┘
```

- **The collapsed label sheds the age** and becomes the fleet number alone.
  Age moves into the popup. No headsign anywhere: buses are only ever drawn in
  route mode, so the sheet header already names the route and — after the
  direction filter below — the direction too.
- **Lateness in words is the point.** It is the accepted fix for lateness being
  communicated by ring colour alone (`docs/backlog.md`). "On time" and "not
  reporting" both need honest wording; **positive `adherence` means *early***,
  and nothing bounds it to ±60.
- **The selected bus overrides route-scale silencing.** `scaleOf` in `labels.ts`
  collapses everything to dots past the threshold — that is the Increment 8 fix
  for forty tiles fusing into a chain. One bus, the selected one, keeps its
  label at any zoom. The collision map has to learn that one label has a
  variable height and wins ties.

**A bus sitting on a stop pin: the bus wins, and hands the stop down.** Today
`onBusPress` gives the tap away entirely — it finds the stop under the bus,
selects that, and does nothing at all if there is none (`651bb07`, confirmed on
a device). That fix must survive. So when a stop is underneath, **the popup
gains a tappable line naming it**, and the stop is one further tap away. Nothing
becomes unreachable, and nobody has to hit a pin they cannot see.

### Route mode says what it is showing

**A pill under the search bar**, naming the route. Truman: *"That will
literally be perfect."*

**The legend question is settled and closed.** A pill presents OTS data on the
map surface, and the sheet's peek renders no legend. Raised, and ruled on:

> "The data on the map corresponds to the data in the bottom sheet, which
> already has the attribution in the routes list. The arrivals on the map
> already works like this: pressing a stop brings up the bottom sheet which in
> turn shows the attribution."

and then, on the peek specifically:

> "We already have headers that show OTS data without a visible attribution, in
> the form of the lowest detent bottom sheet. That's honestly fine."

**No legend-at-peek work.** Do not reopen this as a compliance finding.

### Arrows along the route line

**Which way the line points, at a glance.** `MapPolylineProps` has
`lineDashPattern` and `lineDashPhase` and **no arrow support**, so arrows are
markers — and markers inside `MapView` is the seam with the SIGABRT behind it.

Truman declined to let the open crash shrink the design: *"We're deferring the
crash already… If it makes it worse, whatever."* The design below does not
require that trade anyway.

**A fixed pool of always-mounted arrow markers, redistributed along the visible
stretch of line.** Eight or so, mounted once for the life of the map, rotated to
follow the line, opacity zero outside route mode. Spacing stays visually even at
every zoom, which is what density-by-zoom is actually for, while the marker
count never changes — so nothing ever mounts, unmounts or reorders inside
`MapView`. This is the same trick `RouteLine` uses (always mounted, only
coordinates change) and that bus labels use (always mounted, hidden with
opacity). **Do not implement this as one marker per segment.**

### The small wins

- **Tab icons.** The tab bar passes no `tabBarIcon` at all today, which is why
  iOS draws placeholder triangles. `@expo/vector-icons` is already installed
  (nested under `expo`, in the lockfile) — no new dependency, no CI loop.
- **The arrivals screen gains the card's meta block.** Route chips **always**;
  distance **when location is available**, absent when not — the same
  `meters === null ? null` shape `StopCard` already uses. `BoardHeader` is
  already shared between the two hosts; only the meta block below it differs.
- **Switching the search filter stops showing the previous filter's results.**
  The documented fix in `docs/backlog.md`: distinguish a filter change from a
  query change in `useSearch`'s effect and reset to `NO_RESULTS` on the former.
  The carry-forward exists so a *keystroke* never blanks the list under a thumb,
  which an explicit filter change is not.

---

## The data

### Buses draw off the route line because both directions are drawn

Reported from the `.ipa` with two Route 2 screenshots. **Measured, not
inferred:** `useVehicles` filters on `sameRoute` and freshness and **nothing
else**. The live fleet at 21:29 on 2026-08-09 had 8 buses on Route 2, splitting
exactly two ways by `headsign` — 4 `KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN`,
4 `WAIKIKI - KAPIOLANI CC - DIAMOND HEAD`. The sheet read *Toward KALIHI
TRANSIT CENTER*; bus 889, the one a block off the line, was a `WAIKIKI` bus.
**The position was correct and MapKit was correct.**

**Geometry cannot be the primary mechanism.** It fails wherever both directions
run the same street, which is most of the island. The headsign is the only real
signal.

**The join is exact.** GTFS `trip_headsign` and the live feed's `headsign` are
byte-identical — `KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN` appears verbatim in
both. Distinct `(route_id, direction_id, trip_headsign)` triples island-wide:
**333 rows**, against 37,678 trips.

**Opposite-direction buses are hidden entirely.** Dimming them and annotating
the count were both offered and set aside: hiding is what makes the sheet's
"· 7 buses" honest, and the flip control is right there.

**A direction has many headsigns.** Route 2's direction `1` has five, including
`ALAPAI TRANSIT CENTER` and three Waikiki variants. The mapping is many-to-one;
a single equality test is wrong.

**Twelve routes reuse a headsign across both directions, and that is accepted.**
123, 14, 444, 51, 52, 521, 53, 535, 54, 6, 7, 8. The loop hypothesis was
**falsified** — all twelve have distinct shapes per direction (route 6 runs 85
stops one way and 57 the other), so the defect is fully visible on them.

*Why they exist*, since it will be asked again: the headsign is the sign on the
front of the bus, and it says where that bus is *going*. That is normally a
perfect stand-in for direction. It breaks on trips that do not run the whole
route — short runs that turn around early, or first-of-shift trips starting
mid-route — which get signed with something generic that appears going both
ways. Route 14 shows it cleanly: 264 trips `ST LOUIS HTS VIA KAPAHULU`, 254
`MAUNALANI HTS VIA KAPAHULU`, and 20 that just say `WAIALAE AVENUE` — 12 one
way, 8 the other. A street name has no direction.

**The scale is what makes accepting it right: 1,507 of 37,678 trips are
ambiguous — 4.00%.** The other 96% attribute cleanly. A geometry fallback for
the twelve was offered and declined for now; its failure mode would have been
benign (where the streets are shared the bus sits on the line and looks right),
so it remains the obvious future move if those routes annoy him in use.

### What versioning actually costs

Truman challenged the schema chain as premature: *"literally no one is using the
app except me and all old versions of the app that use the old versions of the
db are gone already."*

**Half right, and the correction matters.** Most of what looked like a chain is
the price of changing the schema *at all*, not of versioning: `emit.mjs` must
learn the new table, and the bundled floor must be rebuilt and committed,
either way. Versioning itself is one line.

**What it buys with one user.** Without a version, a new build asks for
`manifest.json`, gets the currently published database, which lacks the new
table — it passes the sha256 check, passes the floor counts, is swapped onto,
and then every direction query fails at runtime. The window opens when the new
`.ipa` is installed and closes when the weekly Action next runs. **The risk is
not old binaries reading new data; it is a new binary reading old published
data**, which the "no old versions exist" premise does not cover.

**Verified graceful:** a build that finds no matching manifest gets `null`, the
failure is caught in `dataRefresh.ts`, and it sits on the bundled floor. Absent
data degrades to stale, never to broken.

**Settled:** keep the bump, drop the ceremony.

- `SCHEMA_VERSION` 2 → 3.
- **`route_directions` joins `FLOOR_COUNTS`.** `files.ts` already opens every
  download and throws *"does not have the tables this app queries"* when the
  shape is wrong, so a stale published database is rejected **structurally**
  rather than only by its filename. This validates the real requirement instead
  of a proxy for it, and it is the reason the version number is now
  belt-and-braces rather than the only guard.
- **The "leave old generations up forever" rule is retired** while Truman is the
  only user. Prune freely; revisit if anyone else installs it. This is the part
  that was genuinely over-engineered.
- **Force-run `gtfs-data.yml` before merge** so the window on the floor is
  minutes rather than up to a week.
- **Rebuild and commit `assets/db/gtfs.db`.** This is the documented exception
  to *"do not run `npm run build:gtfs` and commit the result"* — a v3 binary
  needs a v3 floor. The rule exists to stop *routine* rebuilds, not schema
  changes.

---

## Deferred, to `docs/backlog.md`

- **Address autocomplete**, and the decision about whether to accept a
  CI-only feature to get it.
- **A geometry fallback** for the twelve ambiguous routes.
- **The SIGABRT**, still open, still unchased by choice.
- **Camera-follow for a selected bus**, offered and set aside as fighting the
  route-mode camera.
