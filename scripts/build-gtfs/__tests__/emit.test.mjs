import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emitDatabase } from '../emit.mjs';

const stops = [
  { stop_id: '5', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL', stop_lat: '21.32', stop_lon: '-157.9' },
  { stop_id: '6', stop_code: '', stop_name: 'LAGOON DR + KAPALULU PL', stop_lat: '21.33', stop_lon: '-157.91' },
];

const routes = [
  { route_id: '8', route_short_name: '8', route_long_name: 'Waikiki-Ala Moana' },
  { route_id: '20', route_short_name: '20', route_long_name: 'Airport-Waikiki' },
];

const stopRoutes = [
  { stop_id: '5', route_id: '8' },
  { stop_id: '6', route_id: '20' },
];

const routeStops = [
  { route_id: '8', direction_id: '0', seq: 0, stop_id: '5' },
  { route_id: '8', direction_id: '0', seq: 1, stop_id: '6' },
];

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function indexNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

describe('emitDatabase', () => {
  test('creates the schema: tables, indexes, and the FTS5 virtual table', () => {
    const db = new DatabaseSync(':memory:');
    emitDatabase(db, { stops, routes, stopRoutes, routeStops, feedStartDate: '20260701', feedEndDate: '20260822' });

    assert.deepEqual(tableNames(db), [
      'meta',
      'route_stops',
      'routes',
      'stop_routes',
      'stops',
      'stops_fts',
      'stops_fts_config',
      'stops_fts_data',
      'stops_fts_docsize',
      'stops_fts_idx',
    ]);
    assert.deepEqual(indexNames(db), ['idx_stop_routes_stop', 'idx_stops_lat_lon']);
    db.close();
  });

  test('inserts the expected row counts for known-good synthetic input', () => {
    const db = new DatabaseSync(':memory:');
    const counts = emitDatabase(db, { stops, routes, stopRoutes, routeStops, feedStartDate: '20260701', feedEndDate: '20260822' });

    assert.deepEqual(counts, { stops: 2, routes: 2, stopRoutes: 2, routeStops: 2 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stops').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM routes').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stop_routes').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM route_stops').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stops_fts').get().n, 2);
    db.close();
  });

  test('writes feed_start_date, feed_end_date, and a generated_at timestamp into meta', () => {
    const db = new DatabaseSync(':memory:');
    const before = new Date();
    emitDatabase(db, { stops, routes, stopRoutes, routeStops, feedStartDate: '20260701', feedEndDate: '20260822' });
    const after = new Date();

    const row = db.prepare('SELECT feed_start_date, feed_end_date, generated_at FROM meta').get();
    assert.equal(row.feed_start_date, '20260701');
    assert.equal(row.feed_end_date, '20260822');
    const generatedAt = new Date(row.generated_at);
    assert.ok(generatedAt >= before && generatedAt <= after, 'generated_at should be a real timestamp from the build');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta').get().n, 1);
    db.close();
  });

  test('stores null in meta when the feed omits feed_start_date/feed_end_date', () => {
    const db = new DatabaseSync(':memory:');
    emitDatabase(db, { stops, routes, stopRoutes, routeStops, feedStartDate: undefined, feedEndDate: undefined });

    const row = db.prepare('SELECT feed_start_date, feed_end_date FROM meta').get();
    assert.equal(row.feed_start_date, null);
    assert.equal(row.feed_end_date, null);
    db.close();
  });

  test('drops a stop_routes pair referencing an unknown stop_id', () => {
    const db = new DatabaseSync(':memory:');
    const orphaned = [...stopRoutes, { stop_id: 'ghost', route_id: '8' }];
    const counts = emitDatabase(db, { stops, routes, stopRoutes: orphaned, routeStops, feedStartDate: null, feedEndDate: null });

    assert.equal(counts.stopRoutes, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stop_routes').get().n, 2);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM stop_routes WHERE stop_id = ?').get('ghost').n,
      0,
    );
    db.close();
  });

  test('drops a route_stops entry referencing an unknown route_id', () => {
    const db = new DatabaseSync(':memory:');
    const orphaned = [...routeStops, { route_id: 'ghost', direction_id: '0', seq: 0, stop_id: '5' }];
    const counts = emitDatabase(db, { stops, routes, stopRoutes, routeStops: orphaned, feedStartDate: null, feedEndDate: null });

    assert.equal(counts.routeStops, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM route_stops').get().n, 2);
    db.close();
  });

  test('throws naming the file, row, and field for a missing stop_lat', () => {
    const db = new DatabaseSync(':memory:');
    const badStops = [{ stop_id: '5', stop_name: 'LAGOON DR', stop_lat: '', stop_lon: '-157.9' }];
    assert.throws(
      () => emitDatabase(db, { stops: badStops, routes, stopRoutes: [], routeStops: [], feedStartDate: null, feedEndDate: null }),
      { message: 'Invalid stops.txt row 0: missing required field "stop_lat"' },
    );
    db.close();
  });

  test('throws naming the file, row, and field for a non-numeric stop_lon', () => {
    const db = new DatabaseSync(':memory:');
    const badStops = [{ stop_id: '5', stop_name: 'LAGOON DR', stop_lat: '21.32', stop_lon: 'abc' }];
    assert.throws(
      () => emitDatabase(db, { stops: badStops, routes, stopRoutes: [], routeStops: [], feedStartDate: null, feedEndDate: null }),
      { message: 'Invalid stops.txt row 0: field "stop_lon" is "abc", not a number' },
    );
    db.close();
  });

  test('throws on a stops row missing stop_id or stop_name', () => {
    const db = new DatabaseSync(':memory:');
    const badStops = [{ stop_id: '', stop_name: 'LAGOON DR', stop_lat: '21.32', stop_lon: '-157.9' }];
    assert.throws(
      () => emitDatabase(db, { stops: badStops, routes, stopRoutes: [], routeStops: [], feedStartDate: null, feedEndDate: null }),
      { message: 'Invalid stops.txt row 0: missing required field "stop_id"' },
    );
    db.close();
  });

  test('a missing stop_lat of "" is rejected rather than silently coerced to 0,0', () => {
    // Regression: Number('') === 0 passes Number.isFinite, which previously
    // let a blank coordinate through as a bogus (0, 0) — off the coast of
    // Africa, nowhere near Oahu — instead of failing loudly.
    const db = new DatabaseSync(':memory:');
    const badStops = [{ stop_id: '9', stop_name: 'GHOST STOP', stop_lat: '', stop_lon: '' }];
    assert.throws(() =>
      emitDatabase(db, { stops: badStops, routes, stopRoutes: [], routeStops: [], feedStartDate: null, feedEndDate: null }),
    );
    db.close();
  });
});
