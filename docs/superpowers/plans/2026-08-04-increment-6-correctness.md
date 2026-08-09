# Increment 6 — plan for the correctness half

Spec: `docs/superpowers/specs/2026-08-04-increment-6-correctness-and-ui.md`.

**Contracts, not code.** Files touched, exported signatures, test names, and
decisions already settled. The UI half has no plan by design — see the spec, and
`docs/superpowers/logs/2026-08-04-increment-6-ui.md`.

**Order matters in one place only:** Task 3 must be committed, built and
published as one step. The rest are independent.

Run after each task: `npm test`, `npm run typecheck`. Tasks 3 and 7 also need
`npm run test:scripts`.

---

## Task 1 — A pointer to a missing file must fall back to the floor

**Files:** `AppShell.tsx`, `data/gtfs/files.ts` (no change expected),
`__tests__/App.test.tsx`.

`useCurrentDatabaseName` resolves to a stored generation name without checking
that the file exists. `openDatabaseAsync` creates what it cannot find, so the
open succeeds and every screen shows nothing.

**Contract:** `useCurrentDatabaseName` consults `databaseFiles.list()` and
returns `BUNDLED_DATABASE` unless the stored name is present. Signature
unchanged: `() => string | null`.

**Settled:** the cost is pulling `expo-file-system` into the shell's module
graph, so every suite that renders `AppShell` must double `expo-sqlite` — see
the `expo-asset` note in `docs/handoff.md`. That cost was accepted knowingly;
this is the worst failure shape in the app.

**Tests:** `falls back to the bundled database when the stored pointer names a
file that is not there`; `opens the stored generation when it exists`; `falls
back when listing the directory throws`.

---

## Task 2 — A render error must not be reported as a database failure

**Files:** `AppShell.tsx`, `__tests__/App.test.tsx`.

`DatabaseGate` sits above everything and renders `Unavailable` — "Reinstalling
the app is the usual fix" — for any error thrown below it.

**Contract:** the database boundary narrows to wrap `SQLiteProvider` only. A
second boundary above the router reports an unexpected failure without
diagnosing it as missing stop data. Both keep `getDerivedStateFromError`; no
`onError` (`SQLiteProvider` throws when it is combined with `useSuspense`).

**Settled:** copy for the new boundary is provisional and goes to Truman with a
screenshot. It must not say "reinstall".

**Added 2026-08-05:** the backlog crash is now narrowed to the map's tap-hold
*Search here* interaction. That is below this boundary, so this task is what
decides whether its next occurrence is legible or is reported as missing stop
data.

**Watch:** `__tests__/App.test.tsx`'s `InsetReader` exists solely to call
`useSafeAreaInsets` so that removing `SafeAreaProvider` fails a test. Do not
disturb it. `DatabaseGate` swallowing that throw is why the "rather than the
database-failure screen" test exists; narrowing the boundary may change which
one catches it.

**Tests:** `reports an unexpected error without blaming the stop data`; the
existing database-failure tests must still pass unchanged.

---

## Task 3 — `route_stops` must not lose a stop to a dropped `_merge` twin

**Files:** `scripts/build-gtfs/emit.mjs`,
`scripts/build-gtfs/__tests__/emit.test.mjs`, `assets/db/gtfs.db`,
`.github/workflows/gtfs-data.yml`.

18 of 236 directional patterns skip a stop the route serves. `deriveRouteStops`
picks one representative trip per direction; that trip visited the `_merge` id;
`emitDatabase` discards relationship rows pointing at dropped stops.

**Contract:** `withoutMergedDuplicateStops(stops)` returns
`{ kept, dropped, remap }` where `remap` is a `Map<string, string>` from each
dropped `stop_id` to the surviving row's `stop_id` sharing its `stop_code`.
`emitDatabase` maps every `stop_routes` and `route_stops` `stop_id` through
`remap` before the known-stop check, and de-duplicates the `stop_routes` pairs
that remapping can now collide.

**Settled — atomic.** Fixing the script, rebuilding `assets/db/gtfs.db` and
publishing a new generation are one commit and one workflow run.
`dataRefresh.ts` hands `current?.builtAt ?? null` to `checkForUpdate`, so a
device with no pointer takes whatever the manifest offers — ship the corrected
floor without republishing and every device downloads the old broken generation
and moves off it.

**Settled — the cron cannot ship this.** `publish.mjs check` asks whether the
*upstream feed* changed; this changes our output against a byte-identical input.
Add a `workflow_dispatch` input (`force`, boolean, default false) that skips the
check. Hashing the built artifact instead is more correct and a bigger change;
not taken.

**Verify against the real asset**, not a fixture: the 18 patterns must become 0,
and `stops`/`routes`/`stop_routes` counts must stay above `FLOOR`.

**Added 2026-08-05 — this is a prerequisite, not just a fix.** "Show an entire
route and all its stops on the map" reads `route_stops`. Built before this
ships, it draws routes with holes in them. See the field notes.

**Tests:** `remaps a dropped _merge stop's route_stops rows onto its surviving
twin`; `remaps stop_routes and does not duplicate a pair the twin already had`;
`leaves rows alone when the _merge stop was kept`; and in
`data/gtfs/__tests__/sql.test.mjs`, `every directional pattern in the built
asset covers every stop the route serves`.

---

## Task 4 — Favorites must not lose a star to an interleaved write

**Files:** `data/storage/favorites.ts`,
`data/storage/__tests__/favorites.test.ts`.

`addFavorite`/`removeFavorite` each do load → mutate → save. Two taps inside one
AsyncStorage round trip lose one.

**Contract:** both serialise onto a module-level promise chain, so each
read-modify-write completes before the next begins. Exported signatures
unchanged: `(stopId: string) => Promise<string[]>`. `loadFavorites` and
`isFavorite` are untouched.

**Settled:** a chain, not a lock or a queue object. One writer, one process, and
the ordering guarantee is the whole requirement.

**Tests:** `two stars added concurrently both survive`; `an add and a remove of
different stops interleave without loss`; `a rejected write does not wedge the
chain for later calls`.

---

## Task 5 — The error notice must clear, and must not silently replace another

**Files:** `features/stops/StopsScreen.tsx`, `features/stops/__tests__/`.

`problem` is a single sticky slot, never reset. `FAVORITES_PROBLEM` can fail
transiently and pin a notice for the session; a later `DATABASE_PROBLEM`
overwrites it rather than queueing.

**Contract:** each problem source owns its own state and clears on its next
success. Where more than one is live, the notice names the more severe.

**Settled:** provisional presentation — this is a surface in the UI half, so the
correctness fix is "it clears and it does not lie", and the appearance goes to
Truman with a screenshot.

**Tests:** `clears the favorites notice once favorites load`; `a database
problem does not erase a favorites problem`; `no notice renders when both
recover`.

---

## Task 6 — A hard AsyncStorage failure must be distinguishable from corruption

**Files:** `data/storage/favorites.ts`,
`data/storage/__tests__/favorites.test.ts`.

`getItem`/`setItem` are unwrapped, so a native-module I/O rejection propagates
uncaught. Corrupt content already reads as empty.

**Contract:** I/O failure is caught and surfaced as a distinct outcome rather
than an unhandled rejection — corrupt-reads-as-empty is preserved, because
that is deliberate and tested. Exact shape settled during Task 4, since both
touch the same functions; do them together.

**Settled:** must not collapse into the corruption path. "Your favorites are
gone" and "storage is broken right now" are different facts, and this project
does not render two states alike.

**Tests:** `a rejected getItem does not throw out of loadFavorites`; `a rejected
setItem reports failure rather than a silent no-op`; the existing corrupt-JSON
test must still pass unchanged.

---

## Task 7 — The address-geocoder probe

**Files:** `features/settings/` (one throwaway component), removed before merge.

**Contract:** a text field that calls `Location.geocodeAsync(value)` on submit
and renders the raw result — count, and each `latitude`/`longitude`. No
integration with `useAnchoredStops`, no navigation, no persistence.

**Settled:** submit-on-enter, never on change. Apple documents at most one
geocoding request per user action.

**Purpose:** Truman types six things — street address, mall, school,
restaurant, beach, neighbourhood — and screenshots the results, so the real
feature is designed against what `CLGeocoder` returns for Oahu. He has already
accepted address-only if places do not resolve.

**No tests.** It is deleted before merge, and a test for it would outlive it.

---

## What was built

All seven tasks shipped on 2026-08-05, one commit each (Tasks 4 and 6 share
one, as the plan directed). **401 Jest, 80 `node --test`, clean typecheck,
clean `npm ci`.** Where reality disagreed:

**Task 1 — cheaper than budgeted.** The plan warned that every suite rendering
`AppShell` would have to double `expo-sqlite`. Only one does, and doubling
`data/gtfs/files` instead keeps the real module — which reaches `expo-sqlite`
at import time — from loading at all.

**Task 2 — one boundary was not enough.** "Wrap `SQLiteProvider` only" cannot
be done by nesting: the router lives *inside* `SQLiteProvider`, so any boundary
around the provider is also around every screen. `AppErrorGate` is therefore
mounted **twice** — inside the provider around the router, and above `KeyGate`
— leaving `DatabaseGate` between them holding the open. React's
nearest-boundary rule then decides the diagnosis structurally.

The plan flagged that this might change which gate swallows a missing
`SafeAreaProvider`. It does: `InsetReader`'s throw now lands on `AppErrorGate`.
**Verified by removing the provider and watching five tests fail**, not by
reading. The guard test asserts both screens and is renamed to
`renders its children rather than an error screen`.

**Task 3 — the asset-level assertion had to be re-derived.** "Every directional
pattern covers every stop the route serves" is not checkable against the built
asset: `deriveRouteStops` keeps one representative trip per direction, so
short-turn patterns legitimately omit stops that `stop_routes` lists, and 233
of 236 patterns fail that reading. The invariant that *is* exact is
**`seq` being a contiguous run from zero**, which holds by construction and can
only be dented by a row removed after numbering. 17 patterns had a hole; the
18th lost its last stop, where a missing row leaves the run contiguous and
merely short. Test name kept.

One existing test, `takes the dropped duplicate rows in stop_routes and
route_stops with it`, asserted the bug outright. Rewritten to the new truth,
keeping the half still worth holding.

Measured against the real asset, before → after: `route_stops` 9209 → 9235,
patterns with a `seq` gap 17 → 0, stop_codes gained by a pattern 26 and lost 0,
`stops`/`routes`/`stop_routes` unchanged.

**Task 6 — the shape, as the plan left it to be settled.** Two readers.
`readFavorites(): Promise<FavoritesRead>` carries `{ available: true; ids } |
{ available: false }`; `loadFavorites` is the lenient form over it and now
truthfully never throws. Corrupt content stays on the *success* branch — the
read worked and what came back was not a list. Writes stay unguarded on
purpose: a caught write returning the list would light the star over nothing.
Choosing between the two is now a real decision — `StopsScreen` takes the
honest reader because it has a notice to put the difference in, `MapScreen`
keeps the lenient one because it swallows favorites failures deliberately.

**Task 5 — one test renamed.** The plan's `clears the favorites notice once
favorites load` describes something that cannot happen: favorites are read once
at mount with no retry, so a failed read has nothing to clear it. A write is
the only thing that asks storage again. The test is named for what it proves.

The four database queries are tracked **by name** rather than as one flag,
because they fail independently and a single flag would be cleared by whichever
succeeded last — taking a live problem off screen with it.

### Still owed on Task 3

**The forced publish has not run, and cannot run from `dev`.**
`workflow_dispatch` only ever fires for a workflow that exists on `main`, so
the `force` input is unreachable until this merges. The corrected floor is
committed; the corrected *generation* is not published.

That is safe as long as both happen together. `dataRefresh.ts` passes
`current?.builtAt ?? null`, so a device with no pointer takes whatever the
manifest offers — ship the new floor in an `.ipa` without republishing and
every device immediately downloads the old broken generation and moves off the
corrected data. **So: merge, then immediately
`gh workflow run gtfs-data.yml -f force=true`, and confirm the new asset before
any build reaches a phone.**

## Closing the correctness half

`npm test`, `npm run test:scripts`, `npm run typecheck`, and **`npm ci`** — the
last because it is the only thing that catches a lockfile peer conflict, and it
is not run by default.

Then the UI half begins, and the increment stays open until Truman calls it.
