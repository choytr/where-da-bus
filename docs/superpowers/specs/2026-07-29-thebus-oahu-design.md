# TheBus Oahu — Design

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

## Constraints

| Constraint | Value |
|---|---|
| Dev machine | Windows (WSL2). No Mac, no Xcode. |
| Target device | iPhone XR, iOS 18 minimum |
| Distribution | Free sideload via SideStore/AltStore. No paid Apple Developer account. |
| Data layer | In-app parsing. No backend service. |
| Maps | Deferred to v2 (not in v1 scope) |

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

### Unverified — must be pinned down after AppID registration

Exact endpoint URLs, parameter names, response field names, rate limits, and the
precise attribution wording all sit behind PDFs gated by AppID registration.
None are invented here; the API surface is treated as a boundary to resolve once
credentials exist.

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

This split holds *only if v1 restricts itself to modules Expo Go already
bundles*. That is a hard design constraint, and the second reason maps are
out of v1 scope.

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
  stops/      search, favorites
  arrivals/   arrival board
data/
  thebus/     TheBusClient interface + network implementation
  gtfs/       bundled static reference data (SQLite)
  storage/    favorites persistence
lib/          time, geo
```

`TheBusClient` is an interface; the network implementation sits behind it. UI
code never touches a raw API response.

This buys three things: the JSON-vs-XML question stops being urgent, the
deferred proxy option remains a drop-in swap, and every screen becomes testable
against fixtures with no network.

## §3 Data

**v1 bundles `stops.txt` and `routes.txt` only (~1 MB). `stop_times.txt` is
excluded.** The live arrivals endpoint already answers "what is coming to this
stop," which is the actual feature. Browsable timetables would require
`stop_times.txt` (tens of MB) and are deferred until the need is demonstrated.

A repo script preprocesses GTFS into a SQLite file shipped as an asset.
`expo-sqlite` with FTS5 handles stop-name search. Favorites live in
AsyncStorage, kept separate from reference data — user state with a different
lifecycle from bundled data.

Oahu's static GTFS feed scores poorly on freshness (GTFS Scorecard grade F).
Static data is therefore treated as **reference only** — stop names, IDs,
coordinates. Anything time-sensitive comes from the live API.

## §4 Error handling

Transit APIs fail often; this is a feature area, not a footnote.

- Every arrivals view distinguishes **loading**, **data with age**, and **error
  with last-known values**.
- A spinner never replaces cached data. Stale times remain visible with an
  explicit age ("updated 45s ago").
- "No buses coming" and "couldn't reach TheBus" must never render alike. That
  ambiguity is what makes a transit app untrustworthy at a stop at night.
- Poll interval 30s, matching TheBus's ~1 min AVL refresh. Polling pauses when
  the app is backgrounded.

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

## Maps — deferred to v2

Recommendation: **`react-native-maps`** over `expo-maps`. Both render Apple Maps
on iOS with no Google API key and no billing account. `expo-maps` requires a
development build, which on the free-sideload path forces the slow `.ipa` loop
for every native change; `react-native-maps` has historically shipped inside
Expo Go, preserving the fast iteration loop.

Expo Go's current bundled-module list must be confirmed before committing.

## Increment roadmap

| Increment | Scope |
|---|---|
| **0** | Prove Windows -> Actions -> .ipa -> SideStore -> iPhone. Trivial app. |
| **1** | Stop search over bundled GTFS; favorite/unfavorite; persistence. |
| **2** | Live arrivals board per stop, with the §4 state model. |
| **3** | Map: nearby stops, route polylines from `shapes.txt`, live vehicles. |

## Open questions

Resolved at AppID registration, all of which block Increment 2 and none of which
block Increments 0 or 1:

- Exact endpoint URLs, parameters, and response schemas
- Whether JSON is genuinely available (removing the XML parsing requirement)
- Published rate limits, which set the safe poll interval
- Whether the GTFS-RT feed is openly accessible and what message types it carries
- Exact required attribution wording
