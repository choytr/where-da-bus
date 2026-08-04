# Handoff

**A living document.** Where the project is now, and what the next session picks
up. Update it in place rather than adding a dated section each time.

**It carries only what the repo cannot.** Specs, plans, commit messages and
`CLAUDE.md` are the record; anything already in them belongs there, not here.
When an increment ships, its write-up in this file collapses to a pointer.

Last updated: **2026-08-04**. Increments 1–5 are shipped, device-verified and
merged. `main` and `dev` are level, working tree clean, CI green.

---

## Start here: Truman wants a grilling session for Increment 6

He asked for it by name on 2026-08-04, before anything about Increment 6 had
been decided. **Invoke the `grilling` skill before writing a spec, a plan, or a
line of code.**

He is asking to have *his own* thinking stress-tested, not to be handed a
proposal — so arriving with a recommendation and defending it pre-empts the
thing he asked for. Attack premises, not details.

This is a pattern, not a one-off. He approved Increment 4's plan only
"tentatively" and asked for an architecture conversation first; it reversed four
decisions and killed a fifth, including restoring the bundled database as a
floor — which removed most of Increment 5's hard problems before they were
built. The grilling is where this project's design work actually happens.

**Candidates, as raw material and explicitly not a recommendation:** route
polylines and live vehicle positions (deferred through Increments 3–5);
`docs/backlog.md`; or the endgame in Increment 5's spec — the app building the
database itself, removing the GitHub dependency. His condition for that last one
was "once we've proven that the app can work entirely without my constant
maintenance," which the weekly cron now has to demonstrate over a few weeks.

## Where things stand

`main` and `dev` are both at the same commit. **388 Jest, 73 `node --test`,
clean typecheck, clean `npm ci`.**

**The one thing genuinely unproven: nothing has run unattended yet.** Every
`gtfs-data.yml` run so far was hand-started. The first scheduled firing is
**Monday 12:00 UTC (02:00 HST)**. Check it with
`gh run list --workflow gtfs-data.yml`. **A run that exits with `changed=false`
is the expected outcome most weeks, not a failure** — it means the upstream feed
has not been republished.

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

`docs/superpowers/specs/2026-08-02-thebuslive-comparison.md` reads an
independent unofficial app against ours. Both of its actionable findings are
built. Read it before touching the vehicle endpoint or the map.

## Suggested skills

- **`grilling`, first** — see the top of this file.
- **`superpowers:brainstorming`, then `writing-plans`** — once the grilling has
  settled what Increment 6 is. The order this project converged on is
  grill → spec → contract-level plan → execute inline → review once at the
  boundary → device round → merge.
- **`superpowers:systematic-debugging`** — whenever the app's *appearance* comes
  up, for the reason in the lessons above.
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
