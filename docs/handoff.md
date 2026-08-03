# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing a fresh
dated file each time — that is the whole point of it existing.

Last updated: **2026-08-02**. **Increment 3's code is complete** — all ten
tasks, plus an unplanned 6a — reviewed at the boundary, driven by hand on
Truman's phone in Expo Go, and **verified from a sideloaded `.ipa`** (run
`30775481303` off `dev`). His words: "the app looks good." **Not merged to
`main`** — that needs his explicit permission.

**Still Increment 3.** Using it produced a UX pass big enough to need its own
plan but not its own increment: the map's shape survived the device, its
interactions did not. Specified and planned, **not started** — see *What to
pick up next*.

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
`origin/main` is at `67dd266`. Live arrivals per stop with the §4 state model,
and route detail with an ordered stop list.

`dev` has moved past it with the Increment 3 work below and is **not** device-
verified yet — task 7 is where that happens.

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

**Asked directly on 2026-08-02, he waived that for the keyboard handling** and
said to rewrite it freely while splitting `HomeScreen`. Very little changed,
because very little needed to. The waiver was for that piece of code, not a
standing one — ask again next time.

**He starts the dev server himself.** Do not run `npm start` or `npx expo start`
from a session. Say when something needs looking at in Expo Go and let him run
it. `npm ci`, the test commands and `gh workflow run` are still ours.

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

**Execute `docs/superpowers/plans/2026-08-02-map-sheet-ux.md`, task 1 onward.**
Eight tasks, contract-level, inline, on `dev`. Its decisions were settled with
Truman on 2026-08-02 and are written up in the **Revision** section of
`docs/superpowers/specs/2026-08-02-increment-3-map.md`. **Do not re-argue
them** — read the Revision, not this summary, and note that it records what was
traded away as well as what was chosen.

The one-line version: the sheet becomes two modes rather than one list, the
detail card is the *full* arrival board (so `ExpandedStopRow` goes), tapping the
map no longer moves the anchor, the camera moves only on ⌖ and the first
location fix, and the map asks for location on `onMapReady`.

Then, in order:

1. **Device-verify it.** The plan ends with three questions only a device can
   answer, and they are the reason for the build rather than a formality.
2. **Merging `dev` into `main`** — Truman's explicit permission, every time.

Increment 3's own plan (`2026-08-02-increment-3-map.md`) is annotated with what
was done and where reality disagreed with it. 248 Jest, 70 `node --test`, clean
typecheck, expo-doctor 18/18 as of the increment boundary.

The `.ipa` check is **done**: the build containing the sheet, reanimated and
gesture-handler was installed and driven, and it looks right. The crash recorded
in the backlog was not reproduced on it, so that entry is now "seen once in Expo
Go, not reproduced on device" rather than an open device bug.

**The map itself is not under construction.** New components appear in the UX
plan — `StopCard`, `BoardHeader` — but they are named there with contracts. A
session that starts by designing a map screen from scratch has misread this
file; a session that starts at task 1 of the UX plan has read it correctly.

### What the UX session settled that the spec does not say outright

- **Truman does not want the camera to move.** He rejected two separate
  proposals for it — sliding the map when the rising sheet would cover the pin
  just tapped, and reframing the query radius after a *Search this area*. He
  accepted the cost both times after it was stated plainly. This is a settled
  preference, not a gap: **do not propose camera movement again** beyond ⌖ and
  the first location fix.
- **`mapPadding` is not the centring mechanism on Apple Maps**, contrary to
  `docs/backlog.md`. `AIRMap.m:645` assigns it to `layoutMargins`; the Google
  branch (`AIRGoogleMap.m:443`) sets `padding`, which does move the camera, and
  the backlog entry looks written from that. **This is a reading of the native
  source, not an observation** — the same move that produced two wrong claims in
  the scroll-indicator entry. It is why task 6 centres by arithmetic in
  `region.ts` instead, which cannot be wrong about MapKit because it never asks.
- **`6e27094` and `5822083` are Truman's.** The marker `stopPropagation` and the
  90% detent cap. Tasks 4 and 5 rewrite both lines — he asked for that work
  directly, so the waiver covers these; it does not extend further.
- **The Increment 4 AppID prerequisite is already met.** He registered his own
  at the start, which is where the `.env` key came from. Nothing is blocked on a
  signup.

### What the boundary review found

One real bug, fixed in `81c98fa`: `withCache` let a caller arriving in the
window between the last caller aborting and the promise settling join a dead
request and receive its failure. On the map that window is one tap wide — select
a pin, select another, select the first again. It lived in the seam between the
cache (task 6a) and selection (task 10), which is precisely the kind of finding
per-task review structurally cannot see. It was confirmed with a throwaway probe
before being fixed, not reasoned about.

`HomeScreen` was retired at the same time. Note what that cost: it was the last
thing calling `useSafeAreaInsets` under `__tests__/App.test.tsx`, and
`StopsScreen` reads the safe area through `SafeAreaView`, which does **not**
throw without a provider. The guard is now stated directly — `InsetReader` in
that file exists solely to call that hook. **Do not replace it with a component
that does not.**

### Decisions from this increment that the diff does not explain

- **`ThemeProvider` takes its storage as a prop.** Importing the preference
  module from `lib/theme.tsx` put AsyncStorage in the module graph of every
  screen that reads a colour, and four suites failed at import before a single
  assertion ran. Same coupling `lib/legal.ts` exists to break, by another route.
  The edge runs storage -> theme, never back.
- **`useTheme` throws without a provider, deliberately**, as does the gesture
  root's absence show up only on a device. Both are guarded by explicit
  assertions in `App.test.tsx` rather than by hope.
- **`@gorhom/bottom-sheet` is a new dependency, and it was not in the plan.**
  Pure JS over reanimated and gesture-handler — no native module of its own — so
  the Expo Go loop is untouched. Hand-rolling three detents plus the scroll/pan
  coordination is the part that would have gone wrong.
- **The map's camera moves only when the anchor moves.** Not on a poll, not on a
  refresh. TheBusLive needed a flag for this; here it falls out of the effect
  depending on a memoised region.
- **The default zoom is derived, not chosen.** `regionAround` frames exactly
  `NEARBY_RADIUS_METERS`, so the camera and the query cannot disagree about what
  "nearby" means.

## The TheBusLive comparison, and what came of it

`docs/superpowers/specs/2026-08-02-thebuslive-comparison.md` reads the data
layer of `ashvr0/TheBusLive` — an independent unofficial replacement for the
same app, against the same API, in SwiftUI — against ours. Read it before
building anything that touches the vehicle endpoint or the map.

Two things were acted on. The arrivals cache (task 6a) is done: `withCache`
coalesces in-flight requests by stop and caches successes for 30 s, never
failures, with callers reference-counted so one abort cannot cancel another's
request. The second, *do not recentre the map camera on a poll the user did not
ask for*, is noted on task 9 and not yet built.

The rest is recorded and not acted on. The one worth knowing: they make each
user register their own AppID because the 250,000/day quota is per key. We ship
one for every install, so **our quota is a shared resource with a ceiling** —
roughly 170 concurrent open arrival boards at a 60-second poll. That is a bet,
not an oversight, and it is now written down as one.

## Increment 4 is decided, and it is not what the design spec says

`docs/superpowers/specs/2026-08-02-increment-4-own-api-key.md`. **Every install
registers its own AppID and pastes it into Settings; the bundled key goes
away.** Truman's call on 2026-08-02 — his view is that a registration wall is
normal for an app and that he is the only user for the foreseeable future.

An optional override (bundled key stays, pasted key wins) was recommended and
rejected. **Do not reopen it by rediscovering that mandatory is more work** —
that was known when it was chosen.

The spec has the traps. The short version: it is not a text field. `theBus` is
built at import time from an environment variable and has to become
reconstructible; `withCache`'s cache is keyed by stop code alone and must be
cleared when the key changes; and "no key yet" is a fourth §4 state that must
not read like an outage, with "key rejected" a fifth that this API reports
through an HTTP 200 body rather than a status code.

This does not replace feed refresh, which the design spec has in the Increment 4
slot. They are unrelated and the order between them is open — though feed
refresh has a dated forcing function (`feed_end_date` is `20260822`) and this
does not.

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
