# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing a fresh
dated file each time — that is the whole point of it existing.

Last updated: **2026-08-04**. **Increment 4 is merged. Increment 5 is complete,
reviewed and device-verified on `dev`, and waiting only on permission to
merge.** See *Increment 5 is built* below.

Increment 4 was device-verified from run `30884750888` and merged on
2026-08-03; his one change was masking the onboarding key field, which is done.
He made the repository **public** on 2026-08-04, which is what unblocked
Increment 5.

**Everything durable is already in the repo.** This document exists only to
carry what a transcript would otherwise lose. Read the repo docs first; they are
the source of truth.

## Read these, in this order

1. `CLAUDE.md` — the traps. Updated this session with a new Jest one.
2. `docs/superpowers/plans/2026-08-03-increment-5-self-refreshing-data.md` —
   **what was just built**. Its *What was built* section records seven places
   reality disagreed with the plan, and its *Verification* section records both
   workflow runs and what the device said. Its spec is
   `../specs/2026-08-03-increment-5-self-refreshing-data.md`, and the binding
   version of that spec is its *Revision: keep the floor* section.
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

**`origin/main` is at `c7e5f2c`** — Increments 1 through 4, all
device-verified and merged.

**`dev` is ten commits ahead**: two documentation commits closing out
Increment 4, then Increment 5's six tasks, `08dc855`..`c20946e`, plus the
handoff update and the boundary review's one fix. **Reviewed and
device-verified. Not merged.**

Green: **388 Jest, 73 `node --test`, clean typecheck, clean `npm ci`**, and CI
green on `dev`.

**The boundary review found one real defect and it is fixed** (`6eca5e6`): the
launch sweep and the launch refresh were started concurrently, and a sweep
landing between the refresh's rename and its pointer save would have deleted the
file the pointer was about to name — leaving the next launch opening an *empty*
database at that name, silently, because `openDatabaseAsync` creates what it
cannot find and `DatabaseGate` therefore never fires. It lived in the seam
between task 4 and task 5, which is exactly what a per-task review cannot see.
The rest of the review is in `docs/backlog.md` under *Increment 5 — deferred*.

Commit messages carry the reasoning throughout this project. Read those rather
than asking for a summary of what changed.

## Decisions from the Increment 2 session that are NOT obvious from the diff

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
fine. **Any value reaching the app through the environment has this shape, and
that is the part to carry forward.**

The variable itself is gone as of Increment 4 — each user pastes their own key
and it lives in the keychain, so `ios-ipa.yml` injects nothing and there is no
secret in the build to be absent. The *lesson* is not retired with it: Expo Go
reads the developer's local `.env` and a CI runner has none, so the next value
plumbed through the environment will fail exactly this way. `.env.example` and
the workflow both carry a note saying so.

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

**Increment 5 is done and verified. Only the merge is left, and that is
Truman's call.**

Merging matters more than usual this time, because two of the things this
increment built **do not run at all until the workflow is on `main`**:

- the **weekly `schedule`**, which like `workflow_dispatch` only ever fires from
  the default branch. Until the merge there is no automatic refresh — the data
  published on 2026-08-04 is a one-off from a hand-triggered run.
- **`workflow_dispatch`**, so nobody can rebuild the data by hand either without
  repeating the throwaway-branch trick.

The app half is unaffected: it reads a fixed URL and the release already exists,
so an installed build keeps refreshing whenever new data appears.

Everything else is finished — see *Increment 5 is built* below and the plan's
*Verification* section, which records both workflow runs and what the device
said.

**One loose thread, small.** The onboarding field's masking (`c7e5f2c`) landed
*after* Truman's device round, so that one change has not been on a phone. The
`main` build from run `30892749009` contains it. Not worth a special trip; worth
a glance next time an `.ipa` is installed for any reason.

## Increment 5 is built, reviewed and device-verified

All six tasks of `docs/superpowers/plans/2026-08-03-increment-5-self-refreshing-data.md`,
inline on `dev`, one commit each. **387 Jest, 73 `node --test`, typecheck clean,
`npm ci` clean.** Read the plan's *What was built* section rather than the diff;
it records seven places where reality disagreed with the plan.

The shape: a weekly Action rebuilds the feed and uploads
`gtfs-v1-<builtAt>.db` then `manifest.json` to the fixed `data` release tag. The
app checks the manifest two seconds after first paint, verifies `sha256`, opens
the download and counts its rows before trusting it, and moves a stored pointer.
`assets/db/gtfs.db` stays in the bundle as the floor, so every failure in that
chain degrades to stale data rather than none.

**The one decision the plan got wrong, reversed here.** The plan had the pointer
remounting `SQLiteProvider` onto the new file immediately. The router lives
*underneath* that provider, so a background download completing would have
thrown a rider halfway through an arrival board back to the home screen.
`AppShell` now reads the pointer once at mount and never re-reads: a build
fetched now is opened next launch. Settings says so in those words, and
"installed" is a separate outcome from "up to date" for exactly this reason.

**Change detection is by hash of the upstream zip**, never by `feed_end_date`.
Expiry and republication are different things and the spec has the full
argument; `feedEndDate` is carried in the manifest for display only and must
never gate a download.

**`assets/db/gtfs.db` was deliberately not rebuilt**, so the shipped floor has
no `schema_version` column — it shipped inside the binary and is never asked
what schema it is. Do not "fix" that by rebuilding it; that is the thing this
increment exists to stop anyone doing by hand.

## Increment 4 is built, verified and merged

All eight tasks of `docs/superpowers/plans/2026-08-03-increment-4-own-api-key.md`,
inline on `dev`, one commit each, plus Truman's one device finding. **333 Jest,
70 `node --test`, typecheck clean.** `origin/main` is at **`c7e5f2c`**,
fast-forwarded from `dev` with his explicit permission on 2026-08-03.

**Device-verified** from run `30884750888`, driven by Truman. It works. His one
change was that the onboarding key field showed the key in the clear while
Settings masked it — now masked with a Show/Hide toggle, because a pasted GUID
is unverifiable when masked and the only later feedback would be the arrival
board saying the key was rejected, which the app cannot distinguish from a
mistyped one.

**The `EXPO_PUBLIC_THEBUS_APP_ID` repository secret is deleted.** The `.ipa`
build on `main` (run `30892749009`) then went green *with no secret in the
repository at all*, which is the claim proven rather than argued. The plan's *What was built* section records where reality disagreed
with it; read that rather than the diff.

The shape: `KeyGate` sits above the router in `AppShell`, so no screen mounts
without a key — which is what stops "no key yet" from being a fourth §4 state in
every data view. `TheBusProvider` holds the key and rebuilds the client when it
changes, and that rebuild is also what clears `withCache`. A rejected key is
`unauthorized`, recognised from the body because this API reports every error as
HTTP 200.

**Truman's two calls, settled at the start of the session:** keep the **hard
gate** (it is less work, and it was his product call anyway — the soft gate was
reopened only because the floor decision revived its premise), and **no separate
public data repo**; this repo goes public with the data build in it.

Three findings from task 0's live probe that were not expected:

- **The rejection message is per-endpoint.** `arrivalsJSON` says "Invalid or
  unspecified API key", `routeJSON` says "Application key was not found". Only
  the first is reachable today, so a matcher written against it alone would have
  looked correct indefinitely. Both are matched.
- **Parameters are validated before the key**, so a bad key with a bad stop
  reports the stop. The absence of a key error does not prove a key is good —
  one more reason onboarding does not validate.
- **`routeJSON`'s `headsign=` search is broken**, 500 for every non-empty value,
  with a valid key too. Unused by the app. `docs/api/README.md` records it, and
  notes it was checked against the valid key *before* being written down — the
  first reading was "a bad key 500s this endpoint", which would have been wrong.

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

- **The boundary review is done** — `c7e5f2c..dev`, on 2026-08-04. Do not redo
  it. One fix came out of it and the rest is triaged in `docs/backlog.md`.
- **`superpowers:systematic-debugging`** — if anything about the *appearance*
  of the app comes up. This project has repeatedly produced confident wrong
  claims by reasoning from source instead of observing a device.
- **`superpowers:finishing-a-development-branch`** — for the merge conversation,
  which is Truman's call every time.
- **Not `superpowers:dispatching-parallel-agents` or
  `subagent-driven-development`.** `CLAUDE.md` is explicit: execute inline, and
  review once at the increment boundary. Increment 1 cost more in process than
  in implementation and the project corrected for it.

## Environment notes

- Windows/WSL2, no Mac, no paid Apple Developer account. iOS builds run only on
  GitHub Actions. `/ios` and `/android` are prebuild output and must never be
  committed or hand-edited.
- **`workflow_dispatch` only works for a workflow that exists on `main`.** A
  workflow added on a branch is invisible to `gh workflow run --ref <branch>`
  until it merges — 404, not a permissions error. `ios-ipa.yml` can be run
  against any branch precisely because it is already on `main`.

  **`push` is the way round it**, and it is how `gtfs-data.yml` was proven
  before merging: `push` runs a workflow *as defined on the ref that was
  pushed*, which is the same mechanism by which `tests.yml` runs on `dev`. Add a
  `push:` trigger scoped to a throwaway branch, push it, then take the trigger
  back out. `schedule` and `repository_dispatch` are no help — both also run
  only from the default branch.
- **`expo-asset` is not resolvable from the project root.** npm nests it under
  `node_modules/expo/node_modules/`, so `require('expo-sqlite')` throws
  `Cannot find module 'expo-asset'` under Jest — anything importing
  `data/gtfs/files.ts` must double `expo-sqlite`. Pre-existing, not caused by
  Increment 5, and it does not affect the device: Metro resolves it.
- **There is no AppID in the repo, the build, or `.env` any more.** Increment 4
  moved it to the device keychain, entered by the user on first launch. The
  local `.env` still holds the old value and is gitignored; nothing reads it.
  The GitHub repository secret is kept until the `.ipa` is device-verified,
  then deleted by hand — deleting it first would turn a rollback into a
  re-registration.
- SDK pinned to 54 by the Expo Go ceiling. Install with `npx expo install`,
  never bare `npm install <pkg>`, never `npm audit fix --force`. The 12
  outstanding audit advisories are all in the web build and prebuild toolchains,
  none reach the device, and they have been triaged — do not "fix" them.
  (The count reads 15 as of 2026-08-03, not 12. `expo-secure-store` added none:
  it resolved with zero transitive dependencies, and every advisory root is
  still `@expo/cli`, `@expo/config-plugins`, `xcode`, `postcss` or `jest-expo`.)
- **WSL is in mirrored networking mode** (`%UserProfile%\.wslconfig`) so Expo Go
  on a physical iPhone can reach Metro, and a Hyper-V firewall rule named
  `ExpoGo8081` allows inbound TCP 8081. Without both, Metro binds an address the
  phone cannot route to. If Expo Go stops connecting, check those before
  suspecting the app.
- The API PDFs need `node scripts/pdf-text.mjs <file>` to read; `Read` cannot.
  It breaks lines mid-word, so pipe through `tr -d '\n'` to grep for a phrase.
