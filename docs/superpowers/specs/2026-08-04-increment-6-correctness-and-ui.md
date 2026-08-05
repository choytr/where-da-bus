# Increment 6 — Correctness, then UI

**Status:** in progress. Settled in a grilling session with Truman on
2026-08-04, before any code.

## What this is

Two halves, in order.

**First, six known-broken things get fixed.** All six were already in
`docs/backlog.md`, found by review or on a device, triaged and deferred. None is
speculative.

**Then a UI pass driven by screenshots from a real device.** Truman photographs
the app, says what bothers him, and the work happens against observation rather
than inference — which is the point. This project has been wrong about its own
appearance three times, every time by reasoning from source.

## What this is not

**Live vehicle positions are a later increment.** A *fleet-wide* layer is proven
— the `vehicle/` endpoint with no parameters returns ~1,184 vehicles in one
333 KB XML response, 235 of them fresh at midday — but it needs an XML parser
and it changes what the map must hold. See `docs/api/README.md`.

> **Corrected 2026-08-05.** The XML cost is real for a fleet layer and not for
> the smaller feature. `Arrival` already carries `tripId`, `vehicle` and
> `position`, so showing the bus behind *one arrival on one board* needs no
> parser and no second request. Live vehicles stay deferred, but the reason
> above is bigger than the one that applies. See
> `docs/superpowers/logs/2026-08-05-field-notes-map-and-live-buses.md`.

**Route polylines are not in scope either**, and were cut from the vehicle work
as decoration next to a moving dot. Still cut as of 2026-08-05: nothing in the
GTFS asset carries shapes, so a polyline is a new table, a schema bump and a
republished generation rather than a shared asset.

**New persistent chrome at the map's edges is deferred into the vehicle
increment.** A route filter or a "following bus 42" banner will want the map's
top and side edges, so anything placed there now gets moved. Everything else
about the map — the sheet, the card, the pins, the callouts, type, colour — is
in scope now. This is a revision of a stronger claim made earlier in the
grilling, that map UI should wait entirely; a vehicle layer is mostly additive
and the sheet's layout survives it.

## The six fixes

Each is an existing `docs/backlog.md` entry. The plan carries contracts.

1. **A pointer naming a missing file opens an empty database.** `AppShell`'s
   `useCurrentDatabaseName` passes a stored generation name straight to
   `SQLiteProvider`, and `openDatabaseAsync` *creates* what it cannot find — so
   the open succeeds, `DatabaseGate` never fires, and every screen silently
   shows no results. The worst failure shape in the app.
2. **`DatabaseGate` misdiagnoses every render error**, telling users to
   reinstall over any crash anywhere below it. It also destroys evidence: the
   crash in the backlog would currently present as a database failure. As of
   2026-08-05 that crash is narrowed to the tap-hold *Search here*
   interaction, which makes this the fix that keeps the next occurrence
   diagnosable rather than a tidy-up.
3. **`route_stops` has holes** — 18 of 236 directional patterns skip a stop the
   route genuinely serves, because dropping `_merge` duplicates discards their
   relationship rows instead of remapping them onto the surviving twin.
4. **Favorites have a read-modify-write race** — two stars tapped inside one
   AsyncStorage round trip silently lose one.
5. **`StopsScreen`'s error notice never clears** — a single sticky slot, never
   reset, silently overwritten when a second problem arrives.
6. **`favorites.ts`'s AsyncStorage calls are unwrapped**, so a native-module I/O
   rejection propagates uncaught. Corrupt content is handled; hard I/O failure
   is not distinguished from it.

Deliberately **not** fixed, all unreachable or harmless today: `publish.mjs`
publishing the floor as fresh (guarded by identical workflow conditions),
`routesForStopsSql(0)` emitting `IN ()` (guarded in `db.ts`), `emit.mjs`
requiring `stop_name` on `location_type` 3/4 rows (this feed has none),
`build.mjs` skipping `db.close()` on throw.

### Two decisions the data fix already forced

**The floor rebuild and the republish are one atomic step.** `dataRefresh.ts`
passes `current?.builtAt ?? null`, so a device with no pointer downloads
whatever the manifest offers regardless of how good its bundled floor is. Fix
the build, rebuild `assets/db/gtfs.db`, and fail to republish, and every device
immediately downloads the old broken generation and moves off the corrected
floor.

**`gtfs-data.yml` needs a way to force a publish.** It gates on
`publish.mjs check`, which asks whether the *upstream feed* changed. This fix
changes our output while the input is byte-identical, so the weekly cron would
exit `changed=false` forever and the corrected data would never ship. A
`workflow_dispatch` input that skips the check is the smallest honest fix.
Hashing the built artifact instead is the more correct version and a bigger
change; not taken.

This is the one sanctioned rebuild of the committed floor. `CLAUDE.md` tells
every session not to run `npm run build:gtfs` and commit the result — that rule
exists to stop casual rebuilds, and this is the case it was carved out for.

## The UI half

**It has no stopping rule. Truman calls it done.** Put to him explicitly, with
the consequence stated — the increment cannot close on its own, so the
review-on-the-whole-diff and the backlog triage have nothing to fire against
until he says stop. He chose it anyway, knowingly.

The mitigation is **one commit per surface**, so that when he does call it, the
boundary review walks commits rather than one large undifferentiated diff.

**It is collaborative, not delegated.** Truman guides, and edits files himself
between messages. Every session starts with `git pull --rebase` and
`git status`; a file carrying changes that are not ours is not written over.
Per `CLAUDE.md` his code is reviewed like anyone's and the fix is left to him
unless he asks.

**Design tokens grow per surface, not up front.** `lib/theme.tsx` has colour
tokens and nothing else; there are 10 distinct `fontSize` literals across 71
usages and no spacing scale. A type and spacing scale is the right answer, but
applying one across every screen sight-unseen is the largest blind change this
project could make. So each surface joins the scale as it is worked, with
screenshots in hand, and screens not yet reached keep plain numeric literals —
which also keeps them editable by Truman without learning the scale first.

### Coverage, not a boundary

Seven surfaces, tracked so that nothing is simply never looked at: stops list ·
arrivals board · route detail · map + sheet + card · settings · `KeyGate`
onboarding · empty and failure states.

**The failure states are the reason this list exists.** They cannot be
photographed in normal use, so a screenshot-driven pass would systematically
polish the happy path and leave untouched the screens this project's quality
claim rests on. Six of the seven are reachable by hand — airplane mode, a junk
key, denied location, `zzzz` in search. The seventh, database-unavailable, is
Truman's find: flip `AppShell.tsx`'s `DatabaseGate` initial state to
`{ failed: true }` in Expo Go. **Nothing has to ship as inference.**

Round 1 landed before this spec was written: 15 screenshots, dark theme,
including two airplane-mode failure states. Findings are in
`docs/superpowers/logs/2026-08-04-increment-6-ui.md`, each marked *observed* or
*inferred*. Light theme is unseen and deprioritised by Truman — "honestly light
is not that important rn."

### Screenshots live outside the repository

`~/wheredabus-screenshots/<date>/`. This repository is public, and nine of the
first fifteen carry Truman's position closely enough to locate him. They are not
committed and not gitignored-in-place; they simply do not live here. The UI log
carries every finding as text, which is also what makes them survive a context
compaction.

## Address search — probed here, built later

Truman raised it mid-grilling: search an address, show the stops around it.

**It is cheap, because the hard half exists.** `useAnchoredStops` is built
around a single anchor — stops queried around one point, camera framed on it —
already driven by `setAnchor(coords)` from long-press and from *Search this
area*. Address search is one more way to produce a coordinate.

**No new dependency.** `Location.geocodeAsync(address)` is in `expo-location`,
which is already a dependency; verified against the v54 docs. No key, no native
module, no cost to the Expo Go loop.

**Places are not addresses, and Truman accepted the limit.** `geocodeAsync` on
iOS is `CLGeocoder`, an address geocoder. Point-of-interest search is
`MKLocalSearch`, which `react-native-maps` does not expose and which would mean
a native module. Put to him; his answer: *"it's fine if it just searches address
strings for now… UH's actual address is honestly fine over typing 'UH Manoa'."*

**Two constraints for whoever builds it.** Apple documents at most one geocoding
request per user action, so this is submit-on-enter and **not** the debounced
type-ahead the stop search uses. And the Stops tab's existing field takes stop
names and numbers — `"King"` is both a stop-name fragment and a street — so one
field serving both is genuinely ambiguous and needs deciding.

**This increment ships only a throwaway probe** behind Settings that calls
`geocodeAsync` and prints what comes back, so the feature is designed against
what Apple actually returns for Oahu. It is removed before merge.

## Also in scope

**`docs/backlog.md` gets re-triaged.** Truman looked at two entries and both
were bad: the *Search here* callout's centring was fixed at some point (now
observed correct on device, entry deleted), and the 45% detent entry reads as a
defect when it is a decision record saying *do not raise it*.

That second one needs more than a re-read. The detent decision rests on the
sheet showing "one and a half arrival rows" at 45%. **It shows none** — the
attribution block moved in and took the space. The decision is not wrong; its
premise no longer holds, and the entry must say so.
