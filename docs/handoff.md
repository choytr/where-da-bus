# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-09**. **Increments 1–7 are shipped and merged**, and
`main` is at Increment 7. Increment 7's whole-diff review came back with one
cosmetic finding, now in `docs/backlog.md`; its device round passed but was
recorded only collectively — see the caveat in
`docs/superpowers/logs/2026-08-09-increment-7-device-round.md`, which matters if
a list turns out not to scroll.

---

## Start here

**Increment 8's grilling is COMPLETE. The next action is to write its spec and
plan**, from the settled decisions in the *Increment 8* section at the foot of
this file. Do not re-grill it, and do not re-derive its measurements — several
cost a 73 MB file parse and one overturned a premise this document previously
asserted.

Nothing is owed on Increment 7. It is merged.

Increment 7's spec and plan are
`docs/superpowers/specs/2026-08-09-increment-7-peek-and-search.md` and its plan.
Do not re-grill it and do not re-open what the spec settled.

### What Increment 7 built — shipped, for reference

The map sheet's detents are points computed from a **measured** container. Its
resting peek is the grab handle, a band naming the mode, and one row. Tapping a
row in the sheet centres the map on that stop; tapping a pin does not. The Stops
tab has `Stops | Routes` chips over one shared search engine (`useSearch`), and
a nudge that offers the filter which would have answered.

The map now carries a **persistent search bar** — a button wearing a field's
clothes, `features/map/SearchBar.tsx` — opening a **fullscreen search**
(`SearchOverlay.tsx`) with all three filters, defaulting to Address. A stop
result anchors the map, frames the camera and opens the card **without leaving
the map**, which is the only thing this host does that the Stops tab cannot. A
route result opens `/route/[id]`. Address mode geocodes on submit and asks
*"Did you mean 2500 Campus Rd, Honolulu?"* before anything moves;
`features/map/address.ts` holds that lookup and its labelling, both with their
network calls injected so they test without the native module.

**Six things a cold session will otherwise get wrong:**

- **`detentsFor` takes a measured height, never `useWindowDimensions()`.** The
  tab scene is inset above the tab bar; computing against the window breaks the
  peek and the tallest detent simultaneously, and looks like two bugs.
- **No classifier.** 73 route numbers are also valid stop codes — `40` is both
  Route 40 and stop 40 — and an address heuristic would refuse exactly the
  queries the device probe proved work. The chips exist because inference is
  impossible.
- **Pin taps do not pan the map; row taps do.** Truman's call, made against the
  stated counter-argument.
- **Route search must match `short_name`, never `route_id`.** `route_id: '13'`
  is route `14`; `route_id: '40'` is route **C**.
- **The search overlay is a sibling of `MapView`, never a child.** The rule the
  map section of `docs/backlog.md` exists for, and the one with a SIGABRT behind
  it.
- **Searching *frames* the camera; the long press *pans* it.** Both anchor the
  same way. A typed address or a searched stop is the map being opened somewhere
  else, so the window is rebuilt from the query radius; a long press names a
  point on a map the rider is already looking at, at a zoom they chose.

**Increment 8 is *routes on the map*, and its grilling is finished** — see the
section at the foot of this file, which carries every settled decision and the
measurements behind them.

### Address search — built, and untried on a device

`data/geocode/oahu.ts` is consumed by `features/map/address.ts`, which
`SearchOverlay` calls on submit. **`SearchOverlay` is the only file that imports
`expo-location` for this**, which is what keeps the lookup testable without the
native module.

- **The geocoder has no regional bias**, and biasing it is a two-step dance with
  a fallback, because the steer that rescues `"beach"` from *Montana* also
  breaks `"ala moana beach"`. That is all handled; do not simplify it away.
- **A failed reverse lookup must not lose a good geocode.** The point is already
  known to be on the island; the confirmation is asked against what the rider
  typed instead. There is a test named for this.
- **`formattedAddress` is Android-only** and `null` here, so the label is built
  from `streetNumber`, `street`/`name` and `city`.
- **Autocomplete is out, re-verified 2026-08-09** against the installed type
  definitions. `geocodeAsync` returns `{ latitude, longitude, altitude?,
  accuracy? }` — nothing printable — and one result every time, so a suggestion
  list costs two round trips per keystroke to render one row, and `CLGeocoder`
  throttles per app. The shipped shape is geocode on submit, reverse-geocode,
  and a single **"Did you mean…?"** confirmation.

## Where things stand

`dev` and `main` are level at Increment 7. **539 Jest across 38 suites, 91
`node --test`, clean typecheck** — verified locally 2026-08-09 immediately
before the merge.

**The sheet and the search have both been through Expo Go**, over five rounds on
2026-08-09, and Truman is happy with them. On the sheet: "Ok I like this a lot
better… This is perfect." `MEDIUM_FRACTION` is his and he settled it at
`0.4985`; `PEEK_BAND` and `PEEK_ROW` are the other two knobs. **Expo Go is not
the `.ipa`** — the device round in section 1 of the checklist is still what
confirms the scrolling.

**What those five rounds changed, so it is not undone by accident:**

- **Every list in the app carries `flex: 1`.** A scroll view that is a flex
  child of a sized column without it sizes to its *content*, so its frame equals
  its content and there is nothing to scroll — while every scroll affordance
  still reports present. `08e189d` found this in one list on 2026-08-08 and
  fixed only that one; the other six followed on 2026-08-09.
- **`LEGEND_GAP` in `lib/Attribution.tsx`** is the single number for the air
  above a pinned legend. It replaced `insets.bottom + 24` on the screens that
  pin the legend at the display's foot — once the legend takes the inset itself,
  a list reserving it too pays for it twice, and the result was a visible band of
  dead space.
- **The compass is placed by a relationship, not a number:**
  `compassTop = controlsTop + CONTROL_SIZE + CONTROL_INSET` puts it under ⌖ with
  the same gap ⌖ has under the search bar. The one measured constant is
  `COMPASS_LAYOUT_OFFSET` — 54 pt down, 5 pt in — which is what MapKit adds
  between the margins it is given and where it actually draws. **Re-measure that
  pair if an SDK bump moves the compass; recompute nothing else.**
- **There is no `idle` location banner.** *"Showing downtown Honolulu"* flashed
  on every launch because `onMapReady` calls `requestLocation()` from `idle`, so
  `idle` lasts from the map's first frame to the request going out. Only
  `denied` and `error` are states a rider sits in, and both say what to do.
- **The nudge auto-submits into Address mode; the Address *chip* does not.** A
  chip is a mode change; the nudge is a rider answering a question with yes.

**Two tests were rewritten to assert relationships rather than literals**, after
Truman's own tuning broke one: the medium-detent framing test and the compass
placement test both compute their expectations from the screen's own helpers, so
turning a knob no longer breaks a test about something else. Copy that shape.

## Read these, in this order

1. `CLAUDE.md` — the traps, and how work gets done here.
2. `docs/backlog.md` — triaged defects. Read the map section before touching
   `react-native-maps`; it carries a rule that is worth more than the three
   fixes that produced it.
3. `docs/superpowers/specs/2026-07-29-wheredabus-design.md` — scope and
   sequencing. Several claims carry dated inline corrections; trust those.
4. `docs/api/README.md` — the live API, verified against the vendor PDFs and the
   live service. **Do not re-read the PDFs to re-derive what it already
   records.**

Each increment has a spec and a plan under `docs/superpowers/`, and each plan
carries a *What was built* section recording where reality disagreed with it.
Read the plan for the increment you care about rather than the diff.

| Increment | What it added |
|---|---|
| 1 | Nearby stops, search, favorites, the bundled GTFS asset |
| 2 | expo-router, the arrival board, route detail |
| 3 | The map, and a UX pass over its bottom sheet |
| 4 | Each user brings their own AppID; no secret in the build |
| 5 | The data refreshes itself, from a weekly Action |
| 6 | Six correctness fixes, then a screenshot-driven UI pass over the map |
| 7 | The sheet at rest, and search across stops, routes and addresses |

Increment 6's record is `docs/superpowers/specs/2026-08-04-increment-6-correctness-and-ui.md`,
its plan, and `docs/superpowers/logs/2026-08-04-increment-6-ui.md` — the UI log
is the substantial one, four rounds of findings marked *observed* or *inferred*
line by line.

## Working agreement with Truman

- **Work on `dev`. Merging to `main` needs his explicit permission every time.**
- **Push at a task boundary or when he asks — never after an individual fix or
  a round of device feedback.** Every push to `dev` runs the Tests workflow. He
  has said this twice, the second time in caps (2026-08-09): "STOP PUSHING TO
  DEV SO MUCH — what if we just push after a big task instead of after every
  little change." Commit as often as is useful; that is free. Verify locally
  every time, because CI is no longer catching anything per-commit.
- He drives largely from his phone and prefers autonomous execution: do the
  work, report honestly, ask only when the answer changes what you would build.
- **He starts the dev server himself.** Never run `npm start` or `npx expo
  start`. `npm ci`, the test commands and `gh workflow run` are ours.
- **He explains decisions best once he can see the mechanism.** He has overseen
  every architectural choice but has not read most of the code. State how the
  thing works — concretely, with file references — before asking him to choose.
- **He also writes code here**, and is learning Expo on this project. Review it
  like anyone's, say what you find, and leave the fix to him unless he asks.
- **He defers pixel-level UI choices** until he can hold a prototype. Record
  those as provisional rather than pressing for an answer.
- **Screenshots live in `~/wheredabus-screenshots/<date>/`, outside this
  repository**, because the repo is public and the map shots place him closely.
  Transcribe findings into a log as soon as they arrive — **images do not
  survive a context compaction and text does.**

## Lessons worth carrying forward

**Anything about how the app *looks* is inference until Truman confirms it.**
There is no simulator here and no device on this side. Say which of the two you
are doing, every time.

**Reading native source is not measuring, and this includes layout.** Six wrong
claims so far. The map crash's two recorded causes were both readings; one
`.ips` file off the phone settled in a single look what six weeks of reasoning
had not. The sixth was Increment 7 asserting that the tab bar overlaid the map
scene when it does not, which broke the sheet at both ends. **Get the
artefact** — and where the artefact is a layout, prefer a formula that measures
over one that has to be told.

**Expo Go crashes are logged, under `Expo Go-…` rather than the app's name**
(Settings → Privacy & Security → Analytics & Improvements → Analytics Data).
This repo's docs implied a standalone build was needed for a stack trace. That
was wrong and it cost days.

**Anything reaching the app through the environment will be absent in CI, and
Expo Go will not show you.** Expo Go reads the developer's local `.env`; a CI
runner has none. The variable that taught this is gone, the shape of the failure
is not.

**A probe that prints both the raw value and the interpretation earns its
keep.** The geocoder's `, HI` steer breaking `"ala moana beach"` was findable
only because the throwaway probe showed the unbiased reply beside the verdict.

## Two questions already answered — do not re-ask

- **Can the phone parse the GTFS feed itself?** Measured: 964 MB peak RSS, and
  iOS kills the app well before that. A streaming rewrite is feasible and
  remains the endgame. Numbers in Increment 5's spec.
- **Is there a GTFS-Realtime feed that removes the need for a key?** Yes, and
  no — it exists, served by Swiftly, and needs a Swiftly key instead. Full
  finding in Increment 4's spec.

`docs/superpowers/specs/2026-08-02-thebuslive-comparison.md` reads an
independent unofficial app against ours. Both of its actionable findings are
built. Read it before touching the vehicle endpoint or the map.

## Increment 8 — *routes on the map*. Grilled 2026-08-09, settled, unbuilt

**The grilling is finished and every decision below is Truman's.** Do not
re-open them. The next action is a spec and a plan.

### What a rider gets

Pick a route on the map and **the map draws it and stays** — it does not
navigate to `/route/[id]` any more. It draws the route's real road line, that
route's stops as the map's pins, and the buses actually driving it right now.

- **One direction at a time**, named by where it ends up — reuse
  `RouteScreen`'s existing `Toward <last stop name>` wording
  (`features/routes/RouteScreen.tsx:44`), because GTFS's `0`/`1` tells a rider
  nothing. A flip control switches. **Truman asked for the current direction to
  be made unmistakable in the UI**; the treatment is his to confirm on device.
- **The sheet carries the route's full stop list in order** — a third sheet
  mode. Its band must be exactly `PEEK_BAND` tall like the other two, or the
  resting sheet twitches (`features/map/peek.ts:4`).
- **An X leaves route mode, and nothing else does.** Panning does not drop it;
  leaving the tab and coming back does not drop it. Both were put to him
  explicitly.
- **Each bus is labelled with its fleet number and the age of its last report** —
  e.g. `252 · here 20 s ago`. Truman asked for this by name, after the old
  DaBus app.
- **Tapping an arrival highlights the bus already on screen**, joined on trip id.

### The data — and a premise this file previously got wrong

**The old claim that shapes cost "an asset several times its size" was wrong,
and it is why polylines nearly got cut.** 9.8 MB is the raw CSV: full
precision, redundant columns, all 532 variants. Measured 2026-08-09 as actually
*stored* — Douglas–Peucker simplified, encoded polyline, against the 1.17 MB
asset:

| stored | 5 m | 10 m | 20 m |
|---|---|---|---|
| all 532 shapes | 201 KiB | **152 KiB** | 116 KiB |
| 236, one per route+direction | 97 KiB | 73 KiB | 56 KiB |

**Settled: all 532 shapes, keyed by `shape_id`, simplified at 10 m — ~152 KiB.**
Not the cheaper 236, because **every live arrival carries a `shape` field naming
the exact variant that bus is running** (`docs/api/README.md:162`, present on
all 25 rows of `arrivals-mixed.json`). Storing only a representative per
direction would draw a short-turn or express bus beside a line it is not on.
The route view draws the representative; the bus view draws the named variant.

**The cheap connect-the-stops line is dead, and was killed by measurement, not
argument.** Comparing the representative trip's stops against *that same trip's*
real shape, 236 route/directions, 132,332 points: median deviation 29 m, p90
**1.3 km**, p99 **5.6 km**, worst **7.3 km** (route 60, both directions).
**202 of 236 route/directions are ≥150 m wrong at their worst; none is under
50 m.** It is fine in town and draws straight through Kāneʻohe Bay on the
express and rural runs. Do not revive it.

**`route_stops` is one representative trip, not a union** — `derive.mjs:150`
picks the trip visiting the most stops per route+direction. Comparing its stops
against a *different* trip's shape inflates the error badly; that mistake was
made and corrected on 2026-08-09.

### The buses — the fleet endpoint, not the arrival's own position

**Settled: every live bus on the route, not the one bus behind an arrival.**
The spec'd one-bus view is available for only about 1 arrival in 10 — in the
real 25-arrival capture, **23 of 25 carry the `"0"` position sentinel**, because
position exists only for `estimated: "1"` and `docs/api/README.md` records 96%
of sampled arrivals as the undocumented `"2"`. A feature that is a dead end nine
times out of ten is worse than one that is absent.

- **The fleet endpoint is the only route to fleet-wide positions** and is **XML
  only** — `docs/api/README.md:215`. Omit `num` and one request returns every
  bus on Oahu: 1,184 elements, 333 KB, 29 KB gzipped. `route=` does **not**
  filter; filtering is ours to do client-side.
- **A freshness filter is mandatory, not hardening.** Most of that response is
  dead buses carrying *plausible Oahu coordinates* — 929 stale ones in the
  daytime sample. Unfiltered, it draws ~1,100 ghosts parked since 2022.
- **Settled: a 5-minute window, applied as one rule in both directions** — a bus
  is drawn while its last report is fresh and leaves the map when it stops being
  fresh. The data makes this nearly judgement-free: 232 of 235 live buses
  reported within five minutes and **the next-freshest was over ten hours old**.
  Because the age is computed from the bus's own `last_message`, **a failed
  fetch needs no special case at all** — the labels simply keep counting up and
  the buses age off on their own. An earlier proposal for a separate two-minute
  outage timer was dropped; do not reintroduce it.
- **Poll every 60 s**, matching `features/arrivals/useArrivals.ts:28` and for the
  same reason recorded there.
- **`data/thebus/time.ts:89` already parses `<last_message>`'s
  `M/D/YYYY h:mm:ss AM`**, including the UTC−10 trap that makes `Date.parse`
  wrong every evening. The age is a subtraction, not new work.
- **`<driver>` is an employee number and must be dropped at the parse
  boundary**, not merely left unrendered. It is right there next to
  `<number>` — the fleet number, which *is* what gets displayed.
- **17 of 235 live buses report no route**, so some real buses cannot be
  attributed to the route being viewed and will be left off. Known, accepted.

### The schema bump, and the floor

`SCHEMA_VERSION` goes **1 → 2**. **Truman authorised rebuilding and committing
the bundled floor** (`assets/db/gtfs.db`, 1.17 MB → ~1.32 MB) so a fresh offline
install still draws lines. This is the sanctioned exception to `CLAUDE.md`'s ban
on rebuilding it by hand — the ban is against casual rebuilds, and a bump leaves
no choice: the queries would otherwise ask the floor for a table it lacks.

**The bump commit and the floor rebuild must land together.** Either alone
leaves the app asking for something it cannot get. The weekly Action publishes
**both v1 and v2** generations from here on, so an old sideloaded build keeps
receiving fresh data — there is no App Store to push a fix through.

### Chosen without asking him, per the working agreement

Tapping a route stop in the sheet centres the map on it, matching Increment 7's
row-taps-pan / pin-taps-don't rule. Tapping a bus does nothing yet. The XML
parser is hand-rolled rather than a dependency — the document is flat and Expo
Go's ceiling makes every package a real cost.

### Deferred, in `docs/backlog.md`

**Where a bus's lateness is shown.** `adherence` gets parsed and carried in the
model so surfacing it later is a UI change, not a data change. Truman ruled it
off the bus label — which already carries two facts — and wants it elsewhere on
the map, but deferred placement until he can see it. Positive means **early**;
nothing bounds it to ±60.

### The risk to plan around

**Buses move, so markers are added and removed every 60 s** — far more tree
churn than stops, which change only on a pan. That is the same seam as the
SIGABRT at `docs/backlog.md:165`, which is fixed but never proven gone. **The
live-bus layer goes on a device early, not at the end.** The label rules from
that entry are non-negotiable: labels **always mounted** and hidden with
`opacity` rather than conditionally rendered, and `position: 'absolute'` so they
sit outside the marker's frame.

### Unknowable from here — do not assert either

- **How often the arrival→bus highlight lands.** It needs a live call with
  Truman's AppID, which is in his keychain. Build it to light up when the join
  succeeds; promise no hit rate.
- **How any of it looks.** No simulator and no device on this side.

## Suggested skills

- **Not `grilling`.** Increment 8's is finished and its decisions are above.
  Reopening them wastes the session and re-argues settled calls.
- **`superpowers:writing-plans`** is the next skill, for Increment 8's spec and
  plan. `superpowers:requesting-code-review` again at that increment's boundary.
- **`superpowers:systematic-debugging`** — whenever the app's *appearance* or a
  native-layer bug comes up. It is what stopped a fix being aimed at a cause the
  backlog merely asserted.
- **Not `dispatching-parallel-agents` or `subagent-driven-development`.**
  `CLAUDE.md` is explicit: execute inline, review once at the boundary.

## Environment notes

- Windows/WSL2, no Mac, no paid Apple Developer account. iOS builds run only on
  GitHub Actions. `/ios` and `/android` are prebuild output — never commit or
  hand-edit them, and note that they are therefore **not readable here**, which
  is why native behaviour has to be measured rather than looked up.
- **`workflow_dispatch` fires only for a workflow that exists on `main`** — but
  it may then be run against any ref. `gh workflow run ios-ipa.yml --ref dev`
  works and is how a branch gets an `.ipa` without merging.
- **The repo is public**, so GitHub-hosted runners are free, macOS included.
- SDK pinned to 54 by the Expo Go ceiling. Install with `npx expo install`,
  never bare `npm install <pkg>`, never `npm audit fix --force`. The outstanding
  audit advisories are all in the web-build and prebuild toolchains, none reach
  the device, and they are triaged — do not "fix" them.
- **`expo-asset` is not resolvable from the project root** — npm nests it under
  `node_modules/expo/`, so anything importing `data/gtfs/files.ts` must double
  `expo-sqlite` under Jest. Metro resolves it fine on device.
- **WSL is in mirrored networking mode** plus a Hyper-V firewall rule
  `ExpoGo8081` allowing inbound TCP 8081. If Expo Go stops connecting, check
  those before suspecting the app.
- The API PDFs need `node scripts/pdf-text.mjs <file>`; `Read` cannot open them.
  It breaks lines mid-word, so pipe through `tr -d '\n'` to grep for a phrase.
- **The first scheduled `gtfs-data.yml` run is Monday 2026-08-10, 12:00 UTC.**
  Nothing has yet run unattended. Check with
  `gh run list --workflow gtfs-data.yml`. **A run that exits `changed=false` is
  the expected outcome most weeks**, not a failure.
