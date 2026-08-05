import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  assertEveryStopCodeSurvives,
  emitDatabase,
  withoutMergedDuplicateStops,
} from '../emit.mjs';
import { SCHEMA_VERSION, SCHEMA_VERSION_SQL } from '../../../data/gtfs/sql.ts';

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

    assert.deepEqual(counts, {
      stops: 2,
      routes: 2,
      stopRoutes: 2,
      routeStops: 2,
      duplicateStopsDropped: 0,
    });
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

  /**
   * The discipline this increment needs — bump the constant, publish under the
   * new filename, leave the old assets up — is exactly what gets forgotten, so
   * it gets a test rather than a note. Reading through `SCHEMA_VERSION_SQL`
   * rather than a literal makes this fail if the *column* is renamed too, which
   * is the other way the two sides can stop agreeing.
   */
  test('stamps meta with the schema version the app is compiled against', () => {
    const db = new DatabaseSync(':memory:');
    emitDatabase(db, { stops, routes, stopRoutes, routeStops, feedStartDate: '20260701', feedEndDate: '20260822' });

    assert.equal(db.prepare(SCHEMA_VERSION_SQL).get().schema_version, SCHEMA_VERSION);
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

  test('drops a _merge stop when a plain row already carries its stop_code', () => {
    const db = new DatabaseSync(':memory:');
    const withDuplicate = [
      ...stops,
      { stop_id: '5_merge', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL', stop_lat: '21.3201', stop_lon: '-157.9001' },
    ];
    const counts = emitDatabase(db, { stops: withDuplicate, routes, stopRoutes, routeStops, feedStartDate: null, feedEndDate: null });

    assert.equal(counts.stops, 2);
    assert.equal(counts.duplicateStopsDropped, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stops WHERE stop_id = ?').get('5_merge').n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stops WHERE stop_code = ?').get('5').n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stops_fts').get().n, 2);
    db.close();
  });

  test('keeps a _merge stop that is the only row carrying its stop_code', () => {
    // The whole code would otherwise vanish: nothing else answers to "77".
    const db = new DatabaseSync(':memory:');
    const soleMerge = [
      ...stops,
      { stop_id: '77_merge', stop_code: '77', stop_name: 'NIMITZ HWY + PIER 38', stop_lat: '21.31', stop_lon: '-157.87' },
    ];
    const counts = emitDatabase(db, { stops: soleMerge, routes, stopRoutes, routeStops, feedStartDate: null, feedEndDate: null });

    assert.equal(counts.stops, 3);
    assert.equal(counts.duplicateStopsDropped, 0);
    assert.equal(db.prepare('SELECT stop_id FROM stops WHERE stop_code = ?').get('77').stop_id, '77_merge');
    db.close();
  });

  test('keeps a _merge stop with a blank stop_code, since no code can stand in for it', () => {
    const db = new DatabaseSync(':memory:');
    const blankCode = [
      ...stops,
      { stop_id: '6_merge', stop_code: '', stop_name: 'LAGOON DR + KAPALULU PL', stop_lat: '21.3301', stop_lon: '-157.9101' },
    ];
    const counts = emitDatabase(db, { stops: blankCode, routes, stopRoutes, routeStops, feedStartDate: null, feedEndDate: null });

    assert.equal(counts.stops, 3);
    assert.equal(counts.duplicateStopsDropped, 0);
    db.close();
  });

  /**
   * This test used to assert that the dropped row's relationships were dropped
   * with it — `counts.stopRoutes` staying at 2 — and that was the bug, written
   * down and guarded. What is still true, and still worth holding, is that no
   * row anywhere may reference an id that is no longer in `stops`.
   */
  test('moves the dropped duplicate’s stop_routes and route_stops onto the surviving id', () => {
    const db = new DatabaseSync(':memory:');
    const withDuplicate = [
      ...stops,
      { stop_id: '5_merge', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL', stop_lat: '21.3201', stop_lon: '-157.9001' },
    ];
    const counts = emitDatabase(db, {
      stops: withDuplicate,
      routes,
      stopRoutes: [...stopRoutes, { stop_id: '5_merge', route_id: '20' }],
      routeStops: [...routeStops, { route_id: '20', direction_id: '0', seq: 0, stop_id: '5_merge' }],
      feedStartDate: null,
      feedEndDate: null,
    });

    // Three, not two: the relationship the _merge row carried is real, and it
    // now belongs to stop 5.
    assert.equal(counts.stopRoutes, 3);
    assert.equal(counts.routeStops, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stop_routes WHERE stop_id = ?').get('5').n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM route_stops WHERE stop_id = ?').get('5').n, 2);
    // Nothing may point at an id that is not in `stops` any more.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stop_routes WHERE stop_id = ?').get('5_merge').n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM route_stops WHERE stop_id = ?').get('5_merge').n, 0);
    db.close();
  });

  test('still names the real stops.txt row when a later row is invalid', () => {
    // The filter must not renumber the rows the error messages point at.
    const db = new DatabaseSync(':memory:');
    const withDuplicate = [
      { stop_id: '5', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL', stop_lat: '21.32', stop_lon: '-157.9' },
      { stop_id: '5_merge', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL', stop_lat: '21.3201', stop_lon: '-157.9001' },
      { stop_id: '9', stop_code: '9', stop_name: 'GHOST STOP', stop_lat: '', stop_lon: '-157.9' },
    ];
    assert.throws(
      () => emitDatabase(db, { stops: withDuplicate, routes, stopRoutes: [], routeStops: [], feedStartDate: null, feedEndDate: null }),
      { message: 'Invalid stops.txt row 2: missing required field "stop_lat"' },
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

describe('withoutMergedDuplicateStops', () => {
  const plain = { stop_id: '5', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL' };
  const merged = { stop_id: '5_merge', stop_code: '5', stop_name: 'LAGOON DR + IOLANA PL' };

  test('drops the _merge row and keeps the plain one', () => {
    const { kept, dropped } = withoutMergedDuplicateStops([plain, merged]);
    assert.deepEqual(kept, [plain]);
    assert.deepEqual(dropped, [merged]);
  });

  test('drops the _merge row whichever order the feed lists the pair in', () => {
    const { kept } = withoutMergedDuplicateStops([merged, plain]);
    assert.deepEqual(kept, [plain]);
  });

  test('keeps a lone _merge row whose stop_code no plain row carries', () => {
    const lone = { stop_id: '77_merge', stop_code: '77', stop_name: 'NIMITZ HWY' };
    const { kept, dropped } = withoutMergedDuplicateStops([plain, lone]);
    assert.deepEqual(kept, [plain, lone]);
    assert.deepEqual(dropped, []);
  });

  test('keeps two _merge rows that share a code with each other but with no plain row', () => {
    // Nothing else answers to "88", so dropping either is not this filter's
    // call to make — SEARCH_BY_CODE's ORDER BY is what keeps the answer stable.
    const a = { stop_id: '88_merge', stop_code: '88', stop_name: 'KING ST' };
    const b = { stop_id: '88_x_merge', stop_code: '88', stop_name: 'KING ST' };
    const { kept, dropped } = withoutMergedDuplicateStops([a, b]);
    assert.deepEqual(kept, [a, b]);
    assert.deepEqual(dropped, []);
  });

  test('keeps a _merge row with a blank stop_code', () => {
    const blank = { stop_id: '9_merge', stop_code: '', stop_name: 'NO CODE' };
    const { kept, dropped } = withoutMergedDuplicateStops([plain, blank]);
    assert.deepEqual(kept, [plain, blank]);
    assert.deepEqual(dropped, []);
  });

  test('leaves a feed with no _merge rows untouched', () => {
    const rows = [plain, { stop_id: '6', stop_code: '6', stop_name: 'KAPALULU PL' }];
    const { kept, dropped } = withoutMergedDuplicateStops(rows);
    assert.deepEqual(kept, rows);
    assert.deepEqual(dropped, []);
  });

  test('does not treat a mid-id "_merge" as a suffix', () => {
    const notASuffix = { stop_id: '5_merged_2', stop_code: '5', stop_name: 'LAGOON DR' };
    const { kept } = withoutMergedDuplicateStops([plain, notASuffix]);
    assert.deepEqual(kept, [plain, notASuffix]);
  });

  test('reports where each dropped row’s relationships should go instead', () => {
    const { remap } = withoutMergedDuplicateStops([plain, merged]);
    assert.deepEqual([...remap], [['5_merge', '5']]);
  });

  test('names no destination for rows it did not drop', () => {
    const lone = { stop_id: '77_merge', stop_code: '77', stop_name: 'NIMITZ HWY' };
    const { remap } = withoutMergedDuplicateStops([plain, lone]);
    assert.equal(remap.size, 0);
  });
});

/**
 * The relationship half of the duplicate-stop filter, and the half that was
 * missing.
 *
 * `deriveRouteStops` picks one representative trip per direction. When that
 * trip happened to visit the `_merge` id, dropping the row took its
 * `route_stops` entry with it — and because that entry was the only one for
 * its `stop_code` in that pattern, the stop vanished from the route entirely.
 * **18 of 236 directional patterns skipped a stop the route genuinely serves.**
 *
 * `stop_routes` mostly escaped it, being a union over every trip, so the same
 * stop usually appeared under the plain id as well. That is exactly why the
 * remap has to de-duplicate rather than insert blindly.
 */
describe('emitDatabase remaps a dropped stop’s relationships', () => {
  const twinStops = [
    { stop_id: '5', stop_code: '5', stop_name: 'LAGOON DR', stop_lat: '21.32', stop_lon: '-157.9' },
    {
      stop_id: '5_merge',
      stop_code: '5',
      stop_name: 'LAGOON DR',
      stop_lat: '21.3201',
      stop_lon: '-157.9001',
    },
    { stop_id: '6', stop_code: '6', stop_name: 'KAPALULU PL', stop_lat: '21.33', stop_lon: '-157.91' },
  ];

  const emit = (input) => {
    const db = new DatabaseSync(':memory:');
    const counts = emitDatabase(db, {
      stops: twinStops,
      routes,
      feedStartDate: '20260701',
      feedEndDate: '20260822',
      ...input,
    });
    return { db, counts };
  };

  test('remaps a dropped _merge stop’s route_stops rows onto its surviving twin', () => {
    const { db, counts } = emit({
      stopRoutes: [{ stop_id: '5', route_id: '8' }],
      // The representative trip visited the _merge id. Before the remap this
      // row was dropped and route 8 simply did not serve stop 5.
      routeStops: [
        { route_id: '8', direction_id: '0', seq: 0, stop_id: '5_merge' },
        { route_id: '8', direction_id: '0', seq: 1, stop_id: '6' },
      ],
    });

    // Mapped to primitives: node:sqlite hands back null-prototype rows, which
    // a strict deep-equal against an object literal rejects on the prototype
    // alone. The same reason the schema tests above map to names.
    assert.deepEqual(
      db
        .prepare('SELECT seq, stop_id FROM route_stops ORDER BY seq')
        .all()
        .map((row) => [row.seq, row.stop_id]),
      [
        [0, '5'],
        [1, '6'],
      ],
    );
    assert.equal(counts.routeStops, 2);
    db.close();
  });

  test('remaps stop_routes and does not duplicate a pair the twin already had', () => {
    const { db, counts } = emit({
      // The union saw the stop under both ids. Remapping collides them onto
      // (5, 8), which is the stop_routes primary key.
      stopRoutes: [
        { stop_id: '5', route_id: '8' },
        { stop_id: '5_merge', route_id: '8' },
        { stop_id: '5_merge', route_id: '20' },
      ],
      routeStops: [],
    });

    assert.deepEqual(
      db
        .prepare('SELECT stop_id, route_id FROM stop_routes ORDER BY route_id')
        .all()
        .map((row) => [row.stop_id, row.route_id]),
      [
        ['5', '20'],
        ['5', '8'],
      ],
    );
    assert.equal(counts.stopRoutes, 2);
    db.close();
  });

  test('leaves rows alone when the _merge stop was kept', () => {
    // A lone `_merge` row carrying a code no plain row has is not dropped, so
    // nothing about its relationships may move either.
    const db = new DatabaseSync(':memory:');
    const lone = {
      stop_id: '77_merge',
      stop_code: '77',
      stop_name: 'NIMITZ HWY',
      stop_lat: '21.3',
      stop_lon: '-157.86',
    };
    const counts = emitDatabase(db, {
      stops: [twinStops[0], lone],
      routes,
      stopRoutes: [{ stop_id: '77_merge', route_id: '8' }],
      routeStops: [{ route_id: '8', direction_id: '0', seq: 0, stop_id: '77_merge' }],
      feedStartDate: '20260701',
      feedEndDate: '20260822',
    });

    assert.deepEqual(
      db.prepare('SELECT stop_id FROM stop_routes').all().map((row) => row.stop_id),
      ['77_merge'],
    );
    assert.deepEqual(
      db.prepare('SELECT stop_id FROM route_stops').all().map((row) => row.stop_id),
      ['77_merge'],
    );
    assert.equal(counts.stopRoutes, 1);
    db.close();
  });

  test('still drops a relationship pointing at a stop that is not in the feed', () => {
    // The remap must not become a way for unknown ids to slip past the
    // known-stop check that follows it.
    const { db, counts } = emit({
      stopRoutes: [{ stop_id: 'ghost', route_id: '8' }],
      routeStops: [{ route_id: '8', direction_id: '0', seq: 0, stop_id: 'ghost' }],
    });

    assert.equal(counts.stopRoutes, 0);
    assert.equal(counts.routeStops, 0);
    db.close();
  });
});

describe('assertEveryStopCodeSurvives', () => {
  test('passes when the filter only removed a duplicate way of reaching a code', () => {
    const before = [
      { stop_id: '5', stop_code: '5' },
      { stop_id: '5_merge', stop_code: '5' },
    ];
    assert.doesNotThrow(() => assertEveryStopCodeSurvives(before, [before[0]]));
  });

  test('throws naming every stop_code the filter would have made unreachable', () => {
    const before = [
      { stop_id: '5', stop_code: '5' },
      { stop_id: '6', stop_code: '6' },
      { stop_id: '7', stop_code: '7' },
    ];
    assert.throws(() => assertEveryStopCodeSurvives(before, [before[0]]), {
      message: /stop_code 6, 7\b/,
    });
  });

  test('ignores blank stop_codes, which are not a code anyone can type', () => {
    const before = [{ stop_id: '5', stop_code: '' }];
    assert.doesNotThrow(() => assertEveryStopCodeSurvives(before, []));
  });
});
