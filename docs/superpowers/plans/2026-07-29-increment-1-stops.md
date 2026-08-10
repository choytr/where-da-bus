# Increment 1: Stops, Search, Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a home screen listing bus stops sorted by distance from the user, searchable by name or stop number, with favorites, where every stop row shows which routes serve it — running entirely on bundled GTFS data with no network access.

**Architecture:** A Node build script downloads Oahu's GTFS feed, derives two compact relationship tables from the 73.8 MB `stop_times.txt`, and emits a ~1 MB SQLite file committed as an app asset. The app opens that read-only database through `expo-sqlite`, filters stops by bounding box, then sorts by haversine distance in JavaScript. Favorites live separately in AsyncStorage because they are user state with a different lifecycle from bundled reference data.

**Tech Stack:** Expo SDK 57, React Native 0.86.2, React 19.2.3, TypeScript 6.0, `expo-sqlite` (FTS5), `expo-location`, `@react-native-async-storage/async-storage`, Jest + `jest-expo` + React Native Testing Library, `node:sqlite` (build script only).

## Global Constraints

Every task's requirements implicitly include this section.

- **No TypeScript type assertions (`as`).** Language features like `as const` are fine. Restructure types until they compose on their own; use type guards (`value is T`) with runtime checks, `.some(x => x === v)` instead of widening for `.includes()`, and derive types from values (`typeof ARR[number]`). If an assertion is genuinely unavoidable, flag it explicitly rather than slipping it in.
- **Expo Go compatibility is mandatory.** Only use modules Expo Go already bundles. `expo-sqlite`, `expo-location`, and AsyncStorage qualify. Adding a module outside that set forces every later change through the slow CI `.ipa` loop and is an architectural decision, not a routine install.
- **iOS deployment target is 18.0**, set via `ios.deploymentTarget` in `app.json`. Never add `expo-build-properties` — SDK 56+ supersedes it.
- **`/ios` and `/android` are gitignored.** They are `expo prebuild` output. Never commit or hand-edit them; native config goes through `app.json`.
- **Install packages with `npx expo install`**, never bare `npm install <pkg>` — it selects SDK 57-compatible versions.
- **Attribution string, verbatim, no trailing period:**
  `Route and arrival data provided by permission of Oahu Transit Services, Inc`
- **Do not use the marks "OTS", "HEA", or "TheBus"** in UI copy. The OTS terms forbid any use of their marks or confusingly similar variants beyond the required legends.
- **`vehicle:driver` is an employee number.** It must never be displayed or persisted. (Not consumed in this increment; stated so it is never introduced.)
- **Bundled GTFS data is reference-only** — stop names, IDs, coordinates. Nothing time-sensitive.

---

### Task 1: Test infrastructure and haversine distance

Sets up Jest and delivers the first pure unit, which the nearby-stops sort depends on.

**Files:**
- Modify: `package.json`
- Create: `lib/distance.ts`
- Test: `lib/__tests__/distance.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `metersBetween(a: Coords, b: Coords): number` and `type Coords = { lat: number; lon: number }`, exported from `lib/distance.ts`.

- [ ] **Step 1: Install test dependencies**

```bash
npx expo install jest-expo jest @types/jest --dev
npx expo install @testing-library/react-native --dev
```

- [ ] **Step 2: Add Jest config and test script to package.json**

Add these keys to `package.json` (keep existing `start`, `typecheck`, `web` scripts):

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watchAll"
  },
  "jest": {
    "preset": "jest-expo",
    "testPathIgnorePatterns": ["/node_modules/", "/scripts/"]
  }
}
```

`scripts/` is ignored because build-script tests run under `node --test`, not Jest.

- [ ] **Step 3: Write the failing test**

Create `lib/__tests__/distance.test.ts`. The expected values are real distances between real Oahu stops 5, 6, and 7 from `stops.txt`.

```ts
import { metersBetween } from '../distance';

describe('metersBetween', () => {
  const stop5 = { lat: 21.321687, lon: -157.907687 }; // LAGOON DR + IOLANA PL
  const stop6 = { lat: 21.319702, lon: -157.910531 }; // LAGOON DR + KAPALULU PL
  const stop7 = { lat: 21.318565, lon: -157.912124 }; // LAGOON DR + MOKUEA PL

  it('returns zero for identical points', () => {
    expect(metersBetween(stop5, stop5)).toBe(0);
  });

  it('measures a short walk between adjacent stops', () => {
    expect(metersBetween(stop5, stop6)).toBeCloseTo(368.1, 0);
  });

  it('measures a longer gap', () => {
    expect(metersBetween(stop5, stop7)).toBeCloseTo(576.0, 0);
  });

  it('is symmetric', () => {
    expect(metersBetween(stop5, stop6)).toBeCloseTo(metersBetween(stop6, stop5), 6);
  });
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `npx jest lib/__tests__/distance.test.ts`
Expected: FAIL — cannot find module `../distance`.

- [ ] **Step 5: Implement the minimal code**

Create `lib/distance.ts`:

```ts
export type Coords = {
  lat: number;
  lon: number;
};

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. Accurate enough for walking distances. */
export function metersBetween(a: Coords, b: Coords): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx jest lib/__tests__/distance.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Verify the typecheck is still clean**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/distance.ts lib/__tests__/distance.test.ts
git commit -m "Add Jest setup and haversine distance"
```

---

### Task 2: GTFS derivation logic

Pure CSV-to-rows transformation with no I/O, so it is testable against small literal fixtures. This is where the 73.8 MB collapse to 76 KB happens.

**Files:**
- Create: `scripts/build-gtfs/derive.mjs`
- Test: `scripts/build-gtfs/__tests__/derive.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from `derive.mjs`:
  - `parseCsv(text: string): Array<Record<string, string>>`
  - `deriveStopRoutes(stopTimesRows, tripsRows): Array<{ stop_id, route_id }>`
  - `deriveRouteStops(stopTimesRows, tripsRows): Array<{ route_id, direction_id, seq, stop_id }>`

- [ ] **Step 1: Write the failing test**

Create `scripts/build-gtfs/__tests__/derive.test.mjs`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, deriveStopRoutes, deriveRouteStops } from '../derive.mjs';

describe('parseCsv', () => {
  test('parses a header and rows into objects', () => {
    const rows = parseCsv('a,b\n1,2\n3,4\n');
    assert.deepEqual(rows, [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  test('strips a UTF-8 BOM from the first header', () => {
    const rows = parseCsv('﻿stop_id,name\n5,LAGOON\n');
    assert.deepEqual(rows, [{ stop_id: '5', name: 'LAGOON' }]);
  });

  test('honours quoted fields containing commas', () => {
    const rows = parseCsv('a,b\n"x,y",z\n');
    assert.deepEqual(rows, [{ a: 'x,y', b: 'z' }]);
  });

  test('ignores a trailing blank line', () => {
    assert.equal(parseCsv('a\n1\n\n').length, 1);
  });
});

describe('deriveStopRoutes', () => {
  const trips = [
    { trip_id: 't1', route_id: '8', direction_id: '0' },
    { trip_id: 't2', route_id: '8', direction_id: '0' },
    { trip_id: 't3', route_id: '20', direction_id: '0' },
  ];

  test('collapses many trips into distinct stop/route pairs', () => {
    const stopTimes = [
      { trip_id: 't1', stop_id: '5', stop_sequence: '1' },
      { trip_id: 't2', stop_id: '5', stop_sequence: '1' },
      { trip_id: 't3', stop_id: '5', stop_sequence: '1' },
    ];
    assert.deepEqual(deriveStopRoutes(stopTimes, trips), [
      { stop_id: '5', route_id: '20' },
      { stop_id: '5', route_id: '8' },
    ]);
  });

  test('drops stop_times whose trip is unknown', () => {
    const stopTimes = [{ trip_id: 'ghost', stop_id: '5', stop_sequence: '1' }];
    assert.deepEqual(deriveStopRoutes(stopTimes, trips), []);
  });
});

describe('deriveRouteStops', () => {
  const trips = [
    { trip_id: 'short', route_id: '8', direction_id: '0' },
    { trip_id: 'long', route_id: '8', direction_id: '0' },
  ];

  test('picks the trip visiting the most stops as representative', () => {
    const stopTimes = [
      { trip_id: 'short', stop_id: '5', stop_sequence: '1' },
      { trip_id: 'long', stop_id: '5', stop_sequence: '1' },
      { trip_id: 'long', stop_id: '6', stop_sequence: '2' },
      { trip_id: 'long', stop_id: '7', stop_sequence: '3' },
    ];
    assert.deepEqual(deriveRouteStops(stopTimes, trips), [
      { route_id: '8', direction_id: '0', seq: 0, stop_id: '5' },
      { route_id: '8', direction_id: '0', seq: 1, stop_id: '6' },
      { route_id: '8', direction_id: '0', seq: 2, stop_id: '7' },
    ]);
  });

  test('orders by stop_sequence numerically, not lexically', () => {
    const stopTimes = [
      { trip_id: 'long', stop_id: 'b', stop_sequence: '10' },
      { trip_id: 'long', stop_id: 'a', stop_sequence: '2' },
    ];
    const result = deriveRouteStops(stopTimes, trips);
    assert.deepEqual(result.map((r) => r.stop_id), ['a', 'b']);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test scripts/build-gtfs/`
Expected: FAIL — cannot find module `../derive.mjs`.

- [ ] **Step 3: Implement the minimal code**

Create `scripts/build-gtfs/derive.mjs`:

```js
/**
 * Pure GTFS derivation. No I/O, so it is testable against literal fixtures.
 *
 * The point of this module: stop_times.txt is 73.8 MB of per-trip timing detail,
 * but the app only needs the *relationships* it implies. Those collapse to about
 * 200 KB.
 */

/** Minimal RFC 4180 CSV parser. GTFS quotes any field containing a comma. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((name, index) =>
    index === 0 ? name.replace(/^﻿/, '') : name,
  );

  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell !== ''))
    .map((cells) => {
      const row = {};
      header.forEach((name, index) => {
        row[name] = cells[index] ?? '';
      });
      return row;
    });
}

function tripToRoute(tripsRows) {
  const map = new Map();
  for (const trip of tripsRows) {
    map.set(trip.trip_id, trip);
  }
  return map;
}

/** Which routes serve which stops. Sorted for deterministic output. */
export function deriveStopRoutes(stopTimesRows, tripsRows) {
  const trips = tripToRoute(tripsRows);
  const seen = new Set();

  for (const stopTime of stopTimesRows) {
    const trip = trips.get(stopTime.trip_id);
    if (trip === undefined) continue;
    seen.add(`${stopTime.stop_id}\0${trip.route_id}`);
  }

  return [...seen]
    .map((key) => {
      const [stop_id, route_id] = key.split('\0');
      return { stop_id, route_id };
    })
    .sort(
      (a, b) =>
        a.stop_id.localeCompare(b.stop_id) || a.route_id.localeCompare(b.route_id),
    );
}

/**
 * Ordered stops per route and direction.
 *
 * A route has thousands of trips that mostly repeat the same path, so one
 * representative trip is enough. The trip visiting the most stops is chosen
 * because short-turn trips would otherwise truncate the route.
 */
export function deriveRouteStops(stopTimesRows, tripsRows) {
  const trips = tripToRoute(tripsRows);

  const countByTrip = new Map();
  for (const stopTime of stopTimesRows) {
    countByTrip.set(stopTime.trip_id, (countByTrip.get(stopTime.trip_id) ?? 0) + 1);
  }

  const bestTrip = new Map();
  for (const [tripId, count] of countByTrip) {
    const trip = trips.get(tripId);
    if (trip === undefined) continue;
    const key = `${trip.route_id}\0${trip.direction_id ?? ''}`;
    const current = bestTrip.get(key);
    if (current === undefined || count > current.count) {
      bestTrip.set(key, { count, tripId });
    }
  }

  const keptTrips = new Map();
  for (const [key, { tripId }] of bestTrip) {
    keptTrips.set(tripId, key);
  }

  const sequences = new Map();
  for (const stopTime of stopTimesRows) {
    const key = keptTrips.get(stopTime.trip_id);
    if (key === undefined) continue;
    if (!sequences.has(key)) sequences.set(key, []);
    sequences.get(key).push({
      order: Number(stopTime.stop_sequence),
      stop_id: stopTime.stop_id,
    });
  }

  const out = [];
  for (const key of [...sequences.keys()].sort()) {
    const [route_id, direction_id] = key.split('\0');
    const ordered = sequences.get(key).sort((a, b) => a.order - b.order);
    ordered.forEach((entry, index) => {
      out.push({ route_id, direction_id, seq: index, stop_id: entry.stop_id });
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test scripts/build-gtfs/`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the script test command**

Add to `package.json` scripts:

```json
"test:scripts": "node --test scripts/build-gtfs/"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/build-gtfs/derive.mjs scripts/build-gtfs/__tests__/derive.test.mjs package.json
git commit -m "Derive stop-route relationships from GTFS"
```

---

### Task 3: GTFS build script producing the SQLite asset

Wraps the derivation in download, unzip, and SQLite emission. Uses `node:sqlite`, built into Node 22, so there is no native dependency to compile on Windows.

**Files:**
- Create: `scripts/build-gtfs/build.mjs`
- Create: `assets/db/.gitkeep`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `parseCsv`, `deriveStopRoutes`, `deriveRouteStops` from `derive.mjs`.
- Produces: `assets/db/gtfs.db` containing tables `stops`, `routes`, `stop_routes`, `route_stops`, and FTS5 table `stops_fts`.

- [ ] **Step 1: Write the build script**

Create `scripts/build-gtfs/build.mjs`:

```js
/**
 * Downloads Oahu's GTFS feed and emits the SQLite asset the app ships.
 *
 * Run: npm run build:gtfs
 *
 * The 73.8 MB stop_times.txt is an input to this script and never an app asset.
 * Output is roughly 1 MB.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { parseCsv, deriveStopRoutes, deriveRouteStops } from './derive.mjs';

const execFileAsync = promisify(execFile);

// The widely-cited webapps.thebus.org URL is dead — that host now answers with
// an Avaya session border controller certificate. This is the live source.
const FEED_URL = 'https://www.thebus.org/transitdata/production/google_transit.zip';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, '.gtfs-cache');
const OUT = path.join(ROOT, 'assets/db/gtfs.db');

async function download() {
  await mkdir(WORK, { recursive: true });
  const zipPath = path.join(WORK, 'google_transit.zip');

  if (existsSync(zipPath)) {
    console.log('Using cached feed. Delete .gtfs-cache to refetch.');
    return zipPath;
  }

  console.log(`Downloading ${FEED_URL}`);
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Feed download failed: HTTP ${response.status}`);
  }
  await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
  return zipPath;
}

async function extract(zipPath) {
  await execFileAsync('unzip', ['-qo', zipPath, '-d', WORK]);
  const read = (name) => readFile(path.join(WORK, name), 'utf8');
  return {
    stops: parseCsv(await read('stops.txt')),
    routes: parseCsv(await read('routes.txt')),
    trips: parseCsv(await read('trips.txt')),
    stopTimes: parseCsv(await read('stop_times.txt')),
    feedInfo: parseCsv(await read('feed_info.txt')),
  };
}

async function main() {
  const zipPath = await download();
  console.log('Extracting and parsing (stop_times.txt is large, expect a pause)');
  const feed = await extract(zipPath);

  console.log(`stops=${feed.stops.length} routes=${feed.routes.length} trips=${feed.trips.length} stop_times=${feed.stopTimes.length}`);

  const stopRoutes = deriveStopRoutes(feed.stopTimes, feed.trips);
  const routeStops = deriveRouteStops(feed.stopTimes, feed.trips);
  console.log(`derived stop_routes=${stopRoutes.length} route_stops=${routeStops.length}`);

  await mkdir(path.dirname(OUT), { recursive: true });
  await rm(OUT, { force: true });

  const db = new DatabaseSync(OUT);
  db.exec(`
    PRAGMA journal_mode = DELETE;
    CREATE TABLE stops (
      stop_id   TEXT PRIMARY KEY,
      stop_code TEXT,
      stop_name TEXT NOT NULL,
      lat       REAL NOT NULL,
      lon       REAL NOT NULL
    );
    CREATE TABLE routes (
      route_id   TEXT PRIMARY KEY,
      short_name TEXT NOT NULL,
      long_name  TEXT NOT NULL
    );
    CREATE TABLE stop_routes (
      stop_id  TEXT NOT NULL,
      route_id TEXT NOT NULL,
      PRIMARY KEY (stop_id, route_id)
    );
    CREATE TABLE route_stops (
      route_id     TEXT NOT NULL,
      direction_id TEXT NOT NULL,
      seq          INTEGER NOT NULL,
      stop_id      TEXT NOT NULL,
      PRIMARY KEY (route_id, direction_id, seq)
    );
    CREATE INDEX idx_stops_lat_lon ON stops(lat, lon);
    CREATE INDEX idx_stop_routes_stop ON stop_routes(stop_id);
    CREATE VIRTUAL TABLE stops_fts USING fts5(stop_name, content='stops', content_rowid='rowid');
  `);

  const insertStop = db.prepare(
    'INSERT INTO stops (stop_id, stop_code, stop_name, lat, lon) VALUES (?, ?, ?, ?, ?)',
  );
  const insertRoute = db.prepare(
    'INSERT INTO routes (route_id, short_name, long_name) VALUES (?, ?, ?)',
  );
  const insertStopRoute = db.prepare(
    'INSERT INTO stop_routes (stop_id, route_id) VALUES (?, ?)',
  );
  const insertRouteStop = db.prepare(
    'INSERT INTO route_stops (route_id, direction_id, seq, stop_id) VALUES (?, ?, ?, ?)',
  );

  db.exec('BEGIN');
  for (const s of feed.stops) {
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    insertStop.run(s.stop_id, s.stop_code ?? '', s.stop_name, lat, lon);
  }
  for (const r of feed.routes) {
    insertRoute.run(r.route_id, r.route_short_name ?? '', r.route_long_name ?? '');
  }
  const knownStops = new Set(feed.stops.map((s) => s.stop_id));
  const knownRoutes = new Set(feed.routes.map((r) => r.route_id));
  for (const pair of stopRoutes) {
    if (!knownStops.has(pair.stop_id) || !knownRoutes.has(pair.route_id)) continue;
    insertStopRoute.run(pair.stop_id, pair.route_id);
  }
  for (const rs of routeStops) {
    if (!knownStops.has(rs.stop_id) || !knownRoutes.has(rs.route_id)) continue;
    insertRouteStop.run(rs.route_id, rs.direction_id, rs.seq, rs.stop_id);
  }
  db.exec("INSERT INTO stops_fts(stops_fts) VALUES('rebuild')");
  db.exec('COMMIT');
  db.exec('VACUUM');

  const count = (sql) => db.prepare(sql).get().n;
  console.log('--- built ---');
  console.log('stops       ', count('SELECT COUNT(*) AS n FROM stops'));
  console.log('routes      ', count('SELECT COUNT(*) AS n FROM routes'));
  console.log('stop_routes ', count('SELECT COUNT(*) AS n FROM stop_routes'));
  console.log('route_stops ', count('SELECT COUNT(*) AS n FROM route_stops'));
  console.log('feed valid  ', feed.feedInfo[0]?.feed_start_date, '->', feed.feedInfo[0]?.feed_end_date);
  db.close();
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Ignore the download cache**

Append to `.gitignore`:

```
# GTFS download cache — inputs to scripts/build-gtfs, not app assets
.gtfs-cache/
```

- [ ] **Step 3: Add the build script command**

Add to `package.json` scripts:

```json
"build:gtfs": "node scripts/build-gtfs/build.mjs"
```

- [ ] **Step 4: Run the build and verify the output**

Run: `npm run build:gtfs`

Expected output, approximately (exact counts drift as the feed updates):

```
stops=3847 routes=118 trips=37678 stop_times=1419279
derived stop_routes=8658 route_stops=9235
stops        3847
routes       118
stop_routes  8658
route_stops  9235
```

If `stop_routes` is 0, the trip join failed — check that `trips.txt` has a `route_id` column.

- [ ] **Step 5: Verify the asset size is within budget**

Run: `du -h assets/db/gtfs.db`
Expected: roughly 1–2 MB. If it exceeds 5 MB, `stop_times` rows leaked into the database; check the schema.

- [ ] **Step 6: Commit the script and the generated asset**

The `.db` is committed deliberately: it makes CI builds deterministic and network-free, and the feed only changes every few weeks.

```bash
git add scripts/build-gtfs/build.mjs package.json .gitignore assets/db/gtfs.db
git commit -m "Build SQLite asset from GTFS feed"
```

---

### Task 4: SQL query layer

SQL lives in its own module as plain strings so it can be executed against `node:sqlite` in tests — the same SQL the app runs through `expo-sqlite`, without needing a native module in the test environment.

**Files:**
- Create: `data/gtfs/types.ts`
- Create: `data/gtfs/sql.ts`
- Test: `data/gtfs/__tests__/sql.test.mjs`

**Interfaces:**
- Consumes: `assets/db/gtfs.db` from Task 3.
- Produces, exported from `data/gtfs/sql.ts`: `SEARCH_BY_NAME`, `SEARCH_BY_CODE`, `NEARBY_IN_BOX`, `ROUTES_FOR_STOP`, and `boundingBox(center, radiusMeters)`. Types `Stop` and `RouteSummary` from `data/gtfs/types.ts`.

- [ ] **Step 1: Write the failing test**

Create `data/gtfs/__tests__/sql.test.mjs`. It runs the real SQL against the real built database.

```js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  SEARCH_BY_NAME,
  SEARCH_BY_CODE,
  NEARBY_IN_BOX,
  ROUTES_FOR_STOP,
  boundingBox,
  stopsByIdsSql,
} from '../sql.ts';

const DB = path.resolve(import.meta.dirname, '../../../assets/db/gtfs.db');

describe('gtfs sql', () => {
  let db;

  before(() => {
    if (!existsSync(DB)) {
      throw new Error('assets/db/gtfs.db missing — run: npm run build:gtfs');
    }
    db = new DatabaseSync(DB, { readOnly: true });
  });

  test('finds stops by name fragment', () => {
    const rows = db.prepare(SEARCH_BY_NAME).all('lagoon', 10);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.stop_name.toUpperCase().includes('LAGOON')));
  });

  test('finds a stop by its exact code', () => {
    const row = db.prepare(SEARCH_BY_CODE).get('5');
    assert.equal(row.stop_id, '5');
    assert.ok(typeof row.lat === 'number');
  });

  test('returns nothing for an unknown code', () => {
    assert.equal(db.prepare(SEARCH_BY_CODE).get('nonexistent-code'), undefined);
  });

  test('looks up several stops by id regardless of location', () => {
    const rows = db.prepare(stopsByIdsSql(2)).all('5', '6');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.stop_id).sort(), ['5', '6']);
  });

  test('id lookup tolerates ids that do not exist', () => {
    const rows = db.prepare(stopsByIdsSql(2)).all('5', 'ghost');
    assert.equal(rows.length, 1);
  });

  test('bounding box selects stops near a point', () => {
    const box = boundingBox({ lat: 21.321687, lon: -157.907687 }, 500);
    const rows = db.prepare(NEARBY_IN_BOX).all(box.minLat, box.maxLat, box.minLon, box.maxLon);
    assert.ok(rows.some((r) => r.stop_id === '5'));
  });

  test('lists routes serving a stop, ordered numerically', () => {
    const withRoutes = db
      .prepare('SELECT stop_id FROM stop_routes GROUP BY stop_id HAVING COUNT(*) > 2 LIMIT 1')
      .get();
    const rows = db.prepare(ROUTES_FOR_STOP).all(withRoutes.stop_id);
    assert.ok(rows.length > 2);
    const numeric = rows.map((r) => Number(r.short_name)).filter(Number.isFinite);
    assert.deepEqual(numeric, [...numeric].sort((a, b) => a - b));
  });
});

describe('boundingBox', () => {
  test('grows with radius', () => {
    const small = boundingBox({ lat: 21.3, lon: -157.9 }, 100);
    const large = boundingBox({ lat: 21.3, lon: -157.9 }, 1000);
    assert.ok(large.maxLat > small.maxLat);
    assert.ok(large.minLon < small.minLon);
  });

  test('brackets the center point', () => {
    const box = boundingBox({ lat: 21.3, lon: -157.9 }, 500);
    assert.ok(box.minLat < 21.3 && box.maxLat > 21.3);
    assert.ok(box.minLon < -157.9 && box.maxLon > -157.9);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test data/gtfs/__tests__/sql.test.mjs`
Expected: FAIL — cannot find module `../sql.ts`.

- [ ] **Step 3: Write the types**

Create `data/gtfs/types.ts`:

```ts
export type Stop = {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  lat: number;
  lon: number;
};

export type RouteSummary = {
  route_id: string;
  short_name: string;
  long_name: string;
};

export type StopWithDistance = Stop & {
  meters: number;
};
```

- [ ] **Step 4: Write the SQL module**

Create `data/gtfs/sql.ts`:

```ts
import type { Coords } from '../../lib/distance';

const STOP_COLUMNS = 'stop_id, stop_code, stop_name, lat, lon';

/**
 * FTS5 prefix search over stop names. Parameters: (query, limit).
 * The caller appends '*' to the query for prefix matching.
 */
export const SEARCH_BY_NAME = `
  SELECT s.stop_id, s.stop_code, s.stop_name, s.lat, s.lon
  FROM stops_fts f
  JOIN stops s ON s.rowid = f.rowid
  WHERE stops_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`;

/** Exact stop-code lookup — the number printed on the physical sign. */
export const SEARCH_BY_CODE = `
  SELECT ${STOP_COLUMNS} FROM stops WHERE stop_code = ? LIMIT 1
`;

/**
 * Look up specific stops by id. Favorites must resolve even when the user is
 * nowhere near them, so they cannot be read out of the nearby results.
 * Build the placeholders with stopIdPlaceholders(n).
 */
export function stopsByIdsSql(count: number): string {
  const placeholders = new Array(count).fill('?').join(', ');
  return `SELECT ${STOP_COLUMNS} FROM stops WHERE stop_id IN (${placeholders})`;
}

/**
 * Cheap bounding-box prefilter. Parameters: (minLat, maxLat, minLon, maxLon).
 * Exact haversine distance and ordering happen in JavaScript afterwards, because
 * SQLite has no trigonometric functions available here.
 */
export const NEARBY_IN_BOX = `
  SELECT ${STOP_COLUMNS} FROM stops
  WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
`;

/** Routes serving a stop, numeric routes first and in numeric order. */
export const ROUTES_FOR_STOP = `
  SELECT r.route_id, r.short_name, r.long_name
  FROM stop_routes sr
  JOIN routes r ON r.route_id = sr.route_id
  WHERE sr.stop_id = ?
  ORDER BY
    CASE WHEN CAST(r.short_name AS INTEGER) > 0 THEN 0 ELSE 1 END,
    CAST(r.short_name AS INTEGER),
    r.short_name
`;

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

const METERS_PER_DEGREE_LAT = 111320;

/** Square box around a point, generous enough that the JS sort can trim it. */
export function boundingBox(center: Coords, radiusMeters: number): BoundingBox {
  const deltaLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const lonScale = Math.cos((center.lat * Math.PI) / 180);
  const deltaLon = radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(lonScale, 0.01));

  return {
    minLat: center.lat - deltaLat,
    maxLat: center.lat + deltaLat,
    minLon: center.lon - deltaLon,
    maxLon: center.lon + deltaLon,
  };
}

/** Escapes user input for FTS5 and appends a prefix wildcard. */
export function toFtsQuery(input: string): string {
  const cleaned = input.replace(/["*]/g, ' ').trim();
  if (cleaned === '') return '';
  return cleaned
    .split(/\s+/)
    .map((term) => `"${term}"*`)
    .join(' ');
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `node --test data/gtfs/__tests__/sql.test.mjs`
Expected: PASS, 9 tests.

Node 22.22 strips TypeScript types by default, so importing `../sql.ts` from a `.mjs` test needs no flag. This was verified before writing the plan.

- [ ] **Step 6: Widen the script test command to cover both directories**

Update the `test:scripts` entry in `package.json`:

```json
"test:scripts": "node --test scripts/build-gtfs/ data/gtfs/__tests__/"
```

- [ ] **Step 7: Commit**

```bash
git add data/gtfs/types.ts data/gtfs/sql.ts data/gtfs/__tests__/sql.test.mjs package.json
git commit -m "Add GTFS query layer tested against the built database"
```

---

### Task 5: Favorites persistence

**Files:**
- Create: `data/storage/favorites.ts`
- Test: `data/storage/__tests__/favorites.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadFavorites(): Promise<string[]>`, `addFavorite(id: string): Promise<string[]>`, `removeFavorite(id: string): Promise<string[]>`, `isFavorite(ids: string[], id: string): boolean`.

- [ ] **Step 1: Install AsyncStorage**

```bash
npx expo install @react-native-async-storage/async-storage
```

- [ ] **Step 2: Write the failing test**

Create `data/storage/__tests__/favorites.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
} from '../favorites';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    __reset: () => {
      store = {};
    },
  };
});

describe('favorites', () => {
  beforeEach(() => {
    const mocked = jest.mocked(AsyncStorage);
    if ('__reset' in mocked && typeof mocked.__reset === 'function') {
      mocked.__reset();
    }
  });

  it('starts empty', async () => {
    expect(await loadFavorites()).toEqual([]);
  });

  it('adds a favorite and persists it', async () => {
    await addFavorite('4544');
    expect(await loadFavorites()).toEqual(['4544']);
  });

  it('does not duplicate an existing favorite', async () => {
    await addFavorite('4544');
    const result = await addFavorite('4544');
    expect(result).toEqual(['4544']);
  });

  it('removes a favorite', async () => {
    await addFavorite('4544');
    await addFavorite('596');
    expect(await removeFavorite('4544')).toEqual(['596']);
  });

  it('removing an absent id is a no-op', async () => {
    await addFavorite('596');
    expect(await removeFavorite('nope')).toEqual(['596']);
  });

  it('returns an empty list when stored data is corrupt', async () => {
    await AsyncStorage.setItem('favorites.v1', 'not json');
    expect(await loadFavorites()).toEqual([]);
  });

  it('isFavorite reports membership', () => {
    expect(isFavorite(['4544'], '4544')).toBe(true);
    expect(isFavorite(['4544'], '596')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx jest data/storage`
Expected: FAIL — cannot find module `../favorites`.

- [ ] **Step 4: Implement**

Create `data/storage/favorites.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'favorites.v1';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Favorite stop IDs, oldest first. Corrupt storage reads as empty. */
export async function loadFavorites(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStringArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function save(ids: string[]): Promise<string[]> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  return ids;
}

export async function addFavorite(stopId: string): Promise<string[]> {
  const current = await loadFavorites();
  if (current.includes(stopId)) return current;
  return save([...current, stopId]);
}

export async function removeFavorite(stopId: string): Promise<string[]> {
  const current = await loadFavorites();
  return save(current.filter((id) => id !== stopId));
}

export function isFavorite(favorites: string[], stopId: string): boolean {
  return favorites.includes(stopId);
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx jest data/storage`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add data/storage package.json package-lock.json
git commit -m "Persist favorite stops"
```

---

### Task 6: Location access

Permission denial is a supported state, never an error. The app must remain fully usable without location.

**Files:**
- Create: `features/stops/useLocation.ts`
- Test: `features/stops/__tests__/useLocation.test.ts`
- Modify: `app.json`

**Interfaces:**
- Consumes: `Coords` from `lib/distance`.
- Produces: `useLocation(): LocationState` where
  `type LocationState = { status: 'idle' | 'loading' | 'granted' | 'denied' | 'error'; coords: Coords | null; request: () => Promise<void> }`.

- [ ] **Step 1: Install expo-location**

```bash
npx expo install expo-location
```

- [ ] **Step 2: Configure the iOS permission string**

Add to the `expo` object in `app.json`. The copy must explain the benefit, since a vague string gets denied:

```json
"plugins": [
  [
    "expo-location",
    {
      "locationWhenInUsePermission": "Used to show the bus stops closest to you and sort them by walking distance."
    }
  ],
  ["expo-sqlite", { "enableFTS": true }]
]
```

- [ ] **Step 3: Write the failing test**

Create `features/stops/__tests__/useLocation.test.ts`:

```ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useLocation } from '../useLocation';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const mockedPermission = jest.mocked(Location.requestForegroundPermissionsAsync);
const mockedPosition = jest.mocked(Location.getCurrentPositionAsync);

describe('useLocation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts idle without asking for permission', () => {
    const { result } = renderHook(() => useLocation());
    expect(result.current.status).toBe('idle');
    expect(result.current.coords).toBeNull();
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it('exposes coordinates once permission is granted', async () => {
    mockedPermission.mockResolvedValue({ status: 'granted' });
    mockedPosition.mockResolvedValue({ coords: { latitude: 21.3, longitude: -157.9 } });

    const { result } = renderHook(() => useLocation());
    await act(async () => {
      await result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe('granted'));
    expect(result.current.coords).toEqual({ lat: 21.3, lon: -157.9 });
  });

  it('treats denial as a supported state, not an error', async () => {
    mockedPermission.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.coords).toBeNull();
    expect(mockedPosition).not.toHaveBeenCalled();
  });

  it('reports a hardware failure distinctly from a denial', async () => {
    mockedPermission.mockResolvedValue({ status: 'granted' });
    mockedPosition.mockRejectedValue(new Error('location unavailable'));

    const { result } = renderHook(() => useLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe('error');
  });
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `npx jest features/stops`
Expected: FAIL — cannot find module `../useLocation`.

- [ ] **Step 5: Implement**

Create `features/stops/useLocation.ts`:

```ts
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { Coords } from '../../lib/distance';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

export type LocationState = {
  status: LocationStatus;
  coords: Coords | null;
  request: () => Promise<void>;
};

/**
 * One-shot foreground location.
 *
 * Denial is a first-class state: the caller falls back to favorites and search
 * rather than blocking. Nothing is requested until request() is called, so the
 * permission prompt is tied to a user action.
 */
export function useLocation(): LocationState {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);

  const request = useCallback(async () => {
    setStatus('loading');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        setCoords(null);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
      setStatus('granted');
    } catch {
      setStatus('error');
      setCoords(null);
    }
  }, []);

  return { status, coords, request };
}
```

> **Corrected during execution (2026-07-30).** This snippet originally left
> `requestForegroundPermissionsAsync()` outside the try/catch, guarding only the
> position lookup. If the permission call itself rejects — a concurrent pending
> request, or a native-layer failure — `status` would stay `'loading'` forever
> and `request()` would produce an unhandled rejection, putting a permanent
> silent spinner on the Task 9 home screen. That contradicts the rule that a
> spinner is never a terminal state. The Task 6 review caught it; the human
> partner ruled it be fixed. The enclosing try/catch above is the corrected
> form — do not revert it. The bare `catch {}` is deliberate: adding logging
> was proposed and explicitly declined.

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx jest features/stops`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add features/stops app.json package.json package-lock.json
git commit -m "Add one-shot location with denial as a supported state"
```

---

### Task 7: Stop row component

**Files:**
- Create: `features/stops/StopRow.tsx`
- Test: `features/stops/__tests__/StopRow.test.tsx`

**Interfaces:**
- Consumes: `Stop`, `RouteSummary` from `data/gtfs/types`.
- Produces: `<StopRow stop={...} routes={[...]} meters={number | null} isFavorite={boolean} onToggleFavorite={(id: string) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `features/stops/__tests__/StopRow.test.tsx`:

```tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { StopRow } from '../StopRow';

const stop = {
  stop_id: '5',
  stop_code: '5',
  stop_name: 'LAGOON DR + IOLANA PL',
  lat: 21.321687,
  lon: -157.907687,
};

const routes = [
  { route_id: '19', short_name: '19', long_name: 'Airport' },
  { route_id: '20', short_name: '20', long_name: 'Airport-Pearlridge' },
];

describe('StopRow', () => {
  it('shows the stop name and code', () => {
    render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('LAGOON DR + IOLANA PL');
    screen.getByText('Stop 5');
  });

  it('lists every route serving the stop', () => {
    render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('19');
    screen.getByText('20');
  });

  it('shows metres when close by', () => {
    render(<StopRow stop={stop} routes={routes} meters={368} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('368 m');
  });

  it('switches to kilometres past 1000 m', () => {
    render(<StopRow stop={stop} routes={routes} meters={2400} isFavorite={false} onToggleFavorite={jest.fn()} />);
    screen.getByText('2.4 km');
  });

  it('omits distance when location is unavailable', () => {
    render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={jest.fn()} />);
    expect(screen.queryByText(/m$/)).toBeNull();
  });

  it('calls back with the stop id when the favorite control is pressed', () => {
    const onToggle = jest.fn();
    render(<StopRow stop={stop} routes={routes} meters={null} isFavorite={false} onToggleFavorite={onToggle} />);
    fireEvent.press(screen.getByLabelText('Add LAGOON DR + IOLANA PL to favorites'));
    expect(onToggle).toHaveBeenCalledWith('5');
  });

  it('describes the control differently once favorited', () => {
    render(<StopRow stop={stop} routes={routes} meters={null} isFavorite onToggleFavorite={jest.fn()} />);
    screen.getByLabelText('Remove LAGOON DR + IOLANA PL from favorites');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest features/stops/__tests__/StopRow.test.tsx`
Expected: FAIL — cannot find module `../StopRow`.

- [ ] **Step 3: Implement**

Create `features/stops/StopRow.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { RouteSummary, Stop } from '../../data/gtfs/types';

export type StopRowProps = {
  stop: Stop;
  routes: RouteSummary[];
  meters: number | null;
  isFavorite: boolean;
  onToggleFavorite: (stopId: string) => void;
};

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function StopRow({
  stop,
  routes,
  meters,
  isFavorite,
  onToggleFavorite,
}: StopRowProps) {
  const isDark = useColorScheme() === 'dark';
  const palette = isDark ? dark : light;

  const label = isFavorite
    ? `Remove ${stop.stop_name} from favorites`
    : `Add ${stop.stop_name} to favorites`;

  return (
    <View style={[styles.row, { borderBottomColor: palette.border }]}>
      <View style={styles.main}>
        <Text style={[styles.name, { color: palette.text }]}>{stop.stop_name}</Text>

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: palette.muted }]}>
            Stop {stop.stop_code === '' ? stop.stop_id : stop.stop_code}
          </Text>
          {meters === null ? null : (
            <Text style={[styles.meta, { color: palette.muted }]}>
              {formatDistance(meters)}
            </Text>
          )}
        </View>

        <View style={styles.routes}>
          {routes.map((route) => (
            <View
              key={route.route_id}
              style={[styles.chip, { backgroundColor: palette.chip }]}
            >
              <Text style={[styles.chipText, { color: palette.text }]}>
                {route.short_name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onToggleFavorite(stop.stop_id)}
        hitSlop={12}
        style={styles.star}
      >
        <Text style={[styles.starText, { color: isFavorite ? palette.star : palette.muted }]}>
          {isFavorite ? '★' : '☆'}
        </Text>
      </Pressable>
    </View>
  );
}

const light = {
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
  chip: '#eceef0',
  star: '#e5a50a',
};

const dark = {
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
  chip: '#22282a',
  star: '#f5c518',
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  meta: { fontSize: 13, fontVariant: ['tabular-nums'] },
  routes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  star: { paddingLeft: 12, paddingTop: 2 },
  starText: { fontSize: 22 },
});
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest features/stops/__tests__/StopRow.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add features/stops/StopRow.tsx features/stops/__tests__/StopRow.test.tsx
git commit -m "Add stop row showing routes, distance, and favorite toggle"
```

---

### Task 8: Database access layer

Bridges `expo-sqlite` to the SQL from Task 4. Kept separate from the screen so the screen has no SQL in it.

**Files:**
- Create: `data/gtfs/db.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: SQL constants and `boundingBox`, `toFtsQuery` from `data/gtfs/sql`; `metersBetween` from `lib/distance`.
- Produces: `useStopQueries()` returning `{ nearby, searchByName, searchByCode, routesForStops }`.

- [ ] **Step 1: Install expo-sqlite**

```bash
npx expo install expo-sqlite
```

The `["expo-sqlite", { "enableFTS": true }]` plugin entry was added in Task 6 Step 2. Verify it is present in `app.json`.

- [ ] **Step 2: Implement the access layer**

Create `data/gtfs/db.ts`:

```ts
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import {
  NEARBY_IN_BOX,
  ROUTES_FOR_STOP,
  SEARCH_BY_CODE,
  SEARCH_BY_NAME,
  boundingBox,
  stopsByIdsSql,
  toFtsQuery,
} from './sql';
import { metersBetween, type Coords } from '../../lib/distance';
import type { RouteSummary, Stop, StopWithDistance } from './types';

const NEARBY_RADIUS_METERS = 1500;
const NEARBY_LIMIT = 25;
const SEARCH_LIMIT = 30;

export function useStopQueries() {
  const db = useSQLiteContext();

  const nearby = useCallback(
    async (center: Coords): Promise<StopWithDistance[]> => {
      const box = boundingBox(center, NEARBY_RADIUS_METERS);
      const rows = await db.getAllAsync<Stop>(
        NEARBY_IN_BOX,
        box.minLat,
        box.maxLat,
        box.minLon,
        box.maxLon,
      );

      return rows
        .map((stop) => ({ ...stop, meters: metersBetween(center, stop) }))
        .sort((a, b) => a.meters - b.meters)
        .slice(0, NEARBY_LIMIT);
    },
    [db],
  );

  const searchByName = useCallback(
    async (query: string): Promise<Stop[]> => {
      const fts = toFtsQuery(query);
      if (fts === '') return [];
      return db.getAllAsync<Stop>(SEARCH_BY_NAME, fts, SEARCH_LIMIT);
    },
    [db],
  );

  const searchByCode = useCallback(
    async (code: string): Promise<Stop | null> => {
      const row = await db.getFirstAsync<Stop>(SEARCH_BY_CODE, code.trim());
      return row ?? null;
    },
    [db],
  );

  const routesForStops = useCallback(
    async (stopIds: string[]): Promise<Map<string, RouteSummary[]>> => {
      const result = new Map<string, RouteSummary[]>();
      for (const stopId of stopIds) {
        const rows = await db.getAllAsync<RouteSummary>(ROUTES_FOR_STOP, stopId);
        result.set(stopId, rows);
      }
      return result;
    },
    [db],
  );

  /**
   * Resolve stops by id. Favorites use this rather than reading out of the
   * nearby results, so a favorite stays visible when the user is far from it.
   */
  const stopsByIds = useCallback(
    async (stopIds: string[]): Promise<Stop[]> => {
      if (stopIds.length === 0) return [];
      return db.getAllAsync<Stop>(stopsByIdsSql(stopIds.length), ...stopIds);
    },
    [db],
  );

  return { nearby, searchByName, searchByCode, routesForStops, stopsByIds };
}
```

- [ ] **Step 3: Allow the .db extension as a bundled asset**

Create `metro.config.js` at the project root:

```js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db');

module.exports = config;
```

- [ ] **Step 4: Verify the typecheck**

Run: `npm run typecheck`
Expected: exit 0. This task touches no JSX and adds no imports of components that do not yet exist, so it stands on its own.

- [ ] **Step 5: Commit**

```bash
git add data/gtfs/db.ts metro.config.js package.json package-lock.json
git commit -m "Open the bundled GTFS database through expo-sqlite"
```

---

### Task 9: Home screen

Assembles everything: favorites pinned above distance-sorted nearby stops, with search replacing both when active.

**Files:**
- Create: `features/stops/HomeScreen.tsx`
- Test: `features/stops/__tests__/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `useStopQueries`, `useLocation`, favorites functions, `StopRow`.
- Produces: `<HomeScreen />`, the app's root screen.

- [ ] **Step 1: Write the failing test**

Create `features/stops/__tests__/HomeScreen.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { HomeScreen } from '../HomeScreen';

const stopA = { stop_id: '5', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL', lat: 21.321687, lon: -157.907687 };
const stopB = { stop_id: '6', stop_code: '6', stop_name: 'LAGOON DR + KAPALULU PL', lat: 21.319702, lon: -157.910531 };

const nearby = jest.fn();
const searchByName = jest.fn();
const searchByCode = jest.fn();
const routesForStops = jest.fn();
const stopsByIds = jest.fn();

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => ({
    nearby,
    searchByName,
    searchByCode,
    routesForStops,
    stopsByIds,
  }),
}));

const locationState = {
  status: 'idle',
  coords: null,
  request: jest.fn(),
};

jest.mock('../useLocation', () => ({
  useLocation: () => locationState,
}));

jest.mock('../../../data/storage/favorites', () => ({
  loadFavorites: jest.fn(async () => []),
  addFavorite: jest.fn(async (id: string) => [id]),
  removeFavorite: jest.fn(async () => []),
  isFavorite: (ids: string[], id: string) => ids.includes(id),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routesForStops.mockResolvedValue(new Map([['5', []], ['6', []]]));
    nearby.mockResolvedValue([
      { ...stopA, meters: 120 },
      { ...stopB, meters: 480 },
    ]);
    searchByName.mockResolvedValue([]);
    searchByCode.mockResolvedValue(null);
    stopsByIds.mockResolvedValue([]);
    locationState.status = 'idle';
    locationState.coords = null;
  });

  it('prompts for location before any is granted', async () => {
    render(<HomeScreen />);
    await waitFor(() => screen.getByText(/stops near you/i));
  });

  it('lists nearby stops once coordinates are available', async () => {
    locationState.status = 'granted';
    locationState.coords = { lat: 21.32, lon: -157.9 };

    render(<HomeScreen />);
    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
    screen.getByText('LAGOON DR + KAPALULU PL');
  });

  it('remains usable when location is denied', async () => {
    locationState.status = 'denied';

    render(<HomeScreen />);
    await waitFor(() => screen.getByText(/search/i));
    expect(screen.queryByText('LAGOON DR + IOLANA PL')).toBeNull();
  });

  it('searches by stop number when the query is numeric', async () => {
    searchByCode.mockResolvedValue(stopA);

    render(<HomeScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/stop number or name/i), '5');

    await waitFor(() => expect(searchByCode).toHaveBeenCalledWith('5'));
  });

  it('searches by name when the query is not numeric', async () => {
    searchByName.mockResolvedValue([stopA]);

    render(<HomeScreen />);
    fireEvent.changeText(screen.getByPlaceholderText(/stop number or name/i), 'lagoon');

    await waitFor(() => expect(searchByName).toHaveBeenCalledWith('lagoon'));
  });

  it('shows a favorited stop even when it is not nearby', async () => {
    // The favorite is deliberately absent from the nearby results: favorites
    // are resolved from the database, not scraped out of what is close by.
    const favoritesModule = jest.requireMock('../../../data/storage/favorites');
    favoritesModule.loadFavorites.mockResolvedValue(['9999']);
    const distant = {
      stop_id: '9999',
      stop_code: '9999',
      stop_name: 'FAR AWAY STOP',
      lat: 21.5,
      lon: -158.1,
    };
    stopsByIds.mockResolvedValue([distant]);
    routesForStops.mockResolvedValue(new Map([['9999', []]]));

    render(<HomeScreen />);
    await waitFor(() => screen.getByText('FAR AWAY STOP'));
  });

  it('shows the required attribution', async () => {
    render(<HomeScreen />);
    await waitFor(() =>
      screen.getByText(
        'Route and arrival data provided by permission of Oahu Transit Services, Inc',
      ),
    );
  });

  it('states it is not affiliated with the agency', async () => {
    render(<HomeScreen />);
    await waitFor(() => screen.getByText(/not affiliated with or endorsed by/i));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest features/stops/__tests__/HomeScreen.test.tsx`
Expected: FAIL — cannot find module `../HomeScreen`.

- [ ] **Step 3: Implement**

Create `features/stops/HomeScreen.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useStopQueries } from '../../data/gtfs/db';
import { useLocation } from './useLocation';
import {
  addFavorite,
  isFavorite,
  loadFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import { StopRow } from './StopRow';
import type { RouteSummary, Stop, StopWithDistance } from '../../data/gtfs/types';

const ATTRIBUTION =
  'Route and arrival data provided by permission of Oahu Transit Services, Inc';
const DISCLAIMER =
  'Not affiliated with or endorsed by Oahu Transit Services, Inc.';

type Listed = Stop & { meters?: number };

const isNumericQuery = (value: string): boolean => /^\d+$/.test(value.trim());

export function HomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const palette = isDark ? dark : light;

  const { nearby, searchByName, searchByCode, routesForStops, stopsByIds } =
    useStopQueries();
  const location = useLocation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Listed[] | null>(null);
  const [nearbyStops, setNearbyStops] = useState<StopWithDistance[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteStops, setFavoriteStops] = useState<Stop[]>([]);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(
    new Map(),
  );

  useEffect(() => {
    loadFavorites().then(setFavoriteIds);
  }, []);

  useEffect(() => {
    if (location.coords === null) return;
    nearby(location.coords).then(setNearbyStops);
  }, [location.coords, nearby]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setResults(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      if (isNumericQuery(trimmed)) {
        const stop = await searchByCode(trimmed);
        if (!cancelled) setResults(stop === null ? [] : [stop]);
        return;
      }
      const found = await searchByName(trimmed);
      if (!cancelled) setResults(found);
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [query, searchByCode, searchByName]);

  const visible: Listed[] = useMemo(() => {
    if (results !== null) return results;
    const favoritesFirst: Listed[] = favoriteStops;
    const rest = nearbyStops.filter((stop) => !favoriteIds.includes(stop.stop_id));
    return [...favoritesFirst, ...rest];
  }, [results, favoriteStops, nearbyStops, favoriteIds]);

  useEffect(() => {
    const ids = visible.map((stop) => stop.stop_id);
    if (ids.length === 0) return;
    routesForStops(ids).then(setRoutesByStop);
  }, [visible, routesForStops]);

  useEffect(() => {
    // Resolved from the database, not from nearby results — a favorite must
    // stay visible even when the user is nowhere near it.
    stopsByIds(favoriteIds).then((stops) => {
      const byId = new Map(stops.map((stop) => [stop.stop_id, stop]));
      const ordered: Stop[] = [];
      for (const id of favoriteIds) {
        const stop = byId.get(id);
        if (stop !== undefined) ordered.push(stop);
      }
      setFavoriteStops(ordered);
    });
  }, [favoriteIds, stopsByIds]);

  const toggleFavorite = useCallback(
    async (stopId: string) => {
      const next = favoriteIds.includes(stopId)
        ? await removeFavorite(stopId)
        : await addFavorite(stopId);
      setFavoriteIds(next);
    },
    [favoriteIds],
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Stop number or name"
        placeholderTextColor={palette.muted}
        style={[styles.search, { color: palette.text, borderColor: palette.border }]}
        autoCorrect={false}
        clearButtonMode="while-editing"
        inputMode="search"
      />

      {results === null && location.status === 'idle' ? (
        <Pressable
          onPress={location.request}
          style={[styles.prompt, { borderColor: palette.border }]}
        >
          <Text style={[styles.promptText, { color: palette.text }]}>
            Show stops near you
          </Text>
          <Text style={[styles.promptHint, { color: palette.muted }]}>
            Sorted by walking distance
          </Text>
        </Pressable>
      ) : null}

      {results === null && location.status === 'denied' ? (
        <Text style={[styles.notice, { color: palette.muted }]}>
          Location is off, so search for a stop by number or name.
        </Text>
      ) : null}

      {results === null && location.status === 'error' ? (
        <Text style={[styles.notice, { color: palette.muted }]}>
          Could not read your location. Search for a stop instead.
        </Text>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(stop) => stop.stop_id}
        renderItem={({ item }) => (
          <StopRow
            stop={item}
            routes={routesByStop.get(item.stop_id) ?? []}
            meters={item.meters ?? null}
            isFavorite={isFavorite(favoriteIds, item.stop_id)}
            onToggleFavorite={toggleFavorite}
          />
        )}
        ListEmptyComponent={
          results === null ? null : (
            <Text style={[styles.notice, { color: palette.muted }]}>
              No stops match that.
            </Text>
          )
        }
        ListHeaderComponent={
          <View style={styles.legalBlock}>
            <Text style={[styles.legal, { color: palette.muted }]}>{ATTRIBUTION}</Text>
            <Text style={[styles.legal, { color: palette.muted }]}>{DISCLAIMER}</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

> **Corrected during execution (2026-07-30).** Two changes to this snippet,
> both human-ruled after the Task 9 review:
>
> 1. The legal block was originally `ListFooterComponent`, which put the
>    attribution and disclaimer beneath up to 25 stop rows in the populated
>    state — reachable only by scrolling to the end. The provider's terms
>    require *prominent display*, and no test can catch the regression because
>    RNTL renders all `FlatList` children regardless of viewport. It is now
>    `ListHeaderComponent`. Scrolling it out of view afterwards is explicitly
>    acceptable; the bar is that the user sees it without hunting.
> 2. `SafeAreaView` imported from `react-native` (still shown above) is
>    deprecated and warns on every test run and in Expo Go's LogBox. The ruling
>    was to switch to `react-native-safe-area-context`, which Expo Go bundles,
>    so it costs nothing on the CI loop. Import `SafeAreaView` from there
>    instead.
>
>    No `SafeAreaProvider` is used, contrary to the usual guidance for that
>    package: `SafeAreaView` reads no context (the provider exists to serve the
>    hooks), and `SafeAreaContext` renders `{insets != null ? children : null}`
>    with insets arriving only from a native event — so a provider without
>    `initialMetrics` renders nothing at all under Jest. Adding one would break
>    the suite for no benefit.

const light = {
  background: '#ffffff',
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
};

const dark = {
  background: '#101314',
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: {
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    fontSize: 16,
  },
  prompt: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: 'center',
  },
  promptText: { fontSize: 16, fontWeight: '600' },
  promptHint: { fontSize: 13, marginTop: 2 },
  notice: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  footer: { padding: 16, gap: 6 },
  legal: { fontSize: 11, lineHeight: 15 },
});
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest features/stops/__tests__/HomeScreen.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire the database and screen into the app root**

Replace `App.tsx` entirely. `SQLiteProvider` copies the bundled asset into the app's database directory on first launch, so the read-only asset is opened correctly.

```tsx
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './features/stops/HomeScreen';

export default function App() {
  return (
    <Suspense
      fallback={
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      }
    >
      <SQLiteProvider
        databaseName="gtfs.db"
        assetSource={{ assetId: require('./assets/db/gtfs.db') }}
        useSuspense
      >
        <HomeScreen />
        <StatusBar style="auto" />
      </SQLiteProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run test:scripts && npm run typecheck`
Expected: all green, exit 0.

- [ ] **Step 7: Verify on a real device through Expo Go**

Run: `npm start`, scan the QR code with the iPhone.

Confirm by observation:
1. The search field accepts `5` and returns LAGOON DR + IOLANA PL.
2. Searching `lagoon` returns several stops.
3. Pressing "Show stops near you" triggers the iOS permission prompt.
4. Granting it lists nearby stops with distances ascending.
5. Denying it leaves search working, with no crash and no error state.
6. Tapping a star pins the stop to the top; it survives an app restart.
7. Attribution and disclaimer are visible at the list header, above the first
   stop row, without scrolling (see the ruling above).

- [ ] **Step 8: Commit**

```bash
git add features/stops/HomeScreen.tsx features/stops/__tests__/HomeScreen.test.tsx
git commit -m "Add home screen with nearby stops, search, and favorites"
```

---

## Verification

Increment 1 is complete when all of the following hold:

- `npm test` passes with no failures.
- `npm run test:scripts` passes.
- `npm run typecheck` exits 0.
- `npm run build:gtfs` reproduces `assets/db/gtfs.db` from scratch.
- The Expo Go checks in Task 9 Step 6 have been observed on the iPhone, not assumed.
- `grep -rn " as " --include=*.ts --include=*.tsx .` surfaces no type assertions in new code.

## Deliberately out of scope

- Live arrivals — Increment 2, requires the AppID.
- Route detail with ordered stop list — Increment 2. The `route_stops` table is built now so the data is ready.
- Maps and route polylines — Increment 3, requires `shapes.txt`.
- GTFS refresh at runtime. The feed declares `feed_end_date=20260822`; a refresh path is required before Increment 3, and rebuilding via `npm run build:gtfs` covers it until then.
