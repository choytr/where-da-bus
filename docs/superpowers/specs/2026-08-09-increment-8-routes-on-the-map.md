# Increment 8 — routes on the map

Grilled 2026-08-09. **Every decision in *What a rider gets* and *The data* below
is Truman's and was settled in that conversation.** The reasoning is recorded so
it is not re-argued, and the measurements are reproduced here because this file
is their permanent home — `docs/handoff.md` carried them first and is rewritten
every increment.

## What this is

Pick a route on the map and **the map draws it and stays**. It no longer
navigates to `/route/[id]`. It draws the route's real road line, that route's
stops as the map's pins, and the buses actually driving it right now.

## What this is not

**The Stops tab is untouched.** A route result there still opens
`/route/[id]`, and `RouteScreen` stays exactly as it is. Route mode is a
property of the map, not a replacement for the route screen.

**Nothing renders `adherence`.** It is parsed and carried in the model so that
surfacing it later is a UI change rather than a data change — see *Deferred*.

---

## What a rider gets

- **One direction at a time**, named by where it ends up. `RouteScreen`'s
  existing `Toward <last stop name>` wording is reused verbatim
  (`features/routes/RouteScreen.tsx:44`), because GTFS's `direction_id` `0`/`1`
  tells a rider nothing and the last stop in the sequence is the same thing the
  headsign on the front of the bus says. A flip control switches direction.
  **Truman asked for the current direction to be made unmistakable**; the
  treatment is his to confirm on a device.
- **The sheet carries the route's full stop list, in order** — a third sheet
  mode beside the nearby list and the stop card.
- **An X leaves route mode, and nothing else does.** Panning does not drop it.
  Leaving the tab and coming back does not drop it. Both were put to him
  explicitly.
- **Each bus is labelled with its fleet number and the age of its last
  report** — `252 · here 20 s ago`. Truman asked for this by name, after the old
  DaBus app.
- **Tapping an arrival highlights the bus already on screen**, joined on trip id.

---

## The data — and a premise this project previously had wrong

**The old claim that shapes would cost "an asset several times its size" was
wrong, and it is why polylines nearly got cut.** 9.8 MB is the raw
`shapes.txt`: full precision, redundant columns, all 532 variants. Measured
2026-08-09 as actually *stored* — Douglas–Peucker simplified, encoded polyline,
against the 1.17 MB asset:

| stored | 5 m | 10 m | 20 m |
|---|---|---|---|
| all 532 shapes | 201 KiB | **152 KiB** | 116 KiB |
| 236, one per route+direction | 97 KiB | 73 KiB | 56 KiB |

**Settled: all 532 shapes, keyed by `shape_id`, simplified at 10 m — ~152 KiB.**

Built 2026-08-09: 532 shapes, 152 KiB of polyline, 236 route/directions, and the
asset went 1.17 MB → **1.37 MB**. The estimate above said 1.32; the extra 50 KB
is the `shapes` and `route_shapes` tables' own page overhead and indexes, which
the polyline measurement did not include.

Not the cheaper 236, because **every live arrival carries a `shape` field naming
the exact variant that bus is running** (`docs/api/README.md:162`, present on all
25 rows of `arrivals-mixed.json`). Storing only a representative per direction
would draw a short-turn or an express bus beside a line it is not on. **The route
view draws the representative; a selected arrival draws the variant it names.**

### The cheap connect-the-stops line is dead

Killed by measurement, not argument. Comparing the representative trip's stops
against *that same trip's* real shape — 236 route/directions, 132,332 points:

| median | p90 | p99 | worst |
|---|---|---|---|
| 29 m | **1.3 km** | 5.6 km | 7.3 km (route 60, both directions) |

**202 of 236 route/directions are ≥150 m wrong at their worst, and none is under
50 m.** It is fine in town and draws straight through Kāneʻohe Bay on the
express and rural runs. **Do not revive it.**

**`route_stops` is one representative trip, not a union** —
`scripts/build-gtfs/derive.mjs:150` picks the trip visiting the most stops per
route+direction. Comparing its stops against a *different* trip's shape inflates
the error badly; that mistake was made and corrected on 2026-08-09.

### The schema bump, and the floor

`SCHEMA_VERSION` goes **1 → 2**, adding two tables: `shapes` and `route_shapes`.

**Truman authorised rebuilding and committing the bundled floor**
(`assets/db/gtfs.db`, 1.17 MB → 1.37 MB) so that a fresh offline install still
draws lines. This is
the sanctioned exception to `CLAUDE.md`'s ban on rebuilding it by hand — the ban
is against casual rebuilds, and a bump leaves no choice, since the queries would
otherwise ask the floor for a table it does not have. **The bump and the floor
rebuild must land in the same commit.** Either alone leaves the app asking for
something it cannot get.

### The dual publish, and the trap under it

**Settled: the weekly Action publishes both a v1 and a v2 generation from here
on**, so an old sideloaded build keeps receiving fresh data. There is no App
Store to push a fix through.

**What the grilling did not know, found while writing this spec:** the version is
not the only thing that has to be published twice. `data/gtfs/refresh.ts:24`
hardcodes a single `manifest.json`, and `checkForUpdate` returns null when
`manifest.schemaVersion !== SCHEMA_VERSION` (`refresh.ts:133`). That URL is
frozen inside every binary already on a phone. Publishing a v2 manifest at
`manifest.json` therefore does not merely fail to help an old binary — **it
switches that binary off**, silently and permanently, which is the exact outcome
the dual publish exists to prevent.

So the mechanism the settled decision requires:

- **`manifest.json` keeps describing a v1 generation, forever.** It is a frozen
  contract with binaries that cannot be changed.
- **Every binary from here asks for `manifest-v<SCHEMA_VERSION>.json`**, so a
  future v3 never has this problem again.
- The v1 generation is the v2 build with its `shapes` and `route_shapes` tables
  dropped and its `meta.schema_version` set back to 1 — **a genuine v1
  database**, not a v2 file wearing a v1 label. `installUpdate` reads
  `schema_version` out of the downloaded file and rejects a mismatch
  (`refresh.ts:201`), so relabelling would fail on the phone rather than in CI.

Deriving the v1 file from the v2 one rather than emitting it twice is deliberate:
the two generations are then the same feed by construction, and the build parses
the 73 MB `stop_times.txt` once.

---

## The buses — the fleet endpoint, not the arrival's own position

**Settled: every live bus on the route, not the one bus behind an arrival.** The
one-bus view is available for about 1 arrival in 10: in the real 25-arrival
capture **23 of 25 carry the `"0"` position sentinel**, because position exists
only for `estimated: "1"` and `docs/api/README.md` records 96% of sampled
arrivals as the undocumented `"2"`. A feature that is a dead end nine times out
of ten is worse than one that is absent.

- **The fleet endpoint is the only route to fleet-wide positions, and it is XML
  only** — `docs/api/README.md:215`. Omit `num` and one request returns every bus
  on Oahu: 1,184 elements, 333 KB, 29 KB gzipped. **`route=` does not filter**;
  filtering is ours to do client-side, on `route_short_name`.
- **A freshness filter is mandatory, not hardening.** Most of that response is
  dead buses carrying *plausible Oahu coordinates* — 929 stale ones in the
  daytime sample. Unfiltered it draws ~1,100 ghosts parked since 2022.
- **Settled: a 5-minute window, applied as one rule in both directions.** A bus
  is drawn while its last report is fresh and leaves the map when it stops being
  fresh. The data makes this nearly judgement-free: **232 of 235 live buses
  reported within five minutes, and the next-freshest was over ten hours old.**
  Because the age is computed from the bus's own `last_message`, **a failed fetch
  needs no special case at all** — the labels keep counting up and the buses age
  off on their own. An earlier proposal for a separate two-minute outage timer
  was dropped; **do not reintroduce it.**
- **Poll every 60 s**, matching `features/arrivals/useArrivals.ts:28` and for the
  reason recorded there.
- **`data/thebus/time.ts:89` already parses `<last_message>`'s
  `M/D/YYYY h:mm:ss AM`**, including the UTC−10 trap that makes `Date.parse`
  wrong every evening. The age is a subtraction, not new work.
- **`<driver>` is an employee number and is dropped at the parse boundary**, not
  merely left unrendered. It sits directly beside `<number>`, the fleet number,
  which *is* what gets displayed. It must not be expressible in the app's model:
  the type carries no such field, so no screen can render one and no log can
  print one.
- **17 of 235 live buses report `route_short_name` as the literal string
  `"null"`**, so some real buses cannot be attributed to the route being viewed
  and are left off. Known, accepted.

---

## Chosen without asking him, per the working agreement

Behaviour a rider would see is Truman's; these are not, and are recorded so they
are not re-opened. See the memory note of 2026-08-09.

- **Tapping a route stop in the sheet centers the map on it**; tapping its pin
  does not. Increment 7's rule, unchanged.
- **Tapping a bus does nothing yet.**
- **The XML parser is hand-rolled rather than a dependency.** The document is
  flat and shallow, and Expo Go's ceiling makes every package a real cost.
- **Route mode lives in a module-level store, not in `MapScreen`'s state.**
  "Leaving the tab and coming back does not drop it" is otherwise a bet on
  whether React Navigation keeps a tab scene mounted — an unmeasured native
  behaviour, which is the exact class of thing this project has now got wrong six
  times. Fifteen lines and a `useSyncExternalStore` make it certain instead, and
  the device round then has one less unknown to spend itself on.
- **The polyline codec is shared, not written twice.** `data/gtfs/polyline.ts`
  encodes and decodes; `scripts/build-gtfs/emit.mjs` imports it the same way it
  already imports `SCHEMA_VERSION`, so the encoder and the decoder cannot drift.
  Simplification is build-only and stays in the build.
- **The bus label is recomputed on a coarse tick, never per second.** iOS
  re-snapshots a custom marker view whenever it changes, and a label ticking once
  a second re-snapshots every bus on screen once a second — the documented way to
  make a map with custom markers unusable (`features/map/StopMarker.tsx:70`). One
  tick drives both the label and the freshness filter, so a bus that goes stale
  between polls still ages off.
- **The drift offer (*Search this area*) is hidden in route mode.** It would
  replace an anchor whose stops are not the ones on screen.

---

## Stated assumptions, and what is unknowable from here

**Everything about how this *looks* is inference until Truman confirms it on a
device.** There is no simulator here and no device on this side.

- **The direction treatment, the flip control, the X, and the bus label's form
  are provisional** and go to him with screenshots.
- **How often the arrival→bus highlight lands is unknown.** It needs a live call
  with Truman's AppID, which is in his keychain. Build it to light up when the
  join succeeds; **promise no hit rate.**
- **The weekday peak fleet size is unmeasured.** 235 live vehicles was a Sunday,
  and Sunday service is thinner, so it is a floor rather than an estimate.

## The risk to plan around

**Buses move, so markers are added and removed every 60 s** — far more tree churn
than stops, which change only on a pan. Route mode adds its own: the whole pin
set is swapped at once, and a `<Polyline>` mounts inside `MapView`. That is the
same seam as the SIGABRT at `docs/backlog.md:165`, which is fixed but never
proven gone.

**So there are two device rounds, not one**, and neither is at the end: one when
route mode and its polyline first draw, and one when live buses first churn. The
label rules from that backlog entry are non-negotiable — labels **always
mounted** and hidden with `opacity` rather than conditionally rendered, and
`position: 'absolute'` so they sit outside the marker's frame.

## Deferred, to `docs/backlog.md`

**Where a bus's lateness is shown.** `adherence` is parsed and carried in the
model so surfacing it later is a UI change, not a data change. Truman ruled it
off the bus label — which already carries two facts — and wants it elsewhere on
the map, but deferred the placement until he can see it. Two traps for whoever
does it: **positive means *early***, and nothing bounds it to ±60.
