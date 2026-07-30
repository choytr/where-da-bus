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
npx tsc --noEmit       # Typecheck
```

No test runner is configured yet. Jest + `jest-expo` + React Native Testing
Library arrive with Increment 1 — do not reference test commands until they exist.

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

```
app/          expo-router screens
features/
  stops/      search, favorites
  arrivals/   arrival board
data/
  thebus/     TheBusClient interface + network implementation
  gtfs/       bundled static reference data (SQLite)
  storage/    favorites persistence
lib/          time, geo
```

Two boundaries carry real weight:

**`TheBusClient` is an interface.** UI code never touches a raw API response.
The exact endpoint shapes are still unverified (they sit behind AppID-gated
PDFs), and a JSON proxy remains a deferred option — the interface is what keeps
both from rippling into screens.

**GTFS static data is reference-only.** Oahu's feed scores grade F on freshness,
so bundled data supplies stop names, IDs, and coordinates. Anything
time-sensitive comes from the live API. Only `stops.txt` and `routes.txt` ship;
`stop_times.txt` is deliberately excluded as tens of MB answering a question the
live arrivals endpoint already answers.

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
