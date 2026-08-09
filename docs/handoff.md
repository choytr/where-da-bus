# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-09**. **Increments 1–7 are shipped and merged**, and
`main` is at Increment 7. Increment 7's whole-diff review came back with one
cosmetic finding, now in `docs/backlog.md`.

**Increment 7's device round never happened.** This file previously said it
passed; Truman said on 2026-08-09 that he had not run it. Every box in
`docs/superpowers/logs/2026-08-09-increment-7-device-round.md` is still unticked
and those checks are still owed — they are folded into Increment 8's round 2.
The five **Expo Go** rounds did happen and are not in question; what never
happened is the `.ipa`, which is the artefact that differs. This is how the
sheet's lists came to be unable to scroll on a real build through two whole
increments without anyone noticing.

---

## Start here

**Increment 8 is built and verified on a device. Nothing is broken and nothing
is owed from the device rounds.** Route mode, the red route line, the live
buses and the sheet's scrolling have all been seen working on an `.ipa` —
Truman, 2026-08-09: *"Everything looks good."*

**The next action is a short round of small changes Truman has in mind, then a
review pass over the whole diff, then the merge to `main`** — which needs his
explicit permission. Ask him what the small changes are; they were not specified
before the context was cleared.

`docs/backlog.md` takes what is not worth fixing now — **where `adherence` is
shown**, **stop pins covering the route line**, and **bus labels being
unreadable among the stop pins**. The last two are Truman's own calls from the
device rounds.

**The device-round checklist is retired as a practice.** Truman ended it on
2026-08-09: *"drop them / mark them as fine, honestly. We'll fix bugs as I come
across them."* Do not write another one and do not resurrect the unticked boxes
in `2026-08-09-increment-8-device-round-2.md` as owed work. What earned its keep
was the *instrumented* check — one number on screen answered in a glance what
four rounds of reasoning could not — so instrument, ask for one reading, and
stop.

Do not re-grill the increment, and do not re-derive its measurements — several
cost a 73 MB file parse and one overturned a premise this document previously
asserted. They are all in the spec,
`docs/superpowers/specs/2026-08-09-increment-8-routes-on-the-map.md`, which is
their permanent home. The plan carries a *What was built* note per task
recording where reality disagreed with it.

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

**Increment 8 is *routes on the map*, and it is specced and planned** — see the
pointer at the foot of this file, and the spec, which carries every settled
decision and the measurements behind them.

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

`main` is at Increment 7. **`dev` is seven commits ahead with all of Increment 8
built and unverified on a device.** 651 Jest across 44 suites, 130 `node --test`,
clean typecheck and clean `npm ci` — verified locally 2026-08-09.

**The sheet's lists could not scroll on any real build, for two increments, and
that is fixed.** The content column was `flex: 1` against a parent that
`@gorhom/bottom-sheet` leaves unbounded until it has measured its container, so
a list sized itself to its rendered rows — measured at **2846 pt inside a sheet
730 pt tall**. `flex: 1` is kept, because it is the library's design and is what
keeps the pinned legend on screen at every detent; a `maxHeight` off the tallest
detent now guards the window before the measurement lands. **It was never an
Expo Go versus `.ipa` difference** — that was a red herring that cost four
eliminations; a short list fits inside a huge frame and looks fine.

**Three things in that diff would be silently got wrong.** The bundled floor was
rebuilt and committed with the schema bump, as authorised. `manifest.json` must
keep describing a **v1** generation forever, because it is compiled into binaries
already on phones. And a stored pointer says nothing about the *schema* of the
file it names — `isReadableGeneration` is what stops a v2 binary opening the v1
generation still sitting on Truman's phone.

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

## Increment 8 — *routes on the map*. Specced, planned, unbuilt

Grilled 2026-08-09 and **every decision is settled and written down**. The long
version that used to live here has moved, in full and with its measurements, to:

- `docs/superpowers/specs/2026-08-09-increment-8-routes-on-the-map.md` — what is
  being built, what was settled and why, the numbers behind it, and what is
  inference rather than fact.
- `docs/superpowers/plans/2026-08-09-increment-8-routes-on-the-map.md` — seven
  tasks, contracts and test names. **Start at Task 1.**

**Four things the next session must not undo, restated because undoing any of
them is silent:**

- **`assets/db/gtfs.db` gets rebuilt and committed with the `SCHEMA_VERSION`
  bump, in the same commit.** Truman authorised it; it is the sanctioned
  exception to `CLAUDE.md`'s ban on rebuilding the floor by hand.
- **`manifest.json` must keep describing a *v1* generation forever.** That URL is
  frozen inside binaries already on phones, and publishing a v2 manifest there
  switches their updates off permanently. Task 2 and the spec explain the whole
  mechanism.
- **`<driver>` is an employee number.** The model carries no field for it.
- **The bus layer and the polyline each get a device round before the end of the
  increment**, not after it — Tasks 4 and 6. Both are the marker-churn seam with
  a SIGABRT behind it.

Two things remain genuinely unknowable from here and must not be asserted: **how
often the arrival→bus highlight lands** (it needs a live call with Truman's
AppID) and **how any of it looks** (no simulator, no device on this side).

## Suggested skills

- **Not `grilling`, and not `writing-plans`.** Increment 8's grilling is
  finished, and its spec and plan are written. Reopening either wastes the
  session and re-argues settled calls.
- **`superpowers:executing-plans`** is the next skill, for Increment 8's plan,
  starting at Task 1. `superpowers:requesting-code-review` again at that
  increment's boundary.
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
- **A stale `.env` sits in the working tree** carrying the retired
  `EXPO_PUBLIC_THEBUS_APP_ID`, so every `npx expo` command prints
  `env: export EXPO_PUBLIC_THEBUS_APP_ID`. Increment 4 removed everything that
  read it and no build injects it. Harmless noise, not a leak — the file is
  gitignored and CI has no such value.
- **`npx expo prebuild` rewrites `package.json`**, adding `ios` and `android`
  scripts. It was run once locally to read `ios/Podfile.properties.json` while
  chasing the scroll bug; `/ios` was deleted and `package.json` reverted
  afterwards. If those scripts reappear in a diff, that is where they came from.
- **The first scheduled `gtfs-data.yml` run is Monday 2026-08-10, 12:00 UTC.**
  Nothing has yet run unattended. Check with
  `gh run list --workflow gtfs-data.yml`. **A run that exits `changed=false` is
  the expected outcome most weeks**, not a failure.
