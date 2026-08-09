# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-09**. **Increments 1–6 are shipped, device-verified and
merged.** `dev` and `main` are level. **Increment 7 is specced and planned; no
code is written yet.**

---

## Start here

**Increment 7 was grilled on 2026-08-09 and is ready to execute.** Read, in
order:

1. `docs/superpowers/specs/2026-08-09-increment-7-peek-and-search.md`
2. `docs/superpowers/plans/2026-08-09-increment-7-peek-and-search.md`

**The next action is Task 1.** Do not re-grill it and do not re-open the
decisions the spec records — several of them look obviously wrong until you read
the measurement underneath.

### Increment 7 in one paragraph

The map sheet's collapsed height becomes a computed number of points sized off
the *selected-stop card*, so the peek shows a real stop row instead of ~16 pt of
nothing, and no sheet content ever renders under the tab bar again. Tapping a
row centres the map on that stop in the part of it a rider can actually see.
Then a search with three filter chips — **Address / Stops / Routes** — across
two hosts: the Stops tab gains Routes, and the map gains a persistent bar
opening a fullscreen search that defaults to Address.

**Four things a cold session will otherwise get wrong:**

- **Headings are dropped.** They were Truman's own opening proposal and he
  withdrew them during the grilling. Once the peek shows a real row, a
  `StopRow` and the card's ‹ Back bar are already unmistakable.
- **No classifier.** 73 route numbers are also valid stop codes — `40` is both
  Route 40 and stop 40 — and an address heuristic would refuse exactly the
  queries the device probe proved work. The chips exist because inference is
  impossible, not because it was too much effort.
- **Pin taps do not pan the map; row taps do.** Truman's call, made against the
  stated counter-argument. Look for the cost on the device round.
- **Route search must match `short_name`, never `route_id`.** `route_id: '13'`
  is route `14`.

**Increment 8 has a name now: *routes on the map*** — a route result drawing
that route's stops, polylines, and the one-bus-behind-a-single-arrival view.
All three mount children inside `MapView`, which is why they are together and
why they are not in 7.

### Address search — the hard part is done

`data/geocode/oahu.ts` is built and tested and **nothing consumes it yet**;
Task 9 is what consumes it. `useAnchoredStops`' anchor machinery does the rest.

- **The geocoder has no regional bias**, and biasing it is a two-step dance with
  a fallback, because the steer that rescues `"beach"` from *Montana* also
  breaks `"ala moana beach"`. That is all handled; do not simplify it away.
- **Autocomplete is out, re-verified 2026-08-09** against the installed type
  definitions. `geocodeAsync` returns `{ latitude, longitude, altitude?,
  accuracy? }` — nothing printable — and one result every time, so a suggestion
  list costs two round trips per keystroke to render one row, and `CLGeocoder`
  throttles per app. The shipped shape is geocode on submit, reverse-geocode,
  and a single **"Did you mean…?"** confirmation.

## Where things stand

`main` and `dev` are level at Increment 6. **456 Jest, 82 `node --test`, clean
typecheck, clean `npm ci`.**

**The map is the part that changed most, and it is now device-verified.** Truman,
2026-08-08: "No interactions are really broken anymore… the app is now showing
labels when/where it realistically should. It feels pretty nice to use."

### Increment 6, in one paragraph each

**The correctness half** fixed six known-broken things from the backlog, then a
bug-hunting pass found a seventh: the arrival board broke on the last evening of
every month, because Hawaii is UTC−10 and `hawaiiDateTime` validated its calendar
*after* applying the offset. Ten hours, twelve times a year, looking exactly like
the API being down.

**The UI half** was screenshot-driven across four device rounds and has no plan
file by design. It rebuilt the map's markers, moved the provider's legend off the
top of every screen, masked the API key, fixed the map's controls and its legal
label, and built the geocoder's Oahu biasing.

**The map crash is diagnosed and its two recorded causes were both wrong.** Full
entry in `docs/backlog.md`. The short version is in *Lessons* below, because the
way it was found matters more than the fix.

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

Increment 6's record is `docs/superpowers/specs/2026-08-04-increment-6-correctness-and-ui.md`,
its plan, and `docs/superpowers/logs/2026-08-04-increment-6-ui.md` — the UI log
is the substantial one, four rounds of findings marked *observed* or *inferred*
line by line.

## Working agreement with Truman

- **Work on `dev`. Merging to `main` needs his explicit permission every time.**
- **Batch the pushes.** Every push to `dev` runs the Tests workflow, and a
  session of small pushes buried the Actions list — his words, 2026-08-08:
  "there's like some 70 test runs on GitHub Actions now." Run `npm test`,
  `npm run test:scripts` and `npm run typecheck` locally, commit as often as is
  useful, and push once the work is coherent. Committing often is free; pushing
  often is not.
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

**Reading native source is not measuring.** Increment 6 produced four wrong
claims this way, and then a fifth of mine. The map crash's two recorded causes
were both readings; the real cause was an out-of-range array insert in React
Native's Fabric mounting layer, and one `.ips` file off the phone settled in a
single look what six weeks of reasoning had not. **Get the artefact.**

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

- **Not `grilling`** — Increment 7 has already had its grilling (2026-08-09) and
  the spec records what it settled. The skill comes back out for Increment 8.
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
