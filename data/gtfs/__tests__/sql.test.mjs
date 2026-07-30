import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
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
