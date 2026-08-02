# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing a fresh
dated file each time — that is the whole point of it existing.

Last updated: **2026-08-02**, after the Increment 3 design session.

**Everything durable is already in the repo.** This document exists only to
carry what a transcript would otherwise lose. Read the repo docs first; they are
the source of truth.

## Read these, in this order

1. `CLAUDE.md` — the traps. Updated this session.
2. `docs/superpowers/specs/2026-08-02-increment-3-map.md` — **what to build
   next**, and its plan under `docs/superpowers/plans/`.
3. `docs/superpowers/specs/2026-07-29-wheredabus-design.md` — scope and
   sequencing. Its Increment 3 row is superseded by the spec above; three of
   its claims were corrected on 2026-08-02 and carry inline notes saying so.
4. `docs/api/README.md` — the live API, verified against the vendor PDFs *and*
   against the live API on 2026-08-01, plus the fleet-endpoint finding of
   2026-08-02. It marks which claims are vendor quotes and which are readings
   of a single example. Do not re-read the PDFs to re-derive what the README
   already records; that was done once, deliberately.
5. `docs/backlog.md` — triaged defects, including an "Increment 2 — deferred"
   section written at this increment's boundary.

## Where things stand

**Increment 2 is complete, verified on a physical iPhone, and merged.**
`origin/main` and `dev` are both at `67dd266`. Live arrivals per stop with the
§4 state model, and route detail with an ordered stop list.

Green: 179 Jest, 70 `node --test`, clean typecheck, expo-doctor 18/18.

The twelve commits from `ffa69e9` to `67dd266` carry full reasoning in their
messages. Read those rather than asking for a summary of what changed.

## Decisions made this session that are NOT obvious from the diff

- **expo-router over React Navigation** — Truman's call, after being shown that
  expo-router is a file-based layer *over* React Navigation rather than a
  separate engine. He chose the restructure knowing it cost an entry-point
  change.
- **Arrival board layout** — Truman supplied a screenshot of the discontinued
  DaBus app and asked for its shape: one chronological list, sectioned by
  direction. Live sampling backed it (79% of stops serve one direction).
- **`Scheduled · no GPS`** — his wording preference, shortened from a longer
  phrase because it appears on ~23 of 25 rows.
- **The scroll-indicator inset is deliberately parked.** He was reminded of it,
  reconsidered, and said explicitly: keep ignoring it. **Do not reopen it.**
  It has now misled three separate investigations; `docs/backlog.md` records
  what was ruled out and a correction made this session.

## Working agreement with Truman

- Work on `dev`, push freely. **Merging to `main` needs his explicit
  permission every time** — a push to `main` triggers the macOS `.ipa` build.
- He drives largely from his phone and prefers autonomous execution — do the
  work, report honestly, ask only when an answer changes what you would build.

### Truman writes code here too

He is learning Expo on this project, and `ffc7190` / `037c7c0` are his — the
keyboard handling on the stops list. Do not silently rewrite his work or hand
him finished code for something he has said he wants to do himself. Review it
like anyone's, say what you find, and leave the fix to him unless he asks.

**A caution that generalises.** That review produced a finding that was simply
wrong — that the scroll indicator ran under the home indicator. It had been
reasoned from the code, never observed, and one look at the device disproved it.
There is no simulator here and no device on this side; anything about how the
app *looks* is inference until Truman confirms it. Say which of the two you are
doing, and do not launder a reading of the source into a claim about the screen.

## The one lesson worth carrying forward

**Expo Go and the `.ipa` can disagree, and Expo Go is the more forgiving of
the two.** `.env` is gitignored; CI had no AppID; every `.ipa` shipped an empty
`EXPO_PUBLIC_THEBUS_APP_ID` and failed every arrivals request on device. 179
tests, a clean typecheck, expo-doctor, a successful build and Expo Go all said
fine. Any value reaching the app through the environment has this shape.
`ios-ipa.yml` now reads it from a repository secret and guards against absence.

A second, smaller one: `dev` was added to `tests.yml` this session and caught a
`react-dom` peer conflict within one commit — three pushes had already gone up
red, invisible locally because `npm install` tolerates what `npm ci` refuses.
**Run `npm ci` after touching dependencies.**

## What to pick up next

**Increment 3 is specified and planned. Execute the plan** —
`docs/superpowers/plans/2026-08-02-increment-3-map.md`, inline and in order.
It is the theme provider, then a three-tab restructure, then the map. Task 7 is
a deliberate stop-and-device-verify: it is the first thing that can fail
natively, and nothing after it is worth building if the map does not render.

Nothing about Increment 3 is still open. The design session on 2026-08-02
settled it end to end, including two reversals worth knowing about because the
losing option looks reasonable on paper:

- **The map does not re-query on pan or zoom.** Stops are anchored to a point —
  your location, or wherever you tap. Viewport querying was chosen first and
  then rejected: the SQL is free (0.5 ms for 480 rows over the existing index)
  but re-rendering up to 150 native markers on every drag settle is not, and a
  list that reshuffles under your thumb is unpleasant however fast it is.
- **Search is not in the bottom sheet.** It is its own tab, with favorites as
  its empty state. A text field inside a sheet over a map fights the sheet's
  gestures through the keyboard, and this is the wrong loop to debug that on.

**Deferred with the numbers already taken**, so none of it needs re-deriving:
feed refresh (Increment 4), route polylines (~200 KB for all 532 shapes, not
the budget fork the design spec feared), live vehicles (the whole fleet arrives
in one 29 KB request, but 1,138 of 1,184 vehicles are years stale while still
carrying real Oahu coordinates — filter on `last_message` or plot ghosts).

**One dated chore:** `feed_end_date` is `20260822`. Run `npm run build:gtfs` and
commit the regenerated asset before then, or the app starts calling itself
stale. Increment 4 is what ends this being manual.

## Suggested skills

- **`superpowers:executing-plans`** — Increment 3's design and plan are both
  written. Brainstorming and planning are *done*; do not redo them.
- **`superpowers:test-driven-development`** — `useAnchoredStops`, the theme
  resolution and the preference storage are exactly the pure logic this project
  TDDs. The map view itself is not.
- **`superpowers:systematic-debugging`** — if anything about the *appearance*
  of the app comes up. This project has repeatedly produced confident wrong
  claims by reasoning from source instead of observing a device.
- **`simplify`** — a good fit for the palette cleanup specifically.
- **Not `superpowers:dispatching-parallel-agents` or
  `subagent-driven-development`.** `CLAUDE.md` is explicit: execute inline, and
  review once at the increment boundary. Increment 1 cost more in process than
  in implementation and the project corrected for it.

## Environment notes

- Windows/WSL2, no Mac, no paid Apple Developer account. iOS builds run only on
  GitHub Actions. `/ios` and `/android` are prebuild output and must never be
  committed or hand-edited.
- The AppID lives in `.env` locally and in a GitHub repository secret for CI.
  **Not reproduced here.** `EXPO_PUBLIC_` means it ships inside the bundle and
  is extractable from the `.ipa` — a documented, accepted tradeoff.
- SDK pinned to 54 by the Expo Go ceiling. Install with `npx expo install`,
  never bare `npm install <pkg>`, never `npm audit fix --force`. The 12
  outstanding audit advisories are all in the web build and prebuild toolchains,
  none reach the device, and they have been triaged — do not "fix" them.
- **WSL is in mirrored networking mode** (`%UserProfile%\.wslconfig`) so Expo Go
  on a physical iPhone can reach Metro, and a Hyper-V firewall rule named
  `ExpoGo8081` allows inbound TCP 8081. Without both, Metro binds an address the
  phone cannot route to. If Expo Go stops connecting, check those before
  suspecting the app.
- The API PDFs need `node scripts/pdf-text.mjs <file>` to read; `Read` cannot.
  It breaks lines mid-word, so pipe through `tr -d '\n'` to grep for a phrase.
