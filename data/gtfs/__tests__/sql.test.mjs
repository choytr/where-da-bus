import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  FEED_END_DATE,
  ROUTE_BY_ID,
  ROUTE_STOPS,
  SEARCH_BY_NAME,
  SEARCH_BY_CODE,
  NEARBY_IN_BOX,
  boundingBox,
  routesForStopsSql,
  stopsByIdsSql,
  toFtsQuery,
} from '../sql.ts';

const DB = path.resolve(import.meta.dirname, '../../../assets/db/gtfs.db');

/** A stop_id guaranteed not to be present in `db`, built by mutating a candidate until it misses. */
function unusedStopId(db, candidate) {
  const ids = new Set(db.prepare('SELECT stop_id FROM stops').all().map((r) => r.stop_id));
  let id = candidate;
  while (ids.has(id)) id += '-x';
  return id;
}

/** A stop_code guaranteed not to be present in `db`, built the same way. */
function unusedStopCode(db, candidate) {
  const codes = new Set(db.prepare('SELECT stop_code FROM stops').all().map((r) => r.stop_code));
  let code = candidate;
  while (codes.has(code)) code += '-x';
  return code;
}

describe('gtfs sql', () => {
  let db;

  before(() => {
    if (!existsSync(DB)) {
      throw new Error('assets/db/gtfs.db missing — run: npm run build:gtfs');
    }
    db = new DatabaseSync(DB, { readOnly: true });
  });

  test('finds stops by name fragment', () => {
    // Structural, not feed-literal: pick any real stop with an alphabetic
    // word in its name, search for that word, and confirm the stop comes
    // back and every result actually contains the word. Works regardless
    // of what names the current feed happens to contain.
    const stops = db.prepare('SELECT stop_id, stop_name FROM stops').all();
    const stop = stops.find((s) => /[A-Za-z]{4,}/.test(s.stop_name));
    assert.ok(stop, 'expected at least one stop with an alphabetic name fragment');
    const word = stop.stop_name.match(/[A-Za-z]{4,}/)[0];

    const query = toFtsQuery(word);
    assert.ok(query, 'expected a runnable query for a real word');
    const rows = db.prepare(SEARCH_BY_NAME).all(query.match, 50);
    assert.ok(rows.some((r) => r.stop_id === stop.stop_id));
    assert.ok(rows.every((r) => r.stop_name.toUpperCase().includes(word.toUpperCase())));
  });

  test('finds a stop by its exact code', () => {
    const stop = db.prepare("SELECT stop_id, stop_code, lat FROM stops WHERE stop_code != '' LIMIT 1").get();
    assert.ok(stop, 'expected at least one stop with a stop_code');
    const row = db.prepare(SEARCH_BY_CODE).get(stop.stop_code);
    assert.equal(row.stop_id, stop.stop_id);
    assert.ok(typeof row.lat === 'number');
  });

  test('the shipped asset holds one stop per stop_code', () => {
    // The feed ships an `<id>_merge` twin for seventeen stops, sharing the
    // original's code. Two rows for one pole is two identical nearby entries
    // and a code lookup whose answer depends on scan order; the build drops
    // them (see withoutMergedDuplicateStops).
    const duplicated = db
      .prepare("SELECT stop_code FROM stops WHERE stop_code != '' GROUP BY stop_code HAVING COUNT(*) > 1")
      .all();
    assert.deepEqual(duplicated, []);
  });

  test('answers a code lookup the same way however many rows carry the code', () => {
    // Determinism does not rest on the build having removed the duplicates:
    // ORDER BY is what makes the answer a property of the query rather than
    // of SQLite's scan order.
    const code = db.prepare("SELECT stop_code FROM stops WHERE stop_code != '' LIMIT 1").get().stop_code;
    const ordered = db
      .prepare(`SELECT stop_id FROM stops WHERE stop_code = ? ORDER BY LENGTH(stop_id), stop_id`)
      .all(code);
    assert.equal(db.prepare(SEARCH_BY_CODE).get(code).stop_id, ordered[0].stop_id);
  });

  test('returns nothing for an unknown code', () => {
    const code = unusedStopCode(db, 'nonexistent-code');
    assert.equal(db.prepare(SEARCH_BY_CODE).get(code), undefined);
  });

  test('looks up several stops by id regardless of location', () => {
    const [a, b] = db.prepare('SELECT stop_id FROM stops LIMIT 2').all();
    const rows = db.prepare(stopsByIdsSql(2)).all(a.stop_id, b.stop_id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.stop_id).sort(), [a.stop_id, b.stop_id].sort());
  });

  test('id lookup tolerates ids that do not exist', () => {
    const real = db.prepare('SELECT stop_id FROM stops LIMIT 1').get();
    const ghost = unusedStopId(db, 'ghost');
    const rows = db.prepare(stopsByIdsSql(2)).all(real.stop_id, ghost);
    assert.equal(rows.length, 1);
  });

  test('bounding box selects stops near a point', () => {
    // Any real stop is trivially "near" its own coordinates, so this needs
    // no knowledge of what the feed actually contains.
    const stop = db.prepare('SELECT stop_id, lat, lon FROM stops LIMIT 1').get();
    const box = boundingBox({ lat: stop.lat, lon: stop.lon }, 500);
    const rows = db.prepare(NEARBY_IN_BOX).all(box.minLat, box.maxLat, box.minLon, box.maxLon);
    assert.ok(rows.some((r) => r.stop_id === stop.stop_id));
  });

  test('lists routes serving a stop, ordered numerically', () => {
    const withRoutes = db
      .prepare('SELECT stop_id FROM stop_routes GROUP BY stop_id HAVING COUNT(*) > 2 LIMIT 1')
      .get();
    const rows = db.prepare(routesForStopsSql(1)).all(withRoutes.stop_id);
    assert.ok(rows.length > 2);
    assert.ok(rows.every((r) => r.stop_id === withRoutes.stop_id));
    const numeric = rows.map((r) => Number(r.short_name)).filter(Number.isFinite);
    assert.deepEqual(numeric, [...numeric].sort((a, b) => a - b));
  });

  test('lists routes for several stops in a single query', () => {
    const ids = db
      .prepare('SELECT stop_id FROM stop_routes GROUP BY stop_id LIMIT 3')
      .all()
      .map((r) => r.stop_id);
    assert.equal(ids.length, 3);

    const rows = db.prepare(routesForStopsSql(ids.length)).all(...ids);

    // Every requested stop is represented, and nothing else is.
    for (const id of ids) assert.ok(rows.some((r) => r.stop_id === id));
    assert.ok(rows.every((r) => ids.includes(r.stop_id)));
  });

  test('reads the last day the shipped feed is valid through', () => {
    // Not asserted against a literal date: this proves the meta table answers
    // and answers in the YYYYMMDD the app's parser expects, whichever feed the
    // asset was last built from.
    const row = db.prepare(FEED_END_DATE).get();
    assert.ok(row, 'expected a meta row in the built database');
    assert.match(row.feed_end_date, /^\d{8}$/);
  });

  test('search treats FTS5 operators and punctuation as literal text without throwing', () => {
    // Regression coverage for the FTS5 syntax-error class of bug: none of
    // these should ever reach SQLite as a bare/invalid MATCH expression.
    for (const input of ['AND', 'OR', 'NEAR', 'foo AND bar', 'ala-moana', '-lagoon', 'kalihi"quote']) {
      const query = toFtsQuery(input);
      assert.ok(query, `expected a runnable query for ${JSON.stringify(input)}`);
      assert.doesNotThrow(() => db.prepare(SEARCH_BY_NAME).all(query.match, 5));
    }
  });
});

describe('toFtsQuery', () => {
  test('returns null for empty input', () => {
    assert.equal(toFtsQuery(''), null);
  });

  test('returns null for input that reduces to nothing', () => {
    assert.equal(toFtsQuery('*'), null);
    assert.equal(toFtsQuery('""'), null);
    assert.equal(toFtsQuery('   '), null);
  });

  test('quotes and wildcards each term', () => {
    assert.deepEqual(toFtsQuery('foo bar'), { match: '"foo"* "bar"*' });
  });

  test('strips embedded quotes and asterisks before quoting', () => {
    assert.deepEqual(toFtsQuery('kalihi"quote'), { match: '"kalihi"* "quote"*' });
    assert.deepEqual(toFtsQuery('wild*card'), { match: '"wild"* "card"*' });
  });

  test('wraps the match text so it cannot be bound to SQLite directly', () => {
    // The wrapper is the whole point of the type: an object is not a legal
    // SQLite bind parameter, so forgetting `.match` fails loudly here and
    // fails to compile in TypeScript, rather than silently searching for
    // the string "[object Object]".
    const query = toFtsQuery('kalihi');
    assert.ok(query);
    assert.equal(typeof query.match, 'string');
  });
});

describe('boundingBox', () => {
  test('grows with radius', () => {
    const small = boundingBox({ lat: 21.3, lon: -157.9 }, 100);
    const large = boundingBox({ lat: 21.3, lon: -157.9 }, 1000);
    assert.ok(large.maxLat > small.maxLat);
    assert.ok(large.minLon < small.minLon);
  });

  test('brackets the centre point', () => {
    const box = boundingBox({ lat: 21.3, lon: -157.9 }, 500);
    assert.ok(box.minLat < 21.3 && box.maxLat > 21.3);
    assert.ok(box.minLon < -157.9 && box.maxLon > -157.9);
  });
});

describe('route detail', () => {
  let db;

  before(() => {
    if (!existsSync(DB)) {
      throw new Error('assets/db/gtfs.db missing — run: npm run build:gtfs');
    }
    db = new DatabaseSync(DB, { readOnly: true });
  });

  /** A route that actually exists in the built asset, so these test the real feed. */
  const someRouteId = () => db.prepare('SELECT route_id FROM route_stops LIMIT 1').get().route_id;

  test('ROUTE_BY_ID finds a route', () => {
    const id = someRouteId();
    const row = db.prepare(ROUTE_BY_ID).get(id);
    assert.equal(row.route_id, id);
    assert.equal(typeof row.short_name, 'string');
    assert.equal(typeof row.long_name, 'string');
  });

  test('ROUTE_BY_ID returns nothing for a route that is not there', () => {
    assert.equal(db.prepare(ROUTE_BY_ID).get('no-such-route'), undefined);
  });

  test('ROUTE_STOPS returns stops joined to their names', () => {
    const rows = db.prepare(ROUTE_STOPS).all(someRouteId());
    assert.ok(rows.length > 0, 'a real route should serve at least one stop');
    for (const row of rows) {
      assert.equal(typeof row.stop_name, 'string');
      assert.notEqual(row.stop_name, '');
      assert.equal(typeof row.lat, 'number');
      assert.equal(typeof row.seq, 'number');
      assert.equal(typeof row.direction_id, 'string');
    }
  });

  test('ROUTE_STOPS orders by seq within each direction', () => {
    // The ordering is the whole point: a route is a sequence, and stop names
    // carry no order of their own to fall back on.
    const rows = db.prepare(ROUTE_STOPS).all(someRouteId());
    const seen = new Map();
    for (const row of rows) {
      const previous = seen.get(row.direction_id);
      if (previous !== undefined) {
        assert.ok(
          row.seq > previous,
          `seq went ${previous} -> ${row.seq} within direction ${row.direction_id}`,
        );
      }
      seen.set(row.direction_id, row.seq);
    }
    assert.ok(seen.size > 0);
  });

  test('ROUTE_STOPS groups all of a direction together', () => {
    // The screen splits on direction by walking the rows once, which is only
    // correct if each direction arrives as one contiguous run.
    const rows = db.prepare(ROUTE_STOPS).all(someRouteId());
    const starts = [];
    for (const [i, row] of rows.entries()) {
      if (i === 0 || rows[i - 1].direction_id !== row.direction_id) starts.push(row.direction_id);
    }
    assert.equal(starts.length, new Set(starts).size, 'a direction appeared in two runs');
  });

  test('ROUTE_STOPS returns nothing for a route that is not there', () => {
    assert.deepEqual(db.prepare(ROUTE_STOPS).all('no-such-route'), []);
  });

  test('every route_stops row points at a stop that exists', () => {
    // A dangling stop_id would make the join silently drop stops from a route,
    // which reads as a short route rather than as a broken build.
    const orphans = db
      .prepare(
        'SELECT COUNT(*) AS n FROM route_stops rs LEFT JOIN stops s ON s.stop_id = rs.stop_id WHERE s.stop_id IS NULL',
      )
      .get().n;
    assert.equal(orphans, 0);
  });
});
