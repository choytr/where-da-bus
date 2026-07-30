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
assets/db/gtfs.db     the built asset, committed
```

Increments 2–3 add `data/thebus/` (the live API client) and
`features/arrivals/` (the arrival board). Neither exists yet.

**`data/gtfs/package.json` is three bytes and load-bearing.** It holds
`{"type":"module"}` so Node treats `data/gtfs/sql.ts` as ESM when
`data/gtfs/__tests__/sql.test.mjs` imports it — the root `package.json`
declares no `type`. It looks like cruft; deleting it breaks
`npm run test:scripts`.

Two boundaries carry real weight:

**`TheBusClient` is an interface.** UI code never touches a raw API response.
The exact endpoint shapes are still unverified (they sit behind AppID-gated
PDFs), and a JSON proxy remains a deferred option — the interface is what keeps
both from rippling into screens.

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

## Error handling is a feature here

Transit APIs fail constantly. Arrival views distinguish **loading**, **data with
age**, and **error with last-known values**. A spinner must never replace cached
data — show stale times with an explicit age instead. "No buses coming" and
"couldn't reach TheBus" must never render alike; that ambiguity is what makes a
transit app untrustworthy at a stop at night.

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
dropped. Exact wording is **pending verification** against the real user
agreement. Personal / open-source use only.
