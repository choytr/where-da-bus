# Plan — Increment 5: the data refreshes itself

Contracts, not code. Spec:
`../specs/2026-08-03-increment-5-self-refreshing-data.md`, **and its
*Revision: keep the floor* section**, which reverses the spec's headline
decision and is the version this plan implements.

**Do not start this until Increment 4 has shipped and the repo has been made
public by hand.** The order is load-bearing; the spec says why.

Executed **inline**, in order, on `dev`. Review once at the end, on the whole
diff. Device-verify before asking to merge.

**No new npm dependencies at the app layer** beyond the SDK 54 bundled set:
`npx expo install expo-file-system expo-crypto`. `expo-sqlite` is already here.

**Truman's instruction for this increment: keep it as simple as possible, get
it working with a reasonable architecture, handle edge cases after.** The
spec's *Deferred on purpose* list is therefore binding — no ETags, no
signatures, no backoff, no bad-build blocklist. Two things in it look like edge
cases and are not, because retrofitting them means rewriting the core:
**generation + pointer** and **`sha256` verification**. Both are in.

---

## 1. The schema version, asserted in both directions

- `scripts/build-gtfs/emit.mjs`, `data/gtfs/sql.ts`,
  `scripts/build-gtfs/__tests__/`, `data/gtfs/__tests__/sql.test.mjs`
- `emit.mjs` writes `schema_version` into the existing `meta` table
- `sql.ts` exports `SCHEMA_VERSION = 1` — the version the app is compiled
  against, and the `v1` in every filename below
- A `node --test` case asserts **the constant equals what the build emits**.
  The discipline this increment needs — bump in two places, leave old assets
  published — is exactly what gets forgotten, so it gets a test rather than a
  note.

## 2. The publishing Action

- `.github/workflows/gtfs-data.yml` (new)
- Weekly cron plus `workflow_dispatch`. Runs `npm run build:gtfs`.
- **Change detection by hash, not by date.** Download the feed, `sha256` the
  zip, compare against `sourceSha256` in the currently published manifest. Equal
  → exit without publishing. This is a fact rather than an inference about a
  cadence nobody knows.
- **Floor check before publishing:** `stops > 3000`, `routes > 100`,
  `stop_routes > 5000`. A truncated upstream zip builds a perfectly valid,
  perfectly hashed, forty-stop database — the checksum cannot catch that and
  this is the only thing that does. Fail the run loudly.
- Publishes to the fixed release tag `data` on this repo:
  `gtfs-v1-<builtAt>.db` **first**, `manifest.json` **second, always**. A
  manifest that exists therefore always describes an asset that exists.
- Manifest: `{ schemaVersion, builtAt, file, bytes, sha256, sourceSha256, feedEndDate }`.
  `file` is the generation filename; the app cannot guess it.
- Does **not** commit anything. `assets/db/gtfs.db` in the repo is the floor and
  is left alone.

## 3. Fetching and verifying

- `data/gtfs/refresh.ts` (new), `data/gtfs/__tests__/refresh.test.ts` (new)
- `checkForUpdate(fetch, currentBuiltAt): Promise<Manifest | null>` — null when
  nothing newer
- `downloadDatabase(manifest): Promise<string>` — downloads to `<file>.part` in
  the SQLite directory, `sha256`s it with `expo-crypto`, and only then renames
  it to `manifest.file`. Returns the final name.
- A hash mismatch deletes the `.part` and throws. It never touches the database
  in use.
- **Rejects a manifest whose `schemaVersion !== SCHEMA_VERSION`** — belt to the
  filename's braces
- Tests: `reports no update when builtAt matches`; `reports an update when
  newer`; `ignores a manifest for another schema version`; `discards a download
  whose hash does not match`; `leaves the current database untouched on failure`

## 4. Generations and the pointer

- `data/storage/database.ts` (new), `AppShell.tsx`,
  `data/storage/__tests__/database.test.ts` (new)
- `loadCurrentDatabase(): Promise<string | null>` / `saveCurrentDatabase(name)`
  over AsyncStorage, key `gtfs.current.v1`. Null means "use the bundled floor".
- `AppShell` passes `databaseName={current ?? 'gtfs.db'}` to `SQLiteProvider`,
  and keeps `assetSource` **only** on the floor path. Changing the pointer
  remounts the provider onto the new file.
- **Nothing ever overwrites an open database.** Each build lands at its own
  filename; the pointer moves; the old generation is deleted on the *next*
  launch, when nothing holds it. Sweep at startup: delete every
  `gtfs-v1-*.db` that is not the pointer.
- The app-side floor check runs here — one `SELECT count(*)` before the pointer
  moves. A database that fails it is deleted and the pointer stays put.
- Tests: `falls back to the bundled database when no pointer is set`; `opens the
  pointed-to generation`; `does not move the pointer when the floor check
  fails`; `deletes stale generations at startup`

## 5. Wiring the check into launch

- `AppShell.tsx` or a small `useDataRefresh` hook beside `refresh.ts`
- Runs **after** first paint, in the background, and **never blocks the UI**.
  The floor is already open and usable; this is an upgrade, not a prerequisite.
- Failure is silent apart from the "last checked" timestamp. There is a working
  database underneath — a modal about a failed background refresh would be
  worse than saying nothing.
- Timers go through `lib/schedule.ts`. No raw handles — see `CLAUDE.md`.

## 6. Settings, and telling the truth about freshness

- `features/settings/SettingsScreen.tsx`, `data/gtfs/feedValidity.ts`, their tests
- The existing `STOP DATA` section gains: last checked, the current build's
  `builtAt`, and a **Check now** control with its own in-progress and failure
  states
- `feedValidity.ts` can now say something true about data *not yet downloaded* —
  "good through 22 August, and a fresher build is available" — because the
  manifest carries `feedEndDate`. This is the one thing a `HEAD` request could
  never have provided.
- **`feedEndDate` is for display only and must never gate a download.** Expiry
  and republication are different things; the spec has the full argument.

---

## Verification

`npm test`, `npm run test:scripts`, `npm run typecheck`, `npm ci`.

Then trigger `gtfs-data.yml` by hand and confirm the release assets appear in
the right order.

Then the device round, which is where the real risk is: **install the `.ipa`,
confirm it opens on the bundled floor, let it refresh, force-quit, relaunch,
and confirm it opens the downloaded generation and the old file is gone.** The
generation design exists so this cannot corrupt anything — that is a claim
about a mechanism, and it has not been observed until it has been observed.

---

## What was built — 2026-08-04

All six tasks, inline on `dev`, one commit each: `08dc855`..`c20946e`. **387
Jest, 73 `node --test`, typecheck clean, `npm ci` clean.** Not reviewed, not
device-verified, not merged.

Where reality disagreed with the plan above:

- **The pointer moves now; the app opens the new file on the *next* launch.**
  Task 4 said "changing the pointer remounts the provider onto the new file",
  and that is wrong for a reason the plan could not see: the router is
  *underneath* `SQLiteProvider`. A changed `databaseName` remounts it and every
  screen below, so a background download completing would throw a rider halfway
  through an arrival board back to the home screen. `AppShell` reads the pointer
  once at mount and never re-reads. Settings' wording says so outright, and
  "installed" is a separate outcome from "up to date" because of it.
- **`SCHEMA_VERSION` and the floor live in `data/gtfs/sql.ts`**, which
  `emit.mjs` and `publish.mjs` both import directly — Node's type stripping
  loads the `.ts`, the same route `sql.test.mjs` already took. The plan implied
  a constant on each side plus a test tying them together; one constant needs no
  tying.
- **`assets/db/gtfs.db` was deliberately not rebuilt**, so the shipped floor has
  no `schema_version` column. It shipped inside the binary and is never asked
  what schema it is; `inspect` reports `null` for a missing column and
  `installUpdate` only rejects a version that disagrees. The build's stamp is
  asserted in `emit.test.mjs` against a synthetic build rather than against the
  committed artifact, which tests the build rather than a file.
- **The floor check needed a seam.** `data/gtfs/files.ts` is the only module in
  the refresh path importing a native one, and it grew an `inspect(name)` beyond
  the plan's file operations — opening a downloaded generation to count its rows
  is what proves the build, and it has to happen before the pointer moves.
- **`refreshStopData` coalesces concurrent callers.** Not in the plan, and not
  optional: the launch check and Settings' **Check now** overlap by construction,
  and two runs would download to the same `.part` file.
- **Settings does not say "a fresher build is available".** Task 6 wanted
  `feedValidity` to speak about data not yet downloaded. With the floor kept and
  the refresh automatic, the app downloads what it finds rather than sitting on
  the knowledge, so that state is transient. The section reports the build in
  use and when it last looked.
- **A missing generation file is not guarded.** If the pointer named a file that
  had vanished, `SQLiteProvider` would create an empty database at that name.
  Left unbuilt on purpose: AsyncStorage and the SQLite directory live in the
  same container and go together, so the state needs a way to arise that nobody
  has named. `staleGenerations` never sweeps the file the pointer names, which
  is the path that could otherwise have caused it.

**One Jest trap, new, and now in `CLAUDE.md`.** Turning fake timers on for a
single test in a real-timer suite needs
`doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick']`. Without it the
renderer stays wedged after that test unmounts: the next test to render times
out in `waitFor`, and the one after hangs the run with no output at all. The
offending test passes in isolation the whole time, so `-t` bisection says it is
fine.

### What verification is still outstanding

- **`gtfs-data.yml` has not run.** `workflow_dispatch` requires the workflow
  file on the **default branch**, so `gh workflow run gtfs-data.yml --ref dev`
  is a 404 until `dev` merges. Its two node steps *were* run end to end locally
  — `check` (feed downloaded and hashed), `npm run build:gtfs`, then `package`
  (floor check passed at 3,830 stops / 118 routes / 8,629 stop_routes, manifest
  written) — so what is unproven is the YAML and the upload ordering, not the
  logic.
- **Nothing has been on a device.** And there is nothing published for a device
  to download: with no release, `checkForUpdate` gets a 404 and the app stays on
  the floor. A build off `dev` would exercise the *failure* path only.
