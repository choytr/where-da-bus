/**
 * Emits the app's SQLite schema onto an already-open `node:sqlite` database
 * from parsed + derived GTFS rows.
 *
 * Kept separate from `build.mjs` so it can be driven in tests against an
 * in-memory database with synthetic rows, without touching the network or
 * shelling out to `unzip`.
 */
import { requireField, requireNumberField } from './derive.mjs';

const SCHEMA_SQL = `
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
  CREATE TABLE meta (
    feed_start_date TEXT,
    feed_end_date   TEXT,
    generated_at    TEXT NOT NULL
  );
  CREATE INDEX idx_stops_lat_lon ON stops(lat, lon);
  CREATE INDEX idx_stop_routes_stop ON stop_routes(stop_id);
  CREATE VIRTUAL TABLE stops_fts USING fts5(stop_name, content='stops', content_rowid='rowid');
`;

/**
 * Oahu's feed carries a second stops.txt row for a handful of stops, id'd
 * `<id>_merge`, sharing the original's `stop_code` and usually its name and
 * sitting five to thirty metres away. Two rows for one pole is two identical
 * list entries on the nearby screen, and an exact-code lookup that resolves to
 * whichever of them SQLite happens to reach first.
 */
const MERGE_SUFFIX = '_merge';

const stopCodeOf = (stop) => stop.stop_code ?? '';
const stopIdOf = (stop) => stop.stop_id ?? '';

/**
 * The set of non-blank `stop_code`s the rows can be searched by. Blank codes
 * are not a code, so they are not tracked.
 */
function stopCodes(stops) {
  const codes = new Set();
  for (const stop of stops) {
    const code = stopCodeOf(stop);
    if (code !== '') codes.add(code);
  }
  return codes;
}

/**
 * The guard that makes `withoutMergedDuplicateStops` safe on a feed nobody has
 * looked at yet. Dropping a row is only ever allowed to remove a *duplicate*
 * way of reaching a stop, never the last one: if a future feed renames the
 * surviving row or suffixes both halves of a pair, this throws at build time
 * rather than shipping a code the rider can type and get nothing back for.
 *
 * Exported for its own test — the filter it protects is written so it cannot
 * fire, which is exactly why the assertion needs proving independently.
 */
export function assertEveryStopCodeSurvives(before, after) {
  const survivors = stopCodes(after);
  const lost = [...stopCodes(before)].filter((code) => !survivors.has(code));
  if (lost.length > 0) {
    throw new Error(
      `Duplicate-stop filter would leave no stop for stop_code ${lost.join(', ')}. ` +
        'A rider typing that number would get nothing back. Refusing to build.',
    );
  }
}

/**
 * Drops each `_merge` stop that duplicates a plain row's `stop_code`.
 *
 * Deliberately not "drop every `_merge` id": a `_merge` row that is the only
 * one carrying its code is that stop's sole entry, and dropping it would take
 * the code off the map entirely. Same for a `_merge` row with a blank code —
 * nothing else can be standing in for it.
 *
 * Returns the surviving rows and the dropped ones, in input order.
 */
export function withoutMergedDuplicateStops(stops) {
  const codesOnPlainRows = stopCodes(
    stops.filter((stop) => !stopIdOf(stop).endsWith(MERGE_SUFFIX)),
  );

  const kept = [];
  const dropped = [];
  for (const stop of stops) {
    const code = stopCodeOf(stop);
    const duplicates =
      stopIdOf(stop).endsWith(MERGE_SUFFIX) && code !== '' && codesOnPlainRows.has(code);
    (duplicates ? dropped : kept).push(stop);
  }

  assertEveryStopCodeSurvives(stops, kept);
  return { kept, dropped };
}

/**
 * Writes the full schema and all rows onto `db`, an already-open
 * `node:sqlite` `DatabaseSync` (a real file or `:memory:`).
 *
 * `stops` and `routes` are parsed rows straight out of `parseCsv` (still
 * needing per-row validation — GTFS requires `stop_id`, `stop_name`,
 * `stop_lat`, `stop_lon` on every stops.txt row, and a missing or blank
 * `stop_lat`/`stop_lon` would otherwise coerce via `Number('')` to a
 * silently-wrong `0`). `stopRoutes` and `routeStops` are already-derived
 * pairs/sequences from `deriveStopRoutes`/`deriveRouteStops`. Any pair or
 * sequence entry referencing a `stop_id`/`route_id` outside the validated
 * `stops`/`routes` rows is dropped rather than inserted — which is also what
 * keeps `withoutMergedDuplicateStops` from orphaning anything: a dropped stop
 * takes its `stop_routes`/`route_stops` rows with it.
 *
 * Returns the row counts actually written per table plus how many duplicate
 * stops were dropped, and closes no resources — the caller owns `db`'s
 * lifecycle.
 */
export function emitDatabase(db, { stops, routes, stopRoutes, routeStops, feedStartDate, feedEndDate }) {
  db.exec(SCHEMA_SQL);

  const { dropped: droppedStops } = withoutMergedDuplicateStops(stops);

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
  const insertMeta = db.prepare(
    'INSERT INTO meta (feed_start_date, feed_end_date, generated_at) VALUES (?, ?, ?)',
  );

  db.exec('BEGIN');

  // Iterated over the unfiltered rows, skipping the dropped ones by identity,
  // so a validation error still names the row's real line in stops.txt rather
  // than its position after the filter shifted everything up.
  const knownStops = new Set();
  const isDropped = new Set(droppedStops);
  stops.forEach((s, index) => {
    if (isDropped.has(s)) return;
    const stopId = requireField(s, 'stop_id', index, 'stops.txt');
    const stopName = requireField(s, 'stop_name', index, 'stops.txt');
    const lat = requireNumberField(s, 'stop_lat', index, 'stops.txt');
    const lon = requireNumberField(s, 'stop_lon', index, 'stops.txt');
    insertStop.run(stopId, s.stop_code ?? '', stopName, lat, lon);
    knownStops.add(stopId);
  });

  const knownRoutes = new Set();
  routes.forEach((r, index) => {
    const routeId = requireField(r, 'route_id', index, 'routes.txt');
    insertRoute.run(routeId, r.route_short_name ?? '', r.route_long_name ?? '');
    knownRoutes.add(routeId);
  });

  let stopRoutesInserted = 0;
  for (const pair of stopRoutes) {
    if (!knownStops.has(pair.stop_id) || !knownRoutes.has(pair.route_id)) continue;
    insertStopRoute.run(pair.stop_id, pair.route_id);
    stopRoutesInserted += 1;
  }

  let routeStopsInserted = 0;
  for (const rs of routeStops) {
    if (!knownStops.has(rs.stop_id) || !knownRoutes.has(rs.route_id)) continue;
    insertRouteStop.run(rs.route_id, rs.direction_id, rs.seq, rs.stop_id);
    routeStopsInserted += 1;
  }

  insertMeta.run(feedStartDate ?? null, feedEndDate ?? null, new Date().toISOString());

  db.exec("INSERT INTO stops_fts(stops_fts) VALUES('rebuild')");
  db.exec('COMMIT');
  db.exec('VACUUM');

  return {
    stops: knownStops.size,
    routes: knownRoutes.size,
    stopRoutes: stopRoutesInserted,
    routeStops: routeStopsInserted,
    duplicateStopsDropped: droppedStops.length,
  };
}
