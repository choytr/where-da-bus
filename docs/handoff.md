# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-10**, after Increment 9 was built end to end. All seven
tasks are implemented, committed and pushed to `dev`; CI is green; `npm ci` is
clean. **Nothing is half-built, and nothing has been on a phone yet.**

---

## Start here

**The next action is the device round, and it is Truman's.** An `.ipa` covering
all of Increment 9 is built and waiting:
`gh run list --workflow ios-ipa.yml` — run `31381336090` and later. Everything
below is written on the assumption that nobody has looked at it yet.

**Increment 9 is code-complete and unverified.** Spec:
`docs/superpowers/specs/2026-08-09-increment-9-show-on-map.md`. Plan:
`docs/superpowers/plans/2026-08-09-increment-9-show-on-map.md`, which now
carries a *What was built* note per task recording where reality disagreed with
the contract. Read those two before touching any of it; every decision in them
is Truman's and none is open.

### What shipped, in one line each

- **`route_directions` in the asset, `SCHEMA_VERSION` 2 → 3**, and the bundled
  floor rebuilt and committed with it. 333 headsign triples.
- **The other direction's buses are hidden**, which is what the "buses draw off
  the route line" report actually was.
- **Tapping a bus opens a popup** — fleet number, lateness *in words*, age — and
  hands a covered stop down on the next press.
- **Eight arrows along the route line**, a fixed pool, redistributed by arc
  length along the visible stretch.
- **A pill under the search bar** naming the route.
- **Long-press any row to get it on the map**, on `ActionSheetIOS`.
- **Tab icons, the arrivals screen's meta block, and the search filter reset.**

### What is owed, and in what order

1. **The device round.** Two were planned — after Task 4 and after Task 6 — and
   both were overtaken by the work finishing; the build on the shelf covers
   both. **The SIGABRT is open**, and the arrows and the direction filter both
   land in its code path, so this is not optional. If it fires, get the `.ips`
   and **write down the gesture** — every report before 2026-08-09 recorded the
   state and not the gesture, and the gesture turned out to be the half that
   mattered.
2. **Three things that can only be answered on a phone**, all recorded in
   `docs/backlog.md`: whether the 16 pt arrow markers eat taps meant for stop
   pins, whether the bus popup is readable at street scale, and whether text
   glyphs are acceptable as tab icons.
3. **Merging `dev` into `main` needs Truman's explicit permission.** The v3
   generation is already published — `gtfs-v3-20260810T105656Z.db` and
   `manifest-v3.json`, run `31381337991` — so that item is closed.

**Do not re-grill Increment 9, and do not re-open what its spec records as
settled.** In particular: the route pill needs no attribution work (ruled on
twice), long press gets no discoverability hint, opposite-direction buses are
hidden entirely, and the twelve ambiguous routes keep today's behaviour.

### What the crash actually was

**Two wholesale marker swaps in flight at once.** Not a render window, not a
timer, not `zIndex`. Truman reproduced it twice on purpose: **spamming the
direction control**, and **a flip followed quickly by the X**. Slow flips and
single presses never crashed, which is the whole reason four sessions read it as
intermittent — everyone recorded what was *on screen* and nobody recorded the
gesture.

Fixed by `swapBusyUntil` in `MapScreen`: one window shared by the controls,
sized at `CAMERA_MS`. A blocked flip is dropped, a blocked close is deferred and
then honoured. Two Jest tests cover both.

The undrawn buses were two unrelated things wearing one costume: a lone Route 10
bus running the *opposite* direction to the line on screen (drawn correctly, just
nowhere near where anyone was looking), and a real degradation where each
direction flip knocked the bus dots down a z-level and then off the map
entirely. The second is fixed by putting the direction in `BusMarker`'s key.

**`TRACKING_ALWAYS` was falsified, not vindicated.** With it removed the dots
draw on the first open with no gesture, so the 450 ms timer was innocent all
along — as `StopMarker` running the identical timer without the fault should
have suggested.

**What made the difference** was hitting the live fleet endpoint from the dev
machine, using the AppID still in `.env`, and telling Truman the coordinate to
look at. That turned "the bus isn't drawn" into "the bus is at 21.33185,
−157.85979 and you are looking at the other direction's line" in one round, with
no build and no instrument. Reach for it before instrumenting anything about
vehicles again.

**Measure, never read.** Five wrong claims in this project came from reasoning
about native source, and every theory in the backlog entry that came from
reading was wrong. Both fixes here came from Truman's gestures on a device.
Treat "it stopped reproducing" as provisional until he has abused it over a
sustained session — the `zIndex` precedent is exactly what that phrase is worth.

### Increments 7 and 8 — shipped, and collapsed to pointers

Both are merged and on `main`. Their records are their specs and plans, which
carry every settled decision and the measurements behind them:

- `docs/superpowers/specs/2026-08-09-increment-7-peek-and-search.md` — the sheet
  at rest, and search across stops, routes and addresses.
- `docs/superpowers/specs/2026-08-09-increment-8-routes-on-the-map.md` — routes
  on the map.
- `docs/superpowers/specs/2026-08-09-route-mode-ux-pass.md` — the UX pass over
  route mode, whose useful reframe was that **route mode drew the street-scale
  view at every scale**, and that the two backlog items about the map were one
  defect rather than two.

**Six things a cold session will otherwise get wrong**, kept here because they
are cheap to undo by accident:

- **`detentsFor` takes a measured height, never `useWindowDimensions()`.**
- **Every list in the app carries `flex: 1`.** Without it a scroll view sizes to
  its content, so its frame equals its content and there is nothing to scroll —
  while every scroll affordance still reports present.
- **No search classifier.** 73 route numbers are also valid stop codes.
- **Route search matches `short_name`, never `route_id`.** `route_id: '13'` is
  route 14; `route_id: '40'` is route **C**.
- **The search overlay is a sibling of `MapView`, never a child.**
- **Pin taps do not pan the map; row taps do.** Truman's call, made against the
  stated counter-argument.

**The compass is placed by a relationship, not a number**, and
`COMPASS_LAYOUT_OFFSET` — 54 pt down, 5 pt in — is the one measured constant.
Re-measure that pair if an SDK bump moves the compass; recompute nothing else.

## Where things stand

`main` is at Increment 8. **`dev` carries all of Increment 9.** 811 Jest across
51 suites, 145 `node --test`, a clean typecheck and a clean `npm ci` — all
verified locally on 2026-08-10, and CI green on every push.

**A v3 generation is published**: `gtfs-v3-20260810T105656Z.db` and
`manifest-v3.json`, from run `31381337991`. `manifest.json` still describes a
v1 generation and must keep doing so forever — it is compiled into binaries
already on phones. There is deliberately **no** `manifest-v2.json` from this
run, so the Increment 8 build on Truman's phone keeps reading the v2 generation
it already has until the v3 `.ipa` replaces it.

**The bundled floor was rebuilt and committed with the schema bump**, which is
the sanctioned exception to the never-rebuild rule. Note the published v3
database is built from a *newer* feed than the committed floor — 560 shapes
against 532 — which is the design working, not a discrepancy.

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
| 8 | Routes on the map, and a UX pass over route mode |
| 9 | *Show me that on the map* — long-press menus, the bus popup, arrows, the route pill |

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

**A screenshot is worth more than a description of one, and it does not
survive.** Three shots on 2026-08-09 overturned a framing two backlog entries
had held for a day — the clutter was one zoom problem, not two independent
defects — and neither entry could have been written from the words alone.
Transcribe them into a log the moment they arrive.

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

## Suggested skills

- **Nothing, until the `.ipa` has been on the phone.** Increment 9 is built and
  its whole-diff review has run; what it needs is a rider, not a session.
- **Not `grilling`, not `brainstorming`, not `writing-plans`** for Increment 9.
  It was grilled on 2026-08-09 and every decision is written down.
- **Not `superpowers:systematic-debugging` for the SIGABRT.** It is open and
  deliberately unchased; chasing it is the thing Truman asked not to spend
  another evening on. If it fires on this build, record the **gesture**.
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
