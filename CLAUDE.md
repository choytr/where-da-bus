# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

**WhereDaBus** — an unofficial real-time bus tracking app for Oahu (React
Native + Expo, iOS 18+), replacing the discontinued DaBus / HEA-TheBus apps. The
design lives in `docs/superpowers/specs/2026-07-29-wheredabus-design.md` and is
the source of truth for scope and sequencing.

## Commands

```bash
npm start              # Expo dev server — scan QR with Expo Go. The normal dev loop.
npm test               # Jest: everything that imports React Native
npm run test:watch     # The same, watching
npm run test:scripts   # node --test: the GTFS build script, and the SQL against the real asset
npm run typecheck      # tsc --noEmit
npm run build:gtfs     # Rebuild assets/db/gtfs.db from the feed (cached in .gtfs-cache)
```

**Two test runners, deliberately.** Jest (`jest-expo` preset, React Native
Testing Library) covers anything that touches React Native. The GTFS build
script and the SQL are plain Node — `node --test` runs them against
`node:sqlite` and the real built `assets/db/gtfs.db`, with no React Native in
the program at all. That is why Jest's config ignores `/scripts/`, and why a
change to the database layer needs *both* commands run.

`.github/workflows/tests.yml` runs `npm test`, `npm run test:scripts` and
`npm run typecheck` on Ubuntu for every push and pull request to **`main` and
`dev`**. Day-to-day work lands on `dev`, which exists so changes can reach
GitHub without spending macOS runner minutes — but "no `.ipa` build" must not
mean "no tests". Merging `dev` into `main` needs Truman's explicit permission.

**Run `npm ci` locally, not just `npm test`, after touching dependencies.**
`npm install` tolerates a peer conflict that `npm ci` refuses, so the working
tree can be green while every clean install fails at the first step. That is
exactly how `react-dom@19.2.8` — pulled in as an optional peer of expo-router,
against the pinned `react@19.1.0` — broke three pushes before anyone saw it.

iOS builds do **not** run locally. Pushing to `main` triggers
`.github/workflows/ios-ipa.yml`, which builds on a GitHub Actions macOS runner.

```bash
gh run list --limit 5           # Check build status
gh run view <id> --log-failed   # Debug a failed build
```

## The constraint that shapes everything

**Development happens on Windows with no Mac and no paid Apple Developer
account.** Consequences that are not obvious from reading the code:

- **Two loops.** Iteration runs in **Expo Go** over WiFi (instant, no CI). The
  `.ipa` path is slow and reserved for real device installs. See
  `docs/sideloading.md`.
- **Prefer modules Expo Go already bundles.** Adding a native module outside that
  set forces every subsequent change through the slow CI loop, so it is a real
  architectural decision rather than a routine install. It is why the map waited
  until Increment 3, and why `@gorhom/bottom-sheet` was acceptable when it came
  (pure JS over reanimated and gesture-handler, no native module of its own).
- **The SDK is pinned to 54 by Expo Go, not by preference.** The current App
  Store build of Expo Go on iOS 18 supports SDK 54 at most, so the project was
  downgraded from 57 on 2026-08-01 to keep the fast loop working at all. React
  is `19.1.0` and React Native `0.81.5` as a consequence. Install with
  `npx expo install`, never bare `npm install <pkg>` — bare installs pick the
  latest version and quietly break the ceiling. `npm audit fix --force` does
  the same thing and must not be run.
- **CI builds unsigned.** Signing happens on-device via SideStore with a free
  Apple ID. Never add signing steps or provisioning profiles to the workflow.
- **No secret reaches the build any more.** Increment 4 removed
  `EXPO_PUBLIC_THEBUS_APP_ID`; each user registers an AppID and pastes it into
  the app, where it lives in the keychain. The workflow injects nothing. The
  lesson that variable taught is not retired with it — see the environment
  section below.
- `/ios` and `/android` are gitignored — they are `expo prebuild` output and
  must never be committed or hand-edited. Native config goes through `app.json`.

## Architecture

Current as of Increment 7. Routing is **expo-router**: `package.json`'s `main`
is `expo-router/entry`, and every file under `app/` is a URL.

```
app/_layout.tsx        a Stack inside AppShell
app/(tabs)/            index -> MapScreen, stops -> StopsScreen, settings
app/stop/[code].tsx    -> ArrivalsScreen        (/stop/596)
app/route/[id].tsx     -> RouteScreen           (/route/1L)
AppShell.tsx           safe-area + gesture + theme + key gate + database gate
features/map/          MapScreen, StopSheet, StopCard, region.ts, labels.ts,
                       peek.ts (the sheet's band), useAnchoredStops
features/search/       useSearch (one engine, both hosts), FilterChips,
                       ResultList, RouteRow, SearchNudge, nudge.ts
features/stops/        StopsScreen, StopRow, useLocation — search, favorites
features/arrivals/     ArrivalsScreen, ArrivalRow, BoardHeader, board.ts, format.ts
features/routes/       RouteScreen — ordered stop list, entirely offline
features/settings/     appearance, the API key, stop-data freshness
features/onboarding/   KeyGate — no key, no app
data/gtfs/             sql.ts (queries + SCHEMA_VERSION + the floor), db.ts (hooks),
                       refresh.ts / dataRefresh.ts / files.ts (self-refresh),
                       feedValidity.ts
data/thebus/           TheBusClient: client.ts, parse.ts, time.ts, cache.ts,
                       provider.tsx (holds the user's key, builds the client)
data/storage/          favorites, theme, database pointer (AsyncStorage);
                       apiKey.ts (keychain)
data/geocode/          oahu.ts — address lookup, biased to the island
lib/                   distance, legal, theme.tsx, schedule.ts (see below)
scripts/build-gtfs/    the GTFS feed -> assets/db/gtfs.db, plus publish.mjs
scripts/pdf-text.mjs   reads docs/api/*.pdf (see below)
assets/db/gtfs.db      the bundled floor, committed
```

**Screens live under `features/`, not under `app/`.** Every file in `app/` is a
route, so a `__tests__` directory there would become navigable. Route files are
three lines that read a param and render a screen.

**`AppShell` is not `_layout.tsx`, deliberately.** It takes `children`, so
`__tests__/App.test.tsx` can drive the database-open outcomes without standing
up a router. See the safe-area section below for why the provider stays there
rather than being left to the one expo-router mounts.

## Where things are written down

| File | What it holds |
|---|---|
| `docs/handoff.md` | where the project is now, and what the next session picks up |
| `docs/superpowers/specs/2026-07-29-wheredabus-design.md` | scope and sequencing |
| `docs/api/README.md` | the live API, verified against the vendor PDFs |
| `docs/backlog.md` | known defects, triaged and deferred |
| `docs/sideloading.md` | getting a build onto a physical iPhone |

**The API PDFs need `scripts/pdf-text.mjs` to read.** `Read` renders PDFs via
`pdftoppm`, and poppler-utils is not installed here. Worse, the three
`docs/api/*JSON.pdf` sheets embed `Identity-H` subset fonts, so a naive text
extractor returns *zero bytes* and they look like scanned images. They are not.
`node scripts/pdf-text.mjs docs/api/arrivalsJSON.pdf` decodes them properly.

**`data/gtfs/package.json` is three bytes and load-bearing.** It holds
`{"type":"module"}` so Node treats `data/gtfs/sql.ts` as ESM when
`data/gtfs/__tests__/sql.test.mjs`, `scripts/build-gtfs/emit.mjs` and
`publish.mjs` import it — the root `package.json` declares no `type`. It looks
like cruft; deleting it breaks `npm run test:scripts` *and* the GTFS build.

Three boundaries carry real weight:

**`TheBusClient` is an interface.** UI code never touches a raw API response.
The live endpoints are documented and verified in `docs/api/README.md` — read
that before writing any client code. Their JSON is string-typed throughout,
disagrees with its own field tables in three places, and uses `"0"` and `"???"`
as sentinels, so the mapping into app types is real work that belongs behind
this interface rather than in a screen.

**The AppID belongs to the user, and there is no fallback.** `KeyGate` sits
above the router in `AppShell`, so no screen mounts without a key — which is
what keeps "no key yet" from being a state every data view has to render.
`TheBusProvider` holds the key and rebuilds the client whenever it changes;
that rebuild is also what clears `withCache`, whose entries are keyed by stop
code alone and would otherwise outlive the key that fetched them. A rejected
key is `ArrivalsFailure`'s `unauthorized`, recognised from the response body
because this API reports every error as HTTP 200, and it must never render like
`unreachable`: one is fixed by waiting and the other never is.

**GTFS static data is reference-only.** Oahu's feed scores grade F on freshness,
so bundled data supplies stop names, codes, coordinates, and which routes serve
which stop. Anything time-sensitive comes from the live API. No `.txt` ships:
`scripts/build-gtfs` reads the feed — including the 73 MB `stop_times.txt` —
and emits a ~1.2 MB SQLite asset holding only the relationships those files
imply. `stop_times.txt` itself is deliberately never an asset, being tens of MB
answering a question the live arrivals endpoint already answers.

The feed states the last day it is valid through, the build carries that into
the asset's `meta` table, and Settings says so once that day is past.

**The app refreshes this itself, and nobody rebuilds the asset by hand.** A
weekly Action (`.github/workflows/gtfs-data.yml`) rebuilds the feed and
publishes `gtfs-v<schema>-<builtAt>.db` plus `manifest.json` to the fixed `data`
release tag; the app checks the manifest shortly after launch, verifies
`sha256`, opens the download and counts its rows before trusting it, and moves a
stored pointer. **`assets/db/gtfs.db` stays in the bundle as the floor**, which
is what makes every failure in that chain degrade to stale data rather than
none. Do not "helpfully" run `npm run build:gtfs` and commit the result — that
is the thing the increment exists to stop.

**The one exception is a schema change.** A v3 binary needs a v3 floor, so
`SCHEMA_VERSION` and the committed asset move together, in the same commit. The
rule above exists to stop *routine* rebuilds, not to freeze the floor at a shape
the app can no longer read.

Three consequences worth knowing. **The pointer is read once per launch**, so a
build downloaded now is opened next launch — remounting `SQLiteProvider` would
remount the router underneath it and throw a rider back to the home screen.
And **`SCHEMA_VERSION` lives in `data/gtfs/sql.ts`**, imported by `emit.mjs` and
`publish.mjs` rather than copied, because the version in the filename is what
keeps a binary and a database in step. **The risk it guards is a new binary
reading old published data** — freshly installed, handed the generation
published last week, which passes the hash and the floor and then fails on
every query touching the table it lacks — and not, as this file said until
Increment 9, an old binary reading new data.

**Old generations no longer have to stay published forever.** That rule came
from Increment 5, was retired in Increment 9 as premature while Truman is the
only user, and its real requirement is now validated directly instead:
`route_directions` is in `FLOOR_COUNTS`, so `files.ts` rejects a database of the
wrong shape *structurally* rather than trusting its filename. Prune the `data`
release freely; revisit if anyone else installs the app.

## How work gets done here

These bullets are a settled middle between two failures: a first increment
whose plan was longer than the code it produced, and a second with no spec or
plan at all whose decisions were recoverable only from twelve commits.

- **The design conversation comes first.** Truman asks to be grilled before an
  increment is specced, and it is where the real decisions get made — see
  `docs/handoff.md`.
- **Every increment gets a spec and a plan, both kept.** The spec says what is
  being built and why, and records the decisions already settled so they are not
  re-argued; the plan breaks it into tasks. Written before the code, updated
  when reality disagrees. `docs/superpowers/specs/2026-08-02-increment-3-map.md`
  and its plan are the reference shape.
- **Plans specify contracts, not code.** Per task: the files touched, the
  exported signature, the test names, and any decision already settled. Ten
  lines, not two hundred. Plans grow to this size to be executable by a cold
  subagent — so don't write for one.
- **Execute inline by default.** Subagents earn their cost when work is
  genuinely independent and the deliverable is a *conclusion* rather than a
  file — reading the six API PDFs and reporting their field tables was a good
  use. The sequential tasks of one increment share a data model, and each cold
  spawn re-derives it.
- **Review once at the increment boundary, on the whole diff.** That is where
  the cross-cutting findings live; per-task review structurally cannot see
  them. `docs/backlog.md` takes everything not worth fixing now, and that
  triage is the point rather than a failure of the review.
- **Trust what is already written down.** This file and `docs/api/README.md`
  exist so the traps are not re-derived from source each session. The README
  marks which of its claims are vendor quotes and which are readings of a
  single example — re-confirm the readings against the live API, not against
  the PDFs again.

**Device verification is not what gets cut.** Nine review rounds, 90 Jest tests
and a clean typecheck all missed that `SafeAreaView` had no provider and the
search field rendered under the Dynamic Island. Sideloading it caught that in
under a minute. It is the cheapest bug-per-token check this project has, and
trimming review makes it more load-bearing, not less. `ios-ipa.yml` declares
`workflow_dispatch`, so a branch can be built without merging:
`gh workflow run ios-ipa.yml --ref <branch>`.

## React Native Testing Library 14 is async, and fails silently when you forget

`render`, `renderHook`, `rerender` and `unmount` **all return promises** — the
React 19 renderer flushes through an async `act`. Every call site must `await`.

Forgetting does not throw. The tree never mounts, no effect runs, and the
symptom is `result.current` being `undefined`, or `screen` reporting
"`render` function has not been called" — neither of which points at a missing
keyword. Existing suites already do `await render(<App />)`; copy that shape.

**`fireEvent` is in that set too.** `await fireEvent.press(...)` and
`await fireEvent.changeText(...)`, and the failure is quieter than the render
one: without the `await`, a press lands before the state from the previous
event has flushed. A control that is `disabled` until a field is non-empty
therefore never fires, the handler never runs, and the test fails on the
*assertion* — with the component and the handler both perfectly correct. Four
of `KeyGate.test.tsx`'s tests were written without it and failed exactly this
way. Every existing suite already awaits it; copy that shape.

Two more, both of which break the *next* test in the file rather than the one
that caused them, which makes them look like a broken component:

- **Drive `AppState` transitions through an async `act`.** Backgrounding and
  foregrounding start a fetch from outside React's render cycle, and its
  `setState` lands a microtask after a synchronous `act(() => …)` has closed.
- **`await cleanup()` before swapping fake timers back.** RNTL registers its
  auto-cleanup as a top-level `afterEach`, which Jest runs *after* a
  `describe`-level one — so components mounted in the test are still mounted
  and still polling while `jest.useRealTimers()` runs.
- **Turning fake timers on for *one* test in a real-timer suite needs
  `doNotFake`.** Use
  `jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] })`.
  React Native's async `act` and the AsyncStorage mock both resolve through
  `setImmediate`; faking it leaves the renderer wedged *after that test
  unmounts*. The next test to render times out in `waitFor` and the one after
  hangs the run with no output at all — so the symptom is a suite that produces
  nothing, pointing at neither the test that caused it nor the timer. The
  offending test passes in isolation, which is what makes `-t` bisection read
  like the test is fine. A suite that fake-times *every* test (see
  `ArrivalsScreen.test.tsx`) never switches back and so never hits this.

`jest.advanceTimersByTimeAsync` awaits inside its calling `act` scope and trips
React's overlapping-act guard. Advance synchronously inside an async `act`
instead: `await act(async () => { jest.advanceTimersByTime(ms); })`.

## Error handling is a feature here

Transit APIs fail constantly. Arrival views distinguish **loading**, **data with
age**, and **error with last-known values**. A spinner must never replace cached
data — show stale times with an explicit age instead. "No buses coming" and
"couldn't reach TheBus" must never render alike; that ambiguity is what makes a
transit app untrustworthy at a stop at night.

## Safe area insets need the provider, not just the view

`SafeAreaView` from `react-native-safe-area-context` is a **native** view. It
finds its insets by walking up the *native* view tree for an
`RNCSafeAreaProvider` (`findNearestProvider`, in
`ios/Fabric/RNCSafeAreaViewComponentView.mm`); with no provider that walk falls
through to `return self` and every inset comes back zero. It reads no React
context, so nothing warns you — the app just renders under the Dynamic Island.
`AppShell.tsx` mounts `SafeAreaProvider` for this reason. Do not remove it.

Jest cannot exercise the native inset resolution — that mechanism is
Objective-C walking a view tree that does not exist under test — but it does
catch the removal, and only because something explicitly calls the hook that
throws without a provider. **`InsetReader` in `__tests__/App.test.tsx` exists
solely to call `useSafeAreaInsets`; do not replace it with a component that does
not.** The screens no longer do it themselves: `StopsScreen` reads the safe area
through `SafeAreaView`, which does *not* throw. `DatabaseGate` also swallows the
throw, so the failure surfaces as a `waitFor` timeout that looks exactly like
the cold-cache flake in `docs/backlog.md` — the "rather than the
database-failure screen" test exists to name the real cause.

**Never wire in `react-native-safe-area-context/jest/mock`.** It looks like the
obvious cleanup. It replaces `useSafeAreaInsets` with a stub returning zero
insets instead of throwing, which deletes the only guard this project has
against the bug above.

Test files seed metrics by two different routes, and have to.
`initialWindowMetrics` is read from the native module at import time and is
`null` off-device; a provider seeded with `null` renders nothing at all under
Jest, blanking the tree so every assertion fails for an unrelated-looking
reason. Screen suites wrap the screen in their own `SafeAreaProvider` with
explicit `initialMetrics`. `App.test.tsx` cannot — `AppShell` owns the provider
— so it mocks the module's `initialWindowMetrics` instead, substituting the
provider's *input*.

## Timer handles never escape a closure

**Use `schedule(fn, ms)` and `repeat(fn, ms)` from `lib/schedule.ts`.** Both
return a canceller, and the handle is never given a type at all — so the wrong
method is unexpressible rather than merely mistyped.

That module exists because the handle cannot be typed correctly here.
`@types/node` is loaded project-wide (`tsconfig.json`'s `types`) so `node:sqlite`
resolves in the GTFS build script, and its ambient `setTimeout`/`setInterval`
overloads (returning `NodeJS.Timeout`) therefore win over React Native's
(returning `number`). React Native returns a plain numeric ID at runtime, so
`.unref()` / `.refresh()` typecheck cleanly and then fail on a device.
`ReturnType<typeof setInterval>` is no escape — same wrong type, same reason —
and annotating `const n: number = setTimeout(...)` is TS2322 here, verified,
which would need the type assertion this project forbids. So the handle stays
inside a closure and callers get a `() => void`.

## Legal

Per Oahu Transit Services' terms, the app must carry the attribution. It lives
in **`lib/legal.ts`** so it cannot be silently dropped, and is rendered through
**`lib/Attribution.tsx`**, which owns its placement for the same reason.

**The non-affiliation disclaimer is ours, not theirs.** Verified 2026-08-08
against the full Terms of Use: the words *affiliate*, *endorse* and their
variants appear nowhere in it. Nothing requires one — it is kept because it is
true and prudent for an unofficial app, which means its wording and placement
are ours to choose. It lives in Settings' About and nowhere else; Truman had it
removed from the lists on 2026-08-09.

**The legend closes the content it attributes; it does not lead it.** The clause
is "You must present the Data with the following legend, prominently displayed",
and that obligation attaches to *presenting the Data* — not to the top of a
screen, not to repetition within one, and not to a screen that presents no Data.
So `KeyGate` carries it not at all, Settings carries it in About, and every data
surface pins it below its scroll. The map sheet omits it at the collapsed
detent, which shows no Data. `lib/Attribution.tsx` holds the reasoning.

They are in `lib/` rather than on a screen for a concrete reason: while they
lived on the stop list, the arrival board had to import that screen — and with
it AsyncStorage, expo-location and the whole GTFS query layer — to render one
line of small print. An obligation every data-showing screen carries must not be
reachable only through whichever screen declared it first.

The required wording is **verified** against the Terms of Use page of
`docs/api/Web_Services_API.pdf` and is reproduced verbatim, including the
missing full stop after "Inc":

```
Route and arrival data provided by permission of Oahu Transit Services, Inc
```

The terms permit the marks `OTS` and `HEA` only alongside an asterisked
trademark legend. This project keeps those marks — and `TheBus` — out of UI
copy entirely, which sidesteps that requirement rather than complying with it.
Introducing any of them makes the legend mandatory.

**`vehicle:driver` is an employee number**, confirmed by the vendor
documentation. It must never be displayed, logged, or persisted.

The data is licensed "AS IS", and the license is **revocable**.

**It is not restricted to personal use.** Verified against the full Terms of Use
on 2026-08-02: the grant is "a limited, revocable license to use, reproduce, and
redistribute the Data," and the words *personal*, *non-commercial* and
*commercial* appear nowhere in the document. Earlier revisions of this file and
the design spec said "personal / open-source use only" — that was a reading
someone hardened into a rule, and it is wrong. The real constraints are the four
the terms actually impose: the verbatim attribution, the marks clause, "AS IS"
with no warranty, and an indemnity running to OTS.

Revocability is the live risk, not scope of use. Nothing here is a promise that
the API keeps answering.
