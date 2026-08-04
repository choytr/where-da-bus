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
  set forces every subsequent change through the slow CI loop. This is why maps
  are deferred to Increment 3 rather than being built early. Adding such a
  dependency is a real architectural decision, not a routine install.
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

What exists after Increment 2. Routing is **expo-router**: `package.json`'s
`main` is `expo-router/entry`, and every file under `app/` is a URL.

```
app/_layout.tsx       ten lines: a Stack inside AppShell
app/index.tsx         -> HomeScreen
app/stop/[code].tsx   -> ArrivalsScreen        (/stop/596)
app/route/[id].tsx    -> RouteScreen           (/route/1L)
AppShell.tsx          SafeAreaProvider + key gate + database gate; takes children
features/stops/       HomeScreen, StopRow, useLocation — nearby, search, favorites
features/arrivals/    ArrivalsScreen, ArrivalRow, useArrivals, useNow, format.ts
features/routes/      RouteScreen — ordered stop list, entirely offline
features/onboarding/  KeyGate — no key, no app
data/gtfs/            sql.ts (queries), db.ts (typed hooks), feedValidity.ts
data/thebus/          TheBusClient: client.ts, parse.ts, time.ts, types.ts,
                      provider.tsx (holds the user's key, builds the client)
data/storage/         favorites + theme over AsyncStorage; apiKey.ts over the keychain
lib/distance.ts       haversine metres between two coordinates
lib/schedule.ts       timers that return a canceller, not a handle (see below)
lib/legal.ts          the required attribution and disclaimer
scripts/build-gtfs/   Node build: the GTFS feed -> assets/db/gtfs.db
scripts/pdf-text.mjs  reads docs/api/*.pdf (see below)
assets/db/gtfs.db     the built asset, committed
```

**Screens live under `features/`, not under `app/`.** Every file in `app/` is a
route, so a `__tests__` directory there would become navigable. Route files are
three lines that read a param and render a screen.

**`AppShell` is not `_layout.tsx`, deliberately.** It takes `children`, so
`__tests__/App.test.tsx` can drive the three database-open outcomes without
standing up a router. See the safe-area section below for why the provider
stays there rather than being left to the one expo-router mounts.

## Where things are written down

| File | What it holds |
|---|---|
| `docs/superpowers/specs/2026-07-29-wheredabus-design.md` | scope and sequencing — the source of truth |
| `docs/api/README.md` | the live API, verified against the vendor PDFs |
| `docs/backlog.md` | known defects, triaged and deferred, from Increment 1's reviews |
| `docs/sideloading.md` | getting a build onto a physical iPhone |

**The API PDFs need `scripts/pdf-text.mjs` to read.** `Read` renders PDFs via
`pdftoppm`, and poppler-utils is not installed here. Worse, the three
`docs/api/*JSON.pdf` sheets embed `Identity-H` subset fonts, so a naive text
extractor returns *zero bytes* and they look like scanned images. They are not.
`node scripts/pdf-text.mjs docs/api/arrivalsJSON.pdf` decodes them properly.

Increment 3 adds the map. `data/thebus/` and `features/arrivals/` now exist.

**`data/gtfs/package.json` is three bytes and load-bearing.** It holds
`{"type":"module"}` so Node treats `data/gtfs/sql.ts` as ESM when
`data/gtfs/__tests__/sql.test.mjs` imports it — the root `package.json`
declares no `type`. It looks like cruft; deleting it breaks
`npm run test:scripts`.

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
the asset's `meta` table, and the home screen says so once that day is past.
Refreshing the feed on-device is Increment 3; until then a rebuild is
`npm run build:gtfs` plus a commit of the regenerated asset.

## How work gets done here, from Increment 2 on

Increment 1's plan ran 8,015 words against 6,250 words of shipped source,
because it carried near-complete code for each of its nine tasks. The code was
therefore written twice, and every subagent dispatched to execute one task read
the whole plan to find its slice. Nine per-task review rounds followed. The
process cost more than the implementation.

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

**Increment 2 has no spec and no plan, and that is the correction overshooting
rather than an oversight worth imitating.** Increment 1's 8,015-word plan was so
expensive that the next increment was built from a todo list and commit messages
alone, which left its decisions — expo-router over React Navigation, the
DaBus-shaped arrival board, the `estimated === "1"` whitelist — recoverable only
by reading twelve commits. The compromise is the bullets above: a short spec
plus a contract-level plan, neither of which carries code. Increment 2 is not
being back-filled; a spec for shipped work is ceremony, and `docs/handoff.md`
plus those commit messages already hold the reasoning.

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

Two more, both of which break the *next* test in the file rather than the one
that caused them, which makes them look like a broken component:

- **Drive `AppState` transitions through an async `act`.** Backgrounding and
  foregrounding start a fetch from outside React's render cycle, and its
  `setState` lands a microtask after a synchronous `act(() => …)` has closed.
- **`await cleanup()` before swapping fake timers back.** RNTL registers its
  auto-cleanup as a top-level `afterEach`, which Jest runs *after* a
  `describe`-level one — so components mounted in the test are still mounted
  and still polling while `jest.useRealTimers()` runs.

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
`App.tsx` mounts `SafeAreaProvider` for this reason. Do not remove it.

Jest cannot exercise the native inset resolution — that mechanism is
Objective-C walking a view tree that does not exist under test — but it does
catch the removal. `HomeScreen` calls `useSafeAreaInsets`, which *throws*
without a provider, so `__tests__/App.test.tsx` fails if the provider ever
goes. `DatabaseGate` swallows the throw, though, so the failure surfaces as a
`waitFor` timeout that looks exactly like the cold-cache flake in
`docs/backlog.md`; the "rather than the database-failure screen" test exists to
name the real cause.

**Never wire in `react-native-safe-area-context/jest/mock`.** It looks like the
obvious cleanup for the two test files below. It replaces `useSafeAreaInsets`
with a stub returning zero insets instead of throwing, which deletes the only
guard this project has against the bug above.

The two test files seed metrics by different routes, and have to.
`initialWindowMetrics` is read from the native module at import time and is
`null` off-device; a provider seeded with `null` renders nothing at all under
Jest, blanking the tree so every assertion fails for an unrelated-looking
reason. `HomeScreen.test.tsx` wraps the screen in its own `SafeAreaProvider`
with explicit `initialMetrics`. `App.test.tsx` cannot — `App` owns the provider
— so it mocks the module's `initialWindowMetrics` instead, substituting the
provider's *input*.

## Timer handles never escape a closure

`lib/schedule.ts` exists for this. Use `schedule(fn, ms)` and `repeat(fn, ms)`;
both return a canceller, and the handle is never given a type at all — so the
wrong method is unexpressible rather than merely mistyped. The reasoning:

## Timer handles are `number`, never `NodeJS.Timeout`

`@types/node` is loaded project-wide (`tsconfig.json`'s `types`) so
`node:sqlite` resolves in the GTFS build script and its tests. Side effect:
`@types/node`'s ambient `setTimeout`/`setInterval` overloads (returning
`NodeJS.Timeout`) win over React Native's (returning `number`). The 60-second
arrivals poll and anything else that holds a timer handle must type it as
`number` explicitly — `ReturnType<typeof setInterval>` is **not** a safe
alternative, since it resolves to `NodeJS.Timeout` for the same reason. React
Native returns a plain numeric ID at runtime, not a `Timeout` object, so
`.unref()` / `.refresh()` will typecheck cleanly and then fail at runtime.

Annotating as `number` cannot actually be written without a type assertion,
which this project also forbids — `const n: number = setTimeout(...)` is
TS2322 here, verified. Hence `lib/schedule.ts` above: keep the handle inside a
closure and hand back a `() => void`.

## Legal

Per Oahu Transit Services' terms, the app must carry attribution and a
non-affiliation disclaimer. These live in **`lib/legal.ts`** so they cannot be
silently dropped, and the attribution is rendered at the **top** of the stop
list, the arrival board and the route detail alike, because the terms require
prominent display wherever their data appears.

They are in `lib/` rather than on a screen for a concrete reason: while they
lived on `HomeScreen`, the arrival board had to import a screen — and with it
AsyncStorage, expo-location and the whole GTFS query layer — to render one line
of small print. An obligation every data-showing screen carries must not be
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
