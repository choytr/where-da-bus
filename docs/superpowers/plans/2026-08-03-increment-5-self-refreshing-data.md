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
