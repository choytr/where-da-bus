# WhereDaBus — Design

**Date:** 2026-07-29
**Status:** Approved

An unofficial real-time bus tracking app for Oahu, replacing the discontinued
DaBus / HEA-TheBus apps. React Native + Expo, targeting iOS 18+ on iPhone XR.

## Motivation

The existing replacements are rejected on UX grounds, not reliability grounds.
Arrival predictions in Google Maps and Apple Maps are accurate; the problem is
the interaction model.

- **Google Maps** — forces destination-first route planning before it will show
  bus routes. Wrong mental model for "what's coming to my stop."
- **Apple Maps** — too simplistic; poor per-stop interaction.
- **Transit** — the officially promoted replacement; UI/UX disliked.

The specific DaBus affordances to recover: **favorite individual stops**, **see
scheduled buses per stop**, **see route shapes**, **see live vehicle positions**.

Above all: **browse the network directly.** DaBus was barebones and did no route
planning, but it showed every stop, every route serving each stop, and every stop
on a route. That made it possible to reject a suggested stop and find a better
one for the route you actually need — something no current app supports without
first naming a destination. See "The central interaction" in §3.

## Constraints

| Constraint | Value |
|---|---|
| Dev machine | Windows (WSL2). No Mac, no Xcode. |
| Target device | iPhone XR, iOS 18 minimum |
| Distribution | Free sideload via SideStore/AltStore. No paid Apple Developer account. |
| Data layer | In-app parsing. No backend service. |
| Maps | Deferred to Increment 3 |

The paid Apple Developer Program ($99/yr) is deliberately deferred and may be
reconsidered if the project proves viable.

## Research corrections

Two findings that contradict the original research notes:

1. **The API serves JSON as well as XML.** The official API page describes
   Arrivals, Vehicle, and Route services "in both XML and JSON formats." If
   confirmed, hand-written XML parsing is unnecessary.
2. **A GTFS-Realtime feed exists.** Transitland lists `f-thebus~hi~rt` as a
   GTFS-RT feed, distinct from static feed `f-87z-thebus`. GTFS-RT would supply
   standard vehicle positions and trip updates rather than polling per-vehicle.

### API facts — verification status

The official PDFs are committed under `docs/api/`. They turned out to be public,
not registration-gated as originally assumed.

**Verified against `docs/api/Web_Services_API.pdf` (v1.11, revised 2016-02-05):**

- **Rate limit: 250,000 requests/day** per AppID, enforced against both the
  AppID and the client IP address. Raising it requires emailing api@thebus.org.
- **Attribution, verbatim** — note the absent trailing period:
  > Route and arrival data provided by permission of Oahu Transit Services, Inc

  The terms require it be "prominently displayed."
- **AppIDs are deleted after 6 months of inactivity.** Relevant to a personal
  project that may go dormant between bursts of work.
- Services are read-only, over HTTP GET.

**Verified by direct test:** `api.thebus.org` serves HTTPS with a valid
certificate (HTTP 200, clean verification). Use `https://` despite the docs
specifying `http://`. No iOS App Transport Security exception is needed.

**Verified endpoints** (from `arrivals.pdf`, `vehicle.pdf`, `route.pdf`) — use
`https://`, not the documented `http://`:

```
/arrivals/?key=<AppID>&stop=<stop_ID>
/vehicle/?key=<AppID>&num=<vehicle_num>
/route/?key=<AppID>&route=<route_num>
/route/?key=<AppID>&headsign=<string>
```

All against base host `api.thebus.org`.

**The credential has three names in the docs and they are all one value:**
"AppID" in the overview, `key` as the query parameter, and "API_key" /
"API registration number" in the endpoint pages. "HEA" is only the registration
host (`hea.thebus.org`), not a separate credential.

**Verified response fields:**

| Endpoint | Fields |
|---|---|
| arrivals | `stopTimes:{errorMessage,stop,timestamp,arrival}`, `arrival:{id,trip,route,headsign,vehicle,direction}` |
| vehicle | `vehicles:{errorMessage,timestamp,vehicle}`, `vehicle:{number,trip,driver,latitude,longitude,adherence,last_message,route}` |
| route | `routes:{errorMessage,routeName,routeID}`, `route:{routeNum,shapeID,firstStop,headsign}` |

Two consequences worth designing around:

- **`vehicle:adherence`** reports schedule adherence directly — positive means
  the bus is early, negative means late. No competing app surfaces this, and it
  costs nothing to display.
- **`vehicle:driver`** is an employee number. It is personal data about a driver,
  must never appear in the UI, and must never be persisted.
- **`route:shapeID`** keys into `shapes.txt`, which is what makes Increment 3's
  route polylines possible.

**Still unverified:** `arrivalsJSON.pdf`, `routeJSON.pdf`, and `vehicleJSON.pdf`
are image-only with no text layer, and this environment has no PDF renderer. The
JSON endpoints most likely mirror the XML paths with a `JSON` suffix
(`/arrivalsJSON/`), but the field names and types are unconfirmed — in
particular whether numerics arrive as strings and what sentinel values mark a
missing GPS fix. Schema types must be written against **observed payloads**
recorded once the AppID is in `.env`, not against the documentation's field
tables.

## §1 Build pipeline

The pipeline is the project's primary risk, not the application code.

```
Windows dev  ->  git push  ->  GitHub Actions macOS runner
                               |- expo prebuild
                               |- xcodebuild -configuration Release CODE_SIGNING_ALLOWED=NO
                               `- zip .app into Payload/ -> unsigned .ipa artifact
                                         |
                           download to iPhone -> SideStore signs w/ free Apple ID -> installs
```

### Two loops

- **Iteration loop — Expo Go over WiFi.** Instant reload, no CI, no signing.
  Used for essentially all development.
- **Install loop — the `.ipa` path.** Slow, used only for real device installs.

This split holds *only if the app restricts itself to modules Expo Go already
bundles*. That is a hard design constraint, and the second reason maps are
deferred to Increment 3. `expo-location` and `expo-sqlite` are both available in
Expo Go, so Increments 1 and 2 keep the fast loop intact.

### Increment 0

A trivial Expo app is pushed through the entire pipeline **before any bus code
is written**. If SideStore's Windows pairing flow fails on iOS 18, that must
surface on day one rather than after an app exists.

### Accepted risks

- Free Apple ID: 7-day signing expiry, 3-app limit, no push notifications.
- macOS runners bill at 10x minutes on private repos (~200 effective
  minutes/month free). Repo starts private; flipping to public removes the
  limit if it binds.
- SideStore's current Windows pairing flow on iOS 18 is unverified. Increment 0
  exists to test exactly this.

## §2 Architecture

```
app/          expo-router screens
features/
  stops/      nearby list, search, favorites
  routes/     route detail, ordered stop list
  arrivals/   arrival board
data/
  thebus/     TheBusClient interface + network implementation
  gtfs/       bundled static reference data (SQLite)
  storage/    favorites persistence
lib/          time, geo, distance
scripts/
  build-gtfs/ downloads the feed and derives the SQLite asset
```

The GTFS derivation lives in `scripts/`, not in the app. It runs on a developer
machine or in CI, consumes the 73.8 MB `stop_times.txt`, and emits the ~615 KB
of tables the app actually ships.

`TheBusClient` is an interface; the network implementation sits behind it. UI
code never touches a raw API response.

This buys three things: the JSON-vs-XML question stops being urgent, the
deferred proxy option remains a drop-in swap, and every screen becomes testable
against fixtures with no network.

## §3 Data

### The central interaction

The feature that no competitor provides, and the reason this project exists:

> Browse the network from where you are. See every stop nearby, see exactly which
> routes serve each one, and see every stop a given route calls at — without
> naming a destination first.

Google Maps requires a destination before it will reveal anything, then hides the
alternatives behind its chosen route. The old DaBus app exposed the raw network,
which is what made it possible to reject the suggested stop and find a better one
for the route you actually need.

This is a **static** relationship. Live arrivals cannot supply it: at 3am nothing
is arriving, yet Route 8 still serves that stop.

### What ships, and why the raw feed does not

`stop_times.txt` is 73.8 MB and cannot ship. But the route-to-stop relationship
is a *derived* table — the bulk of that file is per-trip timing detail the app
never needs. Both directions of the relationship were computed from the live feed
and measured:

| Derived table | Rows | Size |
|---|---|---|
| `stop_routes` — which routes serve a stop | 8,658 | 76 KB |
| `route_stops` — ordered stops per route/direction | 9,235 (236 pairs) | 125 KB |
| `stops.txt` | 3,847 | 418 KB |
| `routes.txt` | 118 | 5.4 KB |
| **Total raw CSV** | | **615 KB** |

1,419,279 `stop_times` rows collapse to 8,658 distinct `(stop_id, route_id)`
pairs — a roughly 1000x reduction. Distribution: median 2 routes per stop
(max 37), median 54 stops per route (max 374). Three of 3,847 stops are served
by no route.

A build-time script performs this derivation and emits SQLite. The raw
`stop_times.txt` is **an input to the build, never an app asset**.

An earlier draft of this spec excluded `stop_times.txt` outright, reasoning that
live arrivals answered the question. That was wrong: it answers "what is coming
now," not "what serves this stop." The derivation above preserves the size
discipline while restoring the feature.

A repo script preprocesses GTFS into a SQLite file shipped as an asset.
`expo-sqlite` with FTS5 handles stop-name search. Favorites live in
AsyncStorage, kept separate from reference data — user state with a different
lifecycle from bundled data.

Static data is treated as **reference only** — stop names, IDs, coordinates.
Anything time-sensitive comes from the live API.

### Verified feed source

```
https://www.thebus.org/transitdata/production/google_transit.zip
```

Confirmed live: HTTP 200, valid TLS, 12 MB, contents dated 2026-06-29.

**The widely-cited `webapps.thebus.org/transitdata/Production/...` URL is dead.**
That host now presents a certificate for `ots-sbc.thebus.org` issued by an Avaya
`System Manager CA` — it is a telephony session border controller, not a file
server. It returns 405 over HTTPS and times out over HTTP. Mobility Database
still lists the dead URL as the producer URL; do not use it.

### Measured contents

| File | Size | Bundled |
|---|---|---|
| `stops.txt` | 418 KB (3,847 stops) | yes |
| `routes.txt` | 5.4 KB (118 routes) | yes |
| `shapes.txt` | 9.8 MB | Increment 3 only |
| `stop_times.txt` | 73.8 MB | never |

The 424 KB v1 payload against 73.8 MB for `stop_times.txt` confirms the
exclusion decision quantitatively.

### Three properties that affect design

- **The feed declares an expiry.** `feed_info.txt` gives
  `feed_start_date=20260701`, `feed_end_date=20260822` — roughly an eight-week
  validity window. Bundled data therefore goes stale by design. This is low-risk
  for v1 because stop names and coordinates rarely change and no schedule data
  ships, but a refresh path is required before Increment 3 uses `shapes.txt`.
- **`route_color` and `route_text_color` are empty for every route.** Route
  colouring cannot come from the agency, so the app needs its own palette. This
  is a design opportunity rather than a gap, given the project's UX motivation.
- **`stop_code` matches the number printed on physical stop signage** (and
  equals `stop_id` in sampled rows). Searching by that number is the fastest
  path from standing at a stop to seeing its arrivals, and should be a
  first-class search input rather than an afterthought.

## §4 Error handling

Transit APIs fail often; this is a feature area, not a footnote.

- Every arrivals view distinguishes **loading**, **data with age**, and **error
  with last-known values**.
- A spinner never replaces cached data. Stale times remain visible with an
  explicit age ("updated 45s ago").
- "No buses coming" and "couldn't reach TheBus" must never render alike. That
  ambiguity is what makes a transit app untrustworthy at a stop at night.
- Poll interval **60s**, pausing when the app is backgrounded. Buses report
  position about once a minute and TheBus polls its own AVL system on a similar
  cycle, so the data cannot be fresher than roughly a minute regardless of how
  often it is requested. A 30s interval would double request volume against the
  250,000/day budget while returning identical payloads.

## §5 Testing

Jest + `jest-expo` + React Native Testing Library.

TDD applies to pure logic: response parsing, arrival-time math, search ranking.
These are tested against **recorded real API responses**, captured once an AppID
exists. Component tests cover the three view states from §4.

No E2E in v1 — it requires a device farm and does not earn its cost here.

## §6 Legal

Per the Oahu Transit Services terms, the app must carry attribution and a
non-affiliation disclaimer. These live as constants rendered in an About screen
so they cannot be silently dropped.

Working text, **pending verification against the actual user agreement**:

> Route and arrival data provided by permission of Oahu Transit Services, Inc.

> This app is not affiliated with or endorsed by Oahu Transit Services, Inc.

Personal / open-source use only. A commercial release would require reading the
full user agreement.

## Maps — deferred to Increment 3

Recommendation: **`react-native-maps`** over `expo-maps`. Both render Apple Maps
on iOS with no Google API key and no billing account. `expo-maps` requires a
development build, which on the free-sideload path forces the slow `.ipa` loop
for every native change; `react-native-maps` has historically shipped inside
Expo Go, preserving the fast iteration loop.

Expo Go's current bundled-module list must be confirmed before committing.

## Increment roadmap

| Increment | Scope | Needs API? |
|---|---|---|
| **0** | Prove Windows -> Actions -> .ipa -> SideStore -> iPhone. Trivial app. **Done.** | no |
| **1** | GTFS build script -> SQLite. Nearby stops by distance, search by name and stop number, favorites, and the routes serving each stop. | **no** |
| **2** | Live arrivals per stop with the §4 state model. Route detail with ordered stop list. | yes |
| **3** | Map: nearby stops, route polylines from `shapes.txt`, live vehicle positions. | yes |

Increment 1 requires **no API access at all** — it runs entirely on bundled
static data. The unresolved JSON field types therefore block nothing until
Increment 2.

## Home screen

The ideal home screen is a map of nearby stops. Maps are deferred to Increment 3,
so v1 ships the **list-shaped version of that same view**: stops sorted by
distance, each showing the routes that serve it, with favorites pinned above.

```
┌────────────────────────────┐
│ TheBus                  ⚙  │
│ 🔍  Stop # or name          │
├────────────────────────────┤
│ ★ FAVORITES               │
│   ALA MOANA CENTER    4544 │
│   8 · 20 · 40 · 42         │
├────────────────────────────┤
│ NEARBY                     │
│   KING ST + BISHOP     596 │
│   180 m · 2 · 13 · A       │
│                            │
│   HOTEL ST + ALAKEA   1075 │
│   240 m · 2 · 13           │
└────────────────────────────┘
```

Every stop row carries its route list, so the network is legible before tapping
anything. Tapping a stop opens arrivals (Increment 2); tapping a route opens its
ordered stop list (Increment 2).

This shape is chosen so Increment 3 replaces the *presentation* with a map over
an unchanged data model — nothing built in Increment 1 is discarded.

### Location

GPS "stops near me" is core, not optional. Distance sorting is what makes the app
useful somewhere unfamiliar, and it is precisely what the alternatives refuse to
do without a destination. `expo-location` is available in Expo Go, so it costs
nothing from the fast iteration loop.

Permission is requested on first use with a plain explanation. Denial is a
supported state, not an error: the app falls back to favorites and search, and
never blocks on location.

## Open questions

Resolved at AppID registration, all of which block Increment 2 and none of which
block Increments 0 or 1:

- Exact endpoint URLs, parameters, and response schemas
- Whether JSON is genuinely available (removing the XML parsing requirement)
- Published rate limits, which set the safe poll interval
- Whether the GTFS-RT feed is openly accessible and what message types it carries
- Exact required attribution wording
