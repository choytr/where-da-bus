# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-08**. **Increments 1–6 are shipped, device-verified and
merged.** `dev` and `main` are level. Nothing is half-finished.

---

## Start here

**There is no work in flight.** Increment 6 closed on 2026-08-08: both halves
done, four device rounds, merged to `main` with Truman's permission, and the two
things owed at merge are done — the geocoder probe is deleted and the forced
`gtfs-data.yml` publish has run.

**The next increment has not been specced, and the first move is a grilling.**
That is how every increment here starts; see *How work gets done* in
`CLAUDE.md`. Do not spec or plan before it.

**The two candidates for it, both from Increment 6's own findings:**

1. **The peek detent, and what the map sheet says at rest.** The best-understood
   piece of work in the backlog, and the only one with a measurement behind it.
   See below.
2. **Address search.** The design is settled and the hard part is built; what
   remains is UI. See below.

Live vehicles remain a later increment and route polylines were cut from that
work entirely — settled at the 2026-08-04 grilling, do not reopen.

### The peek detent — measured, unfixed, and ready

The sheet's collapsed height is `'14%'` in `DETENTS` (`features/map/StopSheet.tsx`).
On Truman's device that is about **119 pt**; the tab bar takes ~83 of them
(49 pt of bar over a 34 pt inset) and the grab handle another ~20. **That leaves
on the order of 16 pt for content.**

That single number is behind three separately-reported complaints — the peek
showing only legal text, "it peeks but doesn't show any meaningful information",
and "the stop code's spacing to the bottom bar is really tight and awkward".

**Truman's proposal is headings — "Nearby Stops" and "Selected Stop" — and it is
right but cannot be built first.** There is nowhere to put a heading in 16 pt.
The peek has to become a computed pixel height (tab bar + safe area + handle +
one real row) instead of a percentage.

**The trap**: that means changing `visibleAbove()`, which parses the percentage
strings, and which the camera framing in `region.ts` depends on. `region.test.ts`
covers it well. This is why it was not rushed alongside a crash fix.

### Address search — the hard part is done

`data/geocode/oahu.ts` is built and tested and **nothing consumes it yet**. The
search field, the results state and the wiring into `setAnchor` are what remain;
`useAnchoredStops`' anchor machinery already does the rest.

Read the geocoder probe's full findings table in the Increment 6 UI log before
designing it. Two of them change what you would build:

- **The geocoder has no regional bias**, and biasing it is a two-step dance with
  a fallback, because the steer that rescues `"beach"` from *Montana* also
  breaks `"ala moana beach"`. That is all handled; do not simplify it away.
- **Autocomplete is not feasible on this dependency set.** `geocodeAsync`
  returns coordinates and no formatted address, so a suggestion list would have
  nothing to print. Truman asked, was shown why, and **agreed to the middle
  option: geocode on submit, then `reverseGeocodeAsync` the one result and show
  a single "Did you mean…?" confirmation.** That is the design for the next
  increment. Full reasoning in the UI log.

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

- **`grilling`** — first, before anything else. The next increment has not been
  specced and Truman opens one by having his thinking attacked.
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
