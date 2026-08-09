# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-09**. **Increments 1–6 are shipped, device-verified and
merged.** **Increment 7's nine tasks are all written and green on `dev`**; what
is left is its close-out — a screenshot round, a device round, and a review over
the whole diff. `main` is still at Increment 6.

---

## Start here

Read, in order:

1. `docs/superpowers/specs/2026-08-09-increment-7-peek-and-search.md`
2. `docs/superpowers/plans/2026-08-09-increment-7-peek-and-search.md`

**The next action is the close-out**, in this order:

1. **A screenshot round with Truman** — the map's search bar against ⌖ and the
   *Search this area* pill, and the fullscreen search on all three filters.
   Every one of those placements is provisional and none of it has been seen.
2. **A device round**: `gh workflow run ios-ipa.yml --ref dev`.
3. **A review over the whole diff**, at the increment boundary, per `CLAUDE.md`.

Do not re-grill the increment and do not re-open what the spec settled.

### What Increment 7 built

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

**Increment 8 has a name: *routes on the map*** — a route result drawing that
route's stops, polylines, and the one-bus-behind-a-single-arrival view. All
three mount children inside `MapView`, which is why they are together and why
they are not in 7.

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

`dev` is ahead of `main` by the whole of Increment 7. **529 Jest, 91
`node --test`, clean typecheck, clean `npm ci`** — the last verified again after
Task 9.

**The sheet is device-verified and Truman is happy with it.** 2026-08-09: "Ok I
like this a lot better… This is perfect." **The search is not** — nothing about
Tasks 8 and 9 has been on a phone or in front of him.

**One thing to raise at the screenshot round rather than fix unasked:** in
Address mode, `ResultList`'s *"Type an address, then search."* hint shows only
while the field is empty, so once a rider has typed there is nothing on screen
telling them the return key is what runs it. `returnKeyType="search"` is set,
which is as far as this went without redesigning a settled component.

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
| 7 | The sheet at rest, and search across stops, routes and addresses *(written, not yet device-verified)* |

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

## Suggested skills

- **Not `grilling`** for the rest of Increment 7 — it has had its grilling
  (2026-08-09) and the spec records what it settled. The skill comes back out
  for Increment 8, and Truman expects it.
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
