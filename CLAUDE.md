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
`npm run typecheck` on Ubuntu for every push and pull request to `main`.

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
- **CI builds unsigned.** Signing happens on-device via SideStore with a free
  Apple ID. Never add signing steps or provisioning profiles to the workflow.
- `/ios` and `/android` are gitignored — they are `expo prebuild` output and
  must never be committed or hand-edited. Native config goes through `app.json`.

## Architecture

What exists after Increment 1. There is no `app/` directory and no
expo-router: `index.ts` registers `App.tsx` directly.

```
index.ts              registerRootComponent(App)
App.tsx               opens the bundled SQLite asset read-only, then HomeScreen
features/stops/       HomeScreen, StopRow, useLocation — nearby, search, favorites
data/gtfs/            sql.ts (queries), db.ts (typed hooks), feedValidity.ts
data/storage/         favorites persistence over AsyncStorage
lib/distance.ts       haversine metres between two coordinates
scripts/build-gtfs/   Node build: the GTFS feed -> assets/db/gtfs.db
scripts/pdf-text.mjs  reads docs/api/*.pdf (see below)
assets/db/gtfs.db     the built asset, committed
```

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

Increments 2–3 add `data/thebus/` (the live API client) and
`features/arrivals/` (the arrival board). Neither exists yet.

**`data/gtfs/package.json` is three bytes and load-bearing.** It holds
`{"type":"module"}` so Node treats `data/gtfs/sql.ts` as ESM when
`data/gtfs/__tests__/sql.test.mjs` imports it — the root `package.json`
declares no `type`. It looks like cruft; deleting it breaks
`npm run test:scripts`.

Two boundaries carry real weight:

**`TheBusClient` is an interface.** UI code never touches a raw API response.
The live endpoints are documented and verified in `docs/api/README.md` — read
that before writing any client code. Their JSON is string-typed throughout,
disagrees with its own field tables in three places, and uses `"0"` and `"???"`
as sentinels, so the mapping into app types is real work that belongs behind
this interface rather than in a screen.

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

## Legal

Per Oahu Transit Services' terms, the app must carry attribution and a
non-affiliation disclaimer. These live as constants so they cannot be silently
dropped, and the attribution is rendered at the **top** of the stop list
because the terms require prominent display.

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

The data is licensed "AS IS", and the license is revocable. Personal /
open-source use only.
