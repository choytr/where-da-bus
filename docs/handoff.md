# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-07**. Increments 1–5 are shipped, device-verified and
merged. **Increment 6's correctness half is done, and a bug-hunting pass on top
of it** — sixteen commits on `dev`, nothing merged. **The UI half has not
started, and it is the next thing.**

---

## Start here: the UI half

**Nothing is half-finished.** The working tree is clean, everything is pushed,
and the seven correctness tasks are complete — their write-up, including five
places where reality disagreed with the plan, is in the plan's *What was
built* section. Do not re-execute them, and do not re-grill: the 2026-08-04
grilling settled Increment 6 and is closed.

The UI half is screenshot-driven and Truman drives it. He was about to start
when this session ended, so **the first move is his**, not a piece of work to
pick up. Read *Three things about the UI half that will not be obvious* below
before he sends anything.

**Two things must not be forgotten at merge:**

1. **Delete the geocoder probe.** `features/settings/GeocoderProbe.tsx`, plus
   its import and one line of JSX in `SettingsScreen.tsx`. It is marked
   THROWAWAY in all three places.
2. **The forced publish, immediately after merging.**
   `gh workflow run gtfs-data.yml -f force=true`. The corrected floor is
   committed but the corrected *generation* is not published, and
   `workflow_dispatch` cannot fire from `dev`. Shipping the new floor without
   republishing means every device downloads the old broken generation and
   moves straight off the corrected data — see the plan for the mechanism.

### A bug-hunting pass landed after the correctness half (2026-08-06)

Not part of the plan; done with spare time and kept because one of the finds
was serious.

- **The arrival board broke on the last evening of every month.** Hawaii is
  UTC−10, so everything from 2 PM belongs to the next UTC day and — on a
  month's last day — the next UTC month. `hawaiiDateTime` validated its
  calendar *after* applying that offset, so it rejected correct values. Because
  `serverTime` runs through the same function, `parseArrivals` called the whole
  response `malformed`: the screen failed outright, looking exactly like the API
  being down. Ten hours, twelve times a year. Fixed, with the calendar now
  checked at midnight before the offset moves it.
- **The map crash's JavaScript is ruled out**, by six tests that try to
  reproduce it and cannot. The backlog entry names the two remaining
  device-only candidates and says what evidence would settle it: the crash log
  off Truman's phone.
- **CI's cold-cache failures are fixed, and their recorded cause was wrong** —
  three tests failing on Jest's 5 s per-test timeout, every run, not two
  `waitFor` calls flaking at 1 s. `testTimeout: 20000`.
- **The build now reports rows it throws away**, which is the class of silent
  loss Task 3 turned out to be. Currently 29 de-duplicated, 0 orphaned.

1. `docs/superpowers/specs/2026-08-04-increment-6-correctness-and-ui.md`
2. `docs/superpowers/plans/2026-08-04-increment-6-correctness.md` — seven
   tasks, contract level
3. `docs/superpowers/logs/2026-08-04-increment-6-ui.md` — 32 findings from the
   first screenshot round
4. `docs/superpowers/logs/2026-08-05-field-notes-map-and-live-buses.md` — field
   notes from a chat session, reconciled against the code. **Mostly Increment
   7**, and the seed for its grilling; four items touch Increment 6 and are
   named at the top. Nothing in it widens Increment 6's scope — sectioned
   search and the arrivals route filter were put to Truman and both wait.

**Increment 6 was two halves.** Six known-broken things from `docs/backlog.md`
first — **done** — then a UI pass driven by screenshots from Truman's device,
which is what remains.

**Live vehicles are a later increment**, and route polylines were cut from that
work entirely. Only new chrome at the map's *edges* is deferred with them — the
sheet, card, pins and callouts are in scope now.

### Three things about the UI half that will not be obvious

**It has no stopping rule. Truman calls it done.** He was shown the consequence
— the increment cannot close itself, so the boundary review has nothing to fire
against — and chose it knowingly. **Commit once per surface**, so the eventual
review walks commits rather than one undifferentiated diff.

**It is collaborative. He edits files himself between messages.** `git pull
--rebase` and `git status` before every editing session, and never write over a
file carrying changes that are not ours. His code gets reviewed like anyone's,
and the fix is left to him unless he asks.

**Screenshots live in `~/wheredabus-screenshots/<date>/`, outside this
repository**, because the repo is public and the map shots place him closely
enough to locate. They are not committed and not gitignored-in-place; they
simply do not live here. Transcribe findings into the UI log as soon as they
arrive — **images do not survive a context compaction and text does.**

### What he owes, and what he does not

The correctness half needed nothing from him and is done. When he is next free,
the useful things are: **the geocoder probe results** (six queries — a street
address, a mall, a school, a restaurant, a beach, a neighbourhood — screenshot
the raw output), **arrivals scrolled to the very bottom** (settles whether the
list clears the home indicator — do not reason about that one from source, see
the backlog), **the new "Something went wrong" screen** (reachable by throwing
in any screen; its copy is provisional), and the remaining unseen states (empty
arrivals, unauthorized, denied location, no search results, `KeyGate`).

**Light theme is deprioritised** — his words, 2026-08-04: "honestly light is not
that important rn. They looked fine when I last checked."

## Where things stand

`dev` is **sixteen commits** ahead of `main`: the spec, plan, UI log and field
notes, seven correctness commits, and five from the bug-hunting pass. Working
tree clean, everything pushed. **413 Jest, 82 `node --test`, clean typecheck,
clean `npm ci`.**

**Nothing on `dev` has been seen on a device.** Three changes are visible: the
new "Something went wrong" screen (provisional copy, wants a screenshot), the
geocoder probe in Settings, and — invisibly until the 31st — the month-end
arrivals fix. All are for the next device round.

**The one thing genuinely unproven: nothing has run unattended yet.** Every
`gtfs-data.yml` run so far was hand-started; the three in `gh run list` are all
`workflow_dispatch` or `push`, the newest 2026-08-04. **The first scheduled
firing is Monday 2026-08-10, 12:00 UTC (02:00 HST)** — still ahead as of this
writing. Check it with `gh run list --workflow gtfs-data.yml`. **A run that
exits with `changed=false` is the expected outcome most weeks, not a failure**
— it means the upstream feed has not been republished.

If scheduled runs turn out to be badly delayed, `0 12` is the most contended
slot on GitHub's scheduler; a few minutes past the hour would help. Truman knows
and chose to leave it.

## Read these, in this order

1. `CLAUDE.md` — the traps, and how work gets done here.
2. `docs/superpowers/specs/2026-07-29-wheredabus-design.md` — scope and
   sequencing. Several claims carry dated inline corrections; trust those.
3. `docs/api/README.md` — the live API, verified against the vendor PDFs and
   against the live service. It marks which claims are vendor quotes and which
   are readings of a single example. **Do not re-read the PDFs to re-derive what
   it already records.**
4. `docs/backlog.md` — triaged defects, one dated section per increment
   boundary.

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
| 6 | *In progress* — six correctness fixes, then a UI pass |

## Working agreement with Truman

- **Work on `dev`, push freely. Merging to `main` needs his explicit permission
  every time.**
- He drives largely from his phone and prefers autonomous execution: do the
  work, report honestly, ask only when the answer changes what you would build.
- **He starts the dev server himself.** Never run `npm start` or `npx expo
  start`. `npm ci`, the test commands and `gh workflow run` are ours.
- **He explains decisions best once he can see the mechanism.** He has overseen
  every architectural choice but has not read most of the code. State how the
  thing works — concretely, with file references — before asking him to choose.
- **He also writes code here**, and is learning Expo on this project. Review it
  like anyone's, say what you find, and leave the fix to him unless he asks. He
  has waived this for specific pieces before; a waiver covers that code, not the
  next.
- **He defers pixel-level UI choices** until he can hold a prototype. Record
  those as provisional rather than pressing for an answer.

## Two lessons worth carrying forward

**Anything reaching the app through the environment will be absent in CI, and
Expo Go will not show you.** Expo Go reads the developer's local `.env`; a CI
runner has none. Every `.ipa` once shipped an empty `EXPO_PUBLIC_THEBUS_APP_ID`
and failed every arrivals request on device, while 179 tests, a clean typecheck,
expo-doctor, a green build and Expo Go all said fine. The variable is gone —
Increment 4 moved the key to the keychain — but the shape of the failure is not.

**Anything about how the app *looks* is inference until Truman confirms it.**
There is no simulator here and no device on this side. A review once reported
that the scroll indicator ran under the home indicator; it had been reasoned
from source, never observed, and one look at the device disproved it. Say which
of the two you are doing.

## Decisions with no spec behind them

Increment 2 was built without a spec or plan — a correction to Increment 1's
8,015-word plan that overshot. These are recoverable only from here and its
commit messages:

- **expo-router over React Navigation** — his call, after being shown that
  expo-router is a file-based layer *over* React Navigation, not a separate
  engine. He accepted the entry-point change knowingly.
- **The arrival board's shape** — one chronological list, sectioned by
  direction, from a screenshot of the discontinued DaBus app. Live sampling
  backed it: 79% of stops serve one direction.
- **`Scheduled · no GPS`** — his wording, shortened because it appears on ~23 of
  25 rows.
- **The scroll-indicator inset is parked. Do not reopen it.** He was reminded,
  reconsidered, and said to keep ignoring it. It has misled three separate
  investigations.

## Two questions already answered — do not re-ask

- **Can the phone parse the GTFS feed itself?** Measured: 964 MB peak RSS with
  the existing parser, because it materialises 1.4M row objects. iOS kills the
  app well before that. A streaming rewrite is feasible and remains the endgame.
  Numbers in Increment 5's spec.
- **Is there a GTFS-Realtime feed that removes the need for a key?** Yes, and
  no — it exists, served by Swiftly, and needs a Swiftly key instead. Full
  finding in Increment 4's spec under *The realtime feed question*.
- **Can the app search an address and show the stops around it?** Yes, with no
  new dependency. `Location.geocodeAsync` is in `expo-location`, already a
  dependency, verified against the v54 docs — no key, no native module. The
  anchor machinery it needs already exists (`useAnchoredStops`'s `setAnchor`).
  **Places are not addresses**: `CLGeocoder` resolves street addresses, while
  point-of-interest search is `MKLocalSearch`, which `react-native-maps` does
  not expose. Truman accepted address-only. Detail in Increment 6's spec.

`docs/superpowers/specs/2026-08-02-thebuslive-comparison.md` reads an
independent unofficial app against ours. Both of its actionable findings are
built. Read it before touching the vehicle endpoint or the map.

## Suggested skills

- **Not `grilling`.** Increment 6's grilling is done and its decisions are
  written down. Grill again at the *next* increment boundary, not now.
- **Not `superpowers:executing-plans` either.** The written plan is executed.
  The order this project converged on is grill → spec → contract-level plan →
  execute inline → review once at the boundary → device round → merge, and
  everything up to the boundary review is done. **The UI half has no plan by
  design** — it is led by what Truman sees on his phone.
- **`superpowers:systematic-debugging`** — whenever the app's *appearance* comes
  up, for the reason in the lessons above. It earned its place again on
  2026-08-06: it is what stopped a fix being aimed at the cause a backlog entry
  asserted rather than the one measurement found.
- **`superpowers:requesting-code-review`** — when Truman calls the UI half done.
  That is the boundary review, on the whole diff, and it is the one thing this
  increment still owes its own process.
- **Not `dispatching-parallel-agents` or `subagent-driven-development`.**
  `CLAUDE.md` is explicit: execute inline, review once at the boundary.

## Environment notes

- Windows/WSL2, no Mac, no paid Apple Developer account. iOS builds run only on
  GitHub Actions. `/ios` and `/android` are prebuild output — never commit or
  hand-edit them.
- **`workflow_dispatch` and `schedule` only ever fire for a workflow that exists
  on `main`.** From a branch, `gh workflow run --ref <branch>` is a 404, not a
  permissions error. **`push` is the way round it**: it runs a workflow as
  defined on the ref you pushed. Add a `push:` trigger scoped to a throwaway
  branch, prove the workflow, then take the trigger out — that is how
  `gtfs-data.yml` was verified before merging.
- **The repo is public**, so GitHub-hosted runners are free, macOS included. The
  10x-billing caution in `ios-ipa.yml`'s comments no longer bites.
- **`expo-asset` is not resolvable from the project root** — npm nests it under
  `node_modules/expo/`, so `require('expo-sqlite')` throws under Jest. Anything
  importing `data/gtfs/files.ts` must double `expo-sqlite`. Metro resolves it
  fine on device.
- SDK pinned to 54 by the Expo Go ceiling. Install with `npx expo install`,
  never bare `npm install <pkg>`, never `npm audit fix --force`. The outstanding
  audit advisories are all in the web-build and prebuild toolchains, none reach
  the device, and they are triaged — do not "fix" them.
- **WSL is in mirrored networking mode** (`%UserProfile%\.wslconfig`) so Expo Go
  on a physical iPhone can reach Metro, plus a Hyper-V firewall rule
  `ExpoGo8081` allowing inbound TCP 8081. If Expo Go stops connecting, check
  those before suspecting the app.
- The API PDFs need `node scripts/pdf-text.mjs <file>`; `Read` cannot open them.
  It breaks lines mid-word, so pipe through `tr -d '\n'` to grep for a phrase.
