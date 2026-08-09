/**
 * Emits the app's SQLite schema onto an already-open `node:sqlite` database
 * from parsed + derived GTFS rows.
 *
 * Kept separate from `build.mjs` so it can be driven in tests against an
 * in-memory database with synthetic rows, without touching the network or
 * shelling out to `unzip`.
 */
import { requireField, requireNumberField } from './derive.mjs';
// The app's copy, not a second one. `data/gtfs/package.json` marks that
// directory ESM so Node can load the .ts directly (type stripping); the same
// route `data/gtfs/__tests__/sql.test.mjs` already takes. A published database
// and the binary that reads it agree on this number or the handshake is a lie.
import { SCHEMA_VERSION } from '../../data/gtfs/sql.ts';

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
  CREATE TABLE shapes (
    shape_id TEXT PRIMARY KEY,
    polyline TEXT NOT NULL
  );
  CREATE TABLE route_shapes (
    route_id     TEXT NOT NULL,
    direction_id TEXT NOT NULL,
    shape_id     TEXT NOT NULL,
    PRIMARY KEY (route_id, direction_id)
  );
  CREATE TABLE meta (
    feed_start_date TEXT,
    feed_end_date   TEXT,
    generated_at    TEXT NOT NULL,
    schema_version  INTEGER NOT NULL
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
 * Returns the surviving rows, the dropped ones — both in input order — and
 * `remap`, from each dropped `stop_id` to the surviving row that now stands
 * for it.
 *
 * **`remap` is not bookkeeping; it is the other half of the drop.** A dropped
 * row's `route_stops` and `stop_routes` entries describe a relationship the
 * *stop* really has, not one the duplicate row invented, so deleting them
 * loses real information. This is what lets the caller move them across
 * instead. See the comment on `emitDatabase`.
 */
export function withoutMergedDuplicateStops(stops) {
  const plainRows = stops.filter((stop) => !stopIdOf(stop).endsWith(MERGE_SUFFIX));
  const codesOnPlainRows = stopCodes(plainRows);

  const kept = [];
  const dropped = [];
  const remap = new Map();
  for (const stop of stops) {
    const code = stopCodeOf(stop);
    const duplicates =
      stopIdOf(stop).endsWith(MERGE_SUFFIX) && code !== '' && codesOnPlainRows.has(code);
    if (!duplicates) {
      kept.push(stop);
      continue;
    }
    dropped.push(stop);
    remap.set(stopIdOf(stop), survivingIdForCode(plainRows, code));
  }

  assertEveryStopCodeSurvives(stops, kept);
  return { kept, dropped, remap };
}

/**
 * The row a rider typing `code` actually gets, so a moved relationship lands
 * on the same stop the search does.
 *
 * `SEARCH_BY_CODE` in data/gtfs/sql.ts is
 * `ORDER BY LENGTH(stop_id), stop_id LIMIT 1`, and this reproduces it. The
 * tie-break only bites if a future feed puts two plain rows on one code —
 * which nothing forbids — and picking differently there would point the route
 * list at one stop while the code lookup returned the other.
 */
function survivingIdForCode(plainRows, code) {
  const ids = plainRows.filter((stop) => stopCodeOf(stop) === code).map(stopIdOf);
  ids.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return ids[0];
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
 * `stops`/`routes` rows is dropped rather than inserted.
 *
 * **Relationships pointing at a dropped `_merge` twin are moved, not
 * discarded**, and getting that wrong put holes in the data. Discarding them
 * looked safe — the stop still exists under its plain id, so nothing is
 * orphaned — but `deriveRouteStops` picks *one representative trip* per
 * direction, and where that trip visited the `_merge` id its `route_stops` row
 * was the only entry for that `stop_code` in the pattern. Deleting it removed
 * a stop the route genuinely serves: **18 of 236 directional patterns** on the
 * real feed, silently, with every row count still looking healthy.
 *
 * `stop_routes` mostly escaped it by luck, being a union over every trip, so
 * the same stop usually appeared under the plain id as well. That is precisely
 * why remapping can now collide on its `(stop_id, route_id)` primary key, and
 * why the pairs are de-duplicated below.
 *
 * Returns the row counts actually written per table plus how many duplicate
 * stops were dropped, and closes no resources — the caller owns `db`'s
 * lifecycle.
 */
export function emitDatabase(
  db,
  { stops, routes, stopRoutes, routeStops, shapes = [], routeShapes = [], feedStartDate, feedEndDate },
) {
  db.exec(SCHEMA_SQL);

  const { dropped: droppedStops, remap } = withoutMergedDuplicateStops(stops);

  /**
   * A relationship's stop, after a dropped twin has been accounted for.
   *
   * Applied *before* the known-stop check rather than after, which is the
   * whole point: `5_merge` is not a known stop — it was just dropped — so
   * checking first would discard the row before anything could move it.
   */
  const survivingStop = (stopId) => remap.get(stopId) ?? stopId;

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
  const insertShape = db.prepare('INSERT INTO shapes (shape_id, polyline) VALUES (?, ?)');
  const insertRouteShape = db.prepare(
    'INSERT INTO route_shapes (route_id, direction_id, shape_id) VALUES (?, ?, ?)',
  );
  const insertMeta = db.prepare(
    'INSERT INTO meta (feed_start_date, feed_end_date, generated_at, schema_version) VALUES (?, ?, ?, ?)',
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

  /**
   * Two different reasons a relationship row is not inserted, counted apart
   * because they mean opposite things.
   *
   * **Orphaned** is a row naming an id this feed does not contain. Dropping it
   * is right; dropping it silently is not. Rows disappearing during a build
   * while every headline count still looks healthy is exactly the shape of the
   * `route_stops` bug that survived five increments — and `publish.mjs`'s floor
   * check only catches a *total* collapse. A partial one clears the floor and
   * ships.
   *
   * **De-duplicated** is the remap working: one relationship arriving under
   * both of a stop's ids. Counting that as loss would report a problem on
   * every build.
   */
  let stopRoutesInserted = 0;
  let stopRoutesOrphaned = 0;
  let stopRoutesDeduplicated = 0;
  // Remapping merges two ids into one, so a pair the plain row already had can
  // arrive a second time — and `(stop_id, route_id)` is this table's primary
  // key, so the second insert would abort the build rather than be ignored.
  const insertedPairs = new Set();
  for (const pair of stopRoutes) {
    const stopId = survivingStop(pair.stop_id);
    if (!knownStops.has(stopId) || !knownRoutes.has(pair.route_id)) {
      stopRoutesOrphaned += 1;
      continue;
    }
    const key = `${stopId} ${pair.route_id}`;
    if (insertedPairs.has(key)) {
      stopRoutesDeduplicated += 1;
      continue;
    }
    insertedPairs.add(key);
    insertStopRoute.run(stopId, pair.route_id);
    stopRoutesInserted += 1;
  }

  let routeStopsInserted = 0;
  let routeStopsOrphaned = 0;
  // No de-duplication needed here: this table is keyed on
  // `(route_id, direction_id, seq)`, and remapping changes only `stop_id`.
  for (const rs of routeStops) {
    const stopId = survivingStop(rs.stop_id);
    if (!knownStops.has(stopId) || !knownRoutes.has(rs.route_id)) {
      routeStopsOrphaned += 1;
      continue;
    }
    insertRouteStop.run(rs.route_id, rs.direction_id, rs.seq, stopId);
    routeStopsInserted += 1;
  }

  // Every variant in the feed, not one per route and direction: an arrival
  // names the exact shape its bus is running, so a short-turn draws its own
  // line rather than the one the route view uses. ~152 KiB for all of them.
  const knownShapes = new Set();
  for (const shape of shapes) {
    insertShape.run(shape.shape_id, shape.polyline);
    knownShapes.add(shape.shape_id);
  }

  // Counted apart for the same reason the relationship tables are: a feed that
  // renames its shape ids would lose every line here while `shapes` itself
  // still looked full.
  let routeShapesInserted = 0;
  let routeShapesOrphaned = 0;
  for (const rs of routeShapes) {
    if (!knownRoutes.has(rs.route_id) || !knownShapes.has(rs.shape_id)) {
      routeShapesOrphaned += 1;
      continue;
    }
    insertRouteShape.run(rs.route_id, rs.direction_id, rs.shape_id);
    routeShapesInserted += 1;
  }

  insertMeta.run(feedStartDate ?? null, feedEndDate ?? null, new Date().toISOString(), SCHEMA_VERSION);

  db.exec("INSERT INTO stops_fts(stops_fts) VALUES('rebuild')");
  db.exec('COMMIT');
  db.exec('VACUUM');

  return {
    stops: knownStops.size,
    routes: knownRoutes.size,
    stopRoutes: stopRoutesInserted,
    routeStops: routeStopsInserted,
    shapes: knownShapes.size,
    routeShapes: routeShapesInserted,
    duplicateStopsDropped: droppedStops.length,
    stopRoutesOrphaned,
    routeStopsOrphaned,
    routeShapesOrphaned,
    stopRoutesDeduplicated,
  };
}
