# TheBusLive — a comparison of data management

**Date:** 2026-08-02
**Subject:** [`ashvr0/TheBusLive`](https://github.com/ashvr0/TheBusLive), read at
`main`, shallow clone.
**Status:** reference. Nothing here is a decision; the two things it *changes*
are called out under "What we are changing" and were folded into Increment 3.

## What this is

An independent, unofficial replacement for the same discontinued app, against
the same API, written by someone else. SwiftUI + MapKit, iOS 17+, MVVM, no
third-party dependencies, ~3,300 lines of Swift. Their README says it too is
authored on Linux/Windows and built on GitHub Actions macOS runners — the same
constraint that shapes this project, reached independently.

**This is a reading of their source, not a run of their app.** No Swift
toolchain here and no device. Every claim below is traceable to a file and
line. Where I say something "would" happen, that is inference from the code and
is marked as such.

## The shape of the two, side by side

| | TheBusLive | WhereDaBus |
|---|---|---|
| Transport | XML for everything, one hand-rolled `XMLParser` tree | JSON (`arrivalsJSON`) for arrivals; no XML parser yet |
| API key | **each user registers their own**, typed into Settings, stored in `UserDefaults` | one AppID shipped in the bundle via `EXPO_PUBLIC_` |
| Static data | `stops.json` 499 KB + `shapes.json` **6.1 MB**, raw JSON, decoded whole at first touch | `gtfs.db` ~1.2 MB SQLite, queried |
| Arrival caching | 30 s response cache + in-flight request de-duplication, in a shared `actor` | none; each `useArrivals` owns its own 60 s poll |
| Vehicle map | follow **one** bus by `num`, polled every 15 s | fleet-wide, deferred to Increment 5 |
| Stop map | **viewport query**, 120 ms debounce, grid-thinned to 150 pins, gated below 0.12° span | anchored to a point; does not re-query on pan |
| Freshness | `last_message` displayed as a raw string, never compared to now | `last_message` is the mandatory filter |
| State model | `idle / loading / loaded / empty / failed` | loading / data-with-age / error-with-last-known (§4) |

## Four things worth taking

### 1. Request de-duplication and a short response cache

`APIClient.swift:159` is the one piece of their architecture I would import
wholesale in spirit. A shared `actor` holds two things per cache key:

- a 30-second response cache, and
- a map of **in-flight** `Task`s.

A second caller for a key already in flight awaits the *existing* task rather
than starting a request. So two screens showing stop 596, or a remount during a
navigation animation, cost one request instead of two.

We have no equivalent. `useArrivals` owns its poll per mounted screen, and the
arrival board plus any future map callout for the same stop would each fetch.
It has not bitten us because only one screen has ever shown arrivals — Increment
3 adds a second surface onto the same data, which is exactly when it starts to.

**This matters more for us than for them,** and the reason is the next item.

### 2. Their per-user API key is a real answer to a problem we have

`APIConfig.swift:6` — *"TheBus limits each key to 250,000 requests/day, so every
install needs its own key rather than sharing one baked into the app."*

`docs/api/README.md` already records that the quota is per AppID, not per
device. TheBusLive is the same observation turned into a design. Run our
numbers: an open arrival board polls every 60 s, so 60 requests/hour/user
against ~10,400 requests/hour of quota. **Roughly 170 users with a board open
saturates it** — fewer once a map polls too.

Their answer costs them an onboarding wall: register at
`api.thebus.org/NewAccount`, paste a key into Settings, or the app does nothing.
That is a genuinely bad first run, and I am not proposing it. But it is the
honest trade, and it is worth writing down that we have chosen the other side of
it: **we are betting the app stays small, and our AppID is a shared resource
with a ceiling.** Caching and de-duplication are the cheap half of their answer
and carry none of the onboarding cost. That is the half to take.

Their key handling has one detail worth copying if we ever do offer key entry:
the field is a `SecureField` by default with a reveal toggle
(`SettingsView.swift:105`).

### 3. Their stop map is the fork our spec rejected — and it cost them three mitigations

`AllStopsMapView.swift` queries stops by viewport. Reading what it took to make
that acceptable is the best evidence I have seen *for* the anchored decision in
`2026-08-02-increment-3-map.md`:

- camera changes are debounced 120 ms before recomputing (`:89`),
- results are thinned to **`maxRenderedPins = 150`** by snapping to a grid and
  keeping one stop per cell, so the survivors stay evenly spread (`:45`),
- and below 0.12° span the map refuses to draw pins at all, showing
  *"Zoom in to see stop pins"* instead (`:28`, `:138`).

Their own comment at `:33` names the cause: past ~150 annotations, MapKit's
per-annotation SwiftUI views "start costing enough layout/hit-testing time per
frame to visibly stutter pinch/pan". Our spec independently landed on the same
150 figure and drew the opposite conclusion — don't re-query, anchor to a point.

Two notes in fairness. Their thinning is smarter than truncation and worth
remembering if we ever do need to cap markers. And the pin budget is a *MapKit
native annotation* number; `react-native-maps` markers are not the same object,
so 150 is a hint for us, not a measurement.

### 4. Small ones

- **`estimated == "1"` as a whitelist** (`APIClient.swift:383`) — reached
  independently, identical to ours. Good corroboration of a decision Increment 2
  made from a single sampled response.
- **Don't recenter the camera on every poll.** `VehicleMapViewModel.swift:36`
  keeps a `hasCenteredCamera` flag so a refresh doesn't yank the view back while
  you are panning. Obvious once stated, easy to omit.
- **Don't flash a spinner on a refresh you already have data for**
  (`:43`) — the same instinct as our §4 state model, arrived at from the map
  side rather than the list side.

## Four things not to take

### 1. `driver` is retained

`Vehicle.swift:9` declares `let driver: String?`, `APIClient.swift:420` parses
it, and `CodingKeys` at `:24` includes it — so it is a `Codable` field of a
struct held in an in-memory cache. Nothing displays it; I grepped, and the only
three references are the declaration, the coding key, and the parse.

So this is not a leak to screen. It is the *default outcome* — a faithful
mapping of the vendor's XML keeps the field, because dropping it takes a
deliberate act. This is the concrete argument for the rule `CLAUDE.md` already
states: **drop it at the parse boundary, not at the render boundary.** It is an
employee number for a specific working person. A field that exists in a Codable
model is one `JSONEncoder` away from a log line or a disk cache.

### 2. Nothing filters on freshness

`last_message` is parsed and shown to the user as a raw string — *"Last update:
8/1/2026 10:07 PM"* (`MapView.swift:274`) — and never compared against the
current time. Their design mostly protects them: you reach the vehicle map only
from a live arrival row, so the bus you follow is live by construction. But the
data has no such guarantee, and **929 of the 1,204 vehicles in today's fleet
sample are stale while carrying plausible Oahu coordinates**. Rendering a raw
timestamp puts the freshness judgment on the user, in a string they have to
subtract from the current time themselves. Our §4 age display exists so they
don't have to.

### 3. `"???"` is not handled — and it appears to be reachable

`StopDetailView.swift:98` gates the vehicle map on
`arrival.estimated, let vehicleNumber = arrival.vehicle, !vehicleNumber.isEmpty`.
`"???"` is not empty. `docs/api/README.md` records `"???"` as a literal sentinel
for an unknown bus, confirmed live, *and* records that `estimated="1"` rows can
carry it.

**Inference, not observation:** such a row would offer a "track this bus" tap
that requests `num=???` and lands on `Could not find vehicle "???"`. I cannot
run their app to confirm the sentinel co-occurs with `estimated="1"` often
enough to hit in practice. It is worth stating precisely because it is the trap
our README was written to prevent, found in the wild in the first codebase we
compared against.

### 4. 6.1 MB of shapes as raw JSON

`shapes.json` is nested `[[[Double]]]` decoded whole into
`[String: [[CLLocationCoordinate2D]]]` at first touch (`RouteShapes.swift:9`).
Our own measurement for the same geometry, polyline-encoded, is **~200 KB** —
roughly a 30× difference, all of it coordinate punctuation and float digits.
Their `stops.json` is 499 KB against our entire 1.2 MB SQLite asset, which also
carries the stop↔route relationships. The SQLite build was the right call and
this is the counterfactual.

## What we are changing

Two things, both folded into Increment 3 rather than deferred:

1. **A shared arrivals cache with in-flight de-duplication**, behind the
   existing `TheBusClient` interface so no screen changes. Their 30 s TTL
   against our 60 s poll is the right ratio to copy — long enough to collapse a
   remount, short enough that it never serves data the poll would have replaced.
2. **`hasCenteredCamera`**, or our equivalent: the map must not recenter on a
   refresh the user did not ask for.

Everything else here is recorded and not acted on.

## What this does not tell us

Their app is on the App Store with a signed build and a paid account; ours is
sideloaded. That difference shapes their Settings screen, their privacy sheet
and their onboarding, and none of those trade-offs transfer. Nor is any of this
a judgment of their app — it is a better-featured app than ours today. It was
read for its data layer, and only that is compared here.
