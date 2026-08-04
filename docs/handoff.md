# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing a fresh
dated file each time — that is the whole point of it existing.

Last updated: **2026-08-03**. **Increment 3 is complete, device-verified and
merged** — `origin/main` is at `094d7f3`. **Increment 4 is next and has not been
started**; its spec and plan are both written and the architecture behind it has
been stress-tested. See *What to pick up next*, then the plan.

The session of 2026-08-03 wrote no app code. It revised the Increment 4 and 5
specs, wrote both plans, and answered two questions by measurement rather than
by reasoning. Nothing under `app/`, `features/`, `data/` or `lib/` changed.

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

`dev` has moved past it with Increment 3 — which *was* device-verified from an
`.ipa` — and now with the UX pass on top, which has **not** been.

Green: 277 Jest, 70 `node --test`, clean typecheck.

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

## Increment 3 is done and merged

**The UX pass is device-verified.** Built from run `30788262742` off `dev`,
sideloaded, and driven by Truman on 2026-08-03. All three of the plan's
questions are answered, in the plan's *What the device said* section; two
produced work and both of those are now done.

`origin/main` is at `094d7f3`, fast-forwarded from `dev` with his explicit
permission on 2026-08-03, after a second device round caught the zoom reset on
*Search here*.

## What to pick up next

**Start Increment 4. The spec and the plan are both written; brainstorming and
planning are done.**

`docs/superpowers/plans/2026-08-03-increment-4-own-api-key.md` — eight tasks,
executed inline, in order. **Task 0 is an investigation and blocks task 4**:
nobody knows what the live API returns for a rejected AppID, and it must be
observed rather than guessed.

Then, in order:

1. **Increment 4 — each user brings their own API key.** Spec:
   `2026-08-02-increment-4-own-api-key.md`, with **two** revision sections at
   the end. The later one shrinks the work.
2. **Make `choytr/where-da-bus` public — by hand.** Not code, no test will
   notice it being skipped, cannot be undone once indexed. Must happen *after*
   Increment 4, because `EXPO_PUBLIC_` puts the AppID in every `.ipa`. History
   is verified clean; the 16 key-bearing artifacts are deleted.
3. **Increment 5 — the data refreshes itself.** Spec + plan both dated
   2026-08-03. The spec's *Revision: keep the floor* is the version that gets
   built; its headline decision was reversed.

### The architecture discussion happened — 2026-08-03

Truman asked for it before any of this was built, and approved the original
plan only "tentatively". It did not survive intact. **Four things changed, and
one thing was confirmed by being attacked and holding.**

- **The bundled `assets/db/gtfs.db` stays, as a floor.** Increment 5 originally
  deleted it. Almost every hard problem in that spec — `sha256` as
  load-bearing, publish-both-forever, a download step in onboarding, "what if
  the asset was deleted" — was a consequence of having no fallback, not of
  adding refresh. Keeping it degrades every one of those to "keep using what
  you have", and the goal is untouched: the cron still builds, and **Truman
  still never runs `npm run build:gtfs` by hand again.**
- **Onboarding is a key gate, not a prerequisite list.** With the floor kept,
  the list never gets a second item. Smaller than specced.
- **The swap question is closed.** Generation-numbered files plus a stored
  pointer; nothing ever overwrites a database SQLite has open. It was the
  likeliest thing to fail on a device and the one no test here would catch.
- **A floor check the hash cannot give you.** `sha256` proves the bytes
  arrived, not that the build is right. A truncated upstream zip yields a
  perfectly valid forty-stop database. `stops > 3000` runs in the Action and
  again in the app.
- **A separate public data repo was proposed and withdrawn.** It would have let
  this repo stay private and severed the whole ordering chain. Truman rejected
  the *premise*: **he wants this repo public.** The friction was never
  reluctance to publish, only that publishing needs the key change first. So
  the ordering above stands, and this idea should not be re-proposed.

**His instruction for both increments: keep it as simple as possible, get it
working with a reasonable architecture, handle edge cases after.** Increment
5's spec has a *Deferred on purpose* list — ETags, signatures, backoff,
blocklists — that is binding, not aspirational.

### Two questions answered so they are not re-asked

- **Can the phone parse the GTFS feed itself?** Measured on 2026-08-03 against
  the live feed: parsing `stop_times.txt` with the existing `parseCsv` peaks at
  **964 MB RSS** to produce ~18,000 derived rows, because it materialises 1.4M
  row objects. iOS kills an app well before that. A streaming rewrite is
  feasible — the accumulators are genuinely small — but needs two passes over
  73.8 MB of inflated CSV on a phone, for 10× the bytes of the prebuilt asset.
  **Still the endgame, still not now.** The numbers are in the Increment 5 spec.
- **Is there a GTFS-Realtime feed that removes the need for a key?** Yes, and
  no. It exists, served by **Swiftly**, and needs a Swiftly key instead — plus
  it is a whole-system feed and its trip updates are delays against the
  scheduled timetable this project deliberately never ships. Full finding, with
  URLs and one explicitly-unverified licence reading, in Increment 4's spec
  under *The realtime feed question*.

### One thing reopened, and left for him

The soft gate — search and favorites working without a key, arrivals gated — was
killed by the argument that Increment 5 would leave a first launch with no
database. **The floor revives that premise.** It is flagged in Increment 4's
spec rather than quietly re-decided. The recommendation is to keep the hard
gate anyway, because it is his stated product call *and* it is less work than
two coherent app states — but the reason has changed, and he should know that.

**The bundled `assets/db/gtfs.db` is not being refreshed by hand.** It expires
2026-08-22 and that is deliberately not a deadline: he is the only user, he
knows why the banner appears, and Increment 5 deletes the file entirely. Do not
"helpfully" run `npm run build:gtfs` and commit the result.

Two cosmetic findings are deferred in `docs/backlog.md`, on his instruction —
"functionality first": the callout's text is not centred on its pin, and the
card's header carries route chips that `/stop/[code]` does not.

### What the UX pass built

All eight tasks of `docs/superpowers/plans/2026-08-02-map-sheet-ux.md`, inline
on `dev`. Its decisions were settled with Truman on 2026-08-02 and are written
up in the **Revision** section of
`docs/superpowers/specs/2026-08-02-increment-3-map.md`. **Do not re-argue
them** — read the Revision, not this summary, and note that it records what was
traded away as well as what was chosen.

The one-line version: the sheet is two modes rather than one list, the detail
card is the *full* arrival board (so `ExpandedStopRow` is gone), tapping the map
no longer moves the anchor, the camera moves only on ⌖, the first location fix
and a *Search here*, and the map asks for location on `onMapReady`.

**That third camera case is a reversal Truman made on 2026-08-03**, after using
it, and the spec's Revision carries a dated amendment saying so. *Search this
area* was re-confirmed as **not** moving the camera in the same breath, so the
settled preference is intact rather than abandoned — do not generalise the
exception.

Three things the diff does not explain:

- **`board.ts` holds the hook and `BoardHeader.tsx` the header, but neither
  holds the list.** Both hosts render their own. A shared component taking
  `List: ComponentType<SectionListProps<…>>` cannot accept
  `BottomSheetSectionList` without a type assertion, which this project
  forbids, so composition sidesteps the problem rather than fighting it.
- **`useArrivalBoard` returns two clocks.** `now` is shifted onto the server's
  for the countdowns; `tick` is the device's, and the age line uses it because
  `fetchedAt` is a device timestamp — measuring the age against the shifted
  clock counts the offset twice.
- **`region.ts` does the sheet-aware centring, and `mapPadding` does not.**
  See the corrected backlog entry: on Apple Maps that prop becomes
  `layoutMargins`. It is set only to keep Apple's legal label off the sheet.

Increment 3's own plan (`2026-08-02-increment-3-map.md`) is annotated with what
was done and where reality disagreed with it. 248 Jest, 70 `node --test`, clean
typecheck, expo-doctor 18/18 as of the increment boundary; **277 Jest and 70
`node --test` after the UX pass**, typecheck clean.

The `.ipa` check is **done**: the build containing the sheet, reanimated and
gesture-handler was installed and driven, and it looks right. The crash recorded
in the backlog was not reproduced on it, so that entry is now "seen once in Expo
Go, not reproduced on device" rather than an open device bug.

**The map itself is not under construction**, and now less so than ever. The UX
plan's `StopCard` and `BoardHeader` exist. A session that starts by designing a
map screen from scratch has misread this file.

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
ask for*, is now built and then some: the camera moves on ⌖ and the first
location fix, and on nothing else at all.

The rest is recorded and not acted on. The one worth knowing: they make each
user register their own AppID because the 250,000/day quota is per key. We ship
one for every install, so **our quota is a shared resource with a ceiling** —
roughly 170 concurrent open arrival boards at a 60-second poll. That is a bet,
not an oversight, and it is now written down as one.

## Increment 4 is decided, and it is not what the design spec says

> **Superseded 2026-08-03 in one respect:** the "order between them is open"
> below is closed. The key goes first, feed refresh becomes **Increment 5**,
> and the two are no longer unrelated — see *What to pick up next*. The
> "dated forcing function" is also overstated; Truman pushed back on it and
> was right.

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

- **`superpowers:executing-plans`** — Increment 4's spec and plan are both
  written. Brainstorming and planning are *done*; do not redo them.
- **`superpowers:test-driven-development`** — the key storage, the client
  provider and the `unauthorized` parse are exactly the pure logic this project
  TDDs. The onboarding screen is not.
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
