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
  SEARCH_ROUTES,
  ROUTE_SHAPES,
  SHAPE_BY_ID,
  NEARBY_IN_BOX,
  boundingBox,
  routesForStopsSql,
  stopsByIdsSql,
  toFtsQuery,
  toLikeQuery,
  FLOOR,
  FLOOR_COUNTS,
  meetsFloor,
} from '../sql.ts';
import { decodePolyline } from '../polyline.ts';

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

  test('every route direction the asset lists is drawn with a shape it carries', () => {
    // The pairing is what matters: a route_shapes row naming a shape_id the
    // shapes table does not hold draws nothing, and would look from the row
    // counts alone like a healthy build.
    const dangling = db
      .prepare(
        'SELECT COUNT(*) AS n FROM route_shapes rs ' +
          'LEFT JOIN shapes s ON s.shape_id = rs.shape_id WHERE s.shape_id IS NULL',
      )
      .get();
    assert.equal(dangling.n, 0);
  });

  test('most of the feed’s routes can be drawn in both directions', () => {
    // Not all: a route the feed runs one way has one direction, and the point
    // of the number is that the table is broadly populated rather than that it
    // is exhaustive.
    const routes = db.prepare('SELECT COUNT(*) AS n FROM routes').get().n;
    const drawn = db
      .prepare('SELECT COUNT(DISTINCT route_id) AS n FROM route_shapes')
      .get().n;
    assert.ok(drawn > routes * 0.9, `only ${drawn} of ${routes} routes have a shape`);
  });

  test('a route direction resolves to a polyline that decodes to points on Oahu', () => {
    const direction = db.prepare(ROUTE_SHAPES).get('1');
    assert.ok(direction, 'expected route 1 to carry a shape');

    const row = db.prepare(SHAPE_BY_ID).get(direction.shape_id);
    assert.ok(row, 'expected the named shape to be in the shapes table');

    const points = decodePolyline(row.polyline);
    assert.ok(points.length > 1, 'expected a line rather than a point');
    for (const point of points) {
      assert.ok(point.lat > 21.2 && point.lat < 21.8, `lat off Oahu: ${point.lat}`);
      assert.ok(point.lon > -158.3 && point.lon < -157.6, `lon off Oahu: ${point.lon}`);
    }
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

describe('the floor', () => {
  /**
   * The floor is only useful if the real thing clears it by a wide margin. A
   * floor set just under the current feed's counts would fail the first time
   * the agency retired a route, so this is the test that keeps those numbers
   * honest — against the shipped asset, not a fixture.
   */
  test('the bundled database clears it, with room to spare', () => {
    const db = new DatabaseSync(DB, { readOnly: true });
    const counts = db.prepare(FLOOR_COUNTS).get();
    db.close();

    assert.ok(meetsFloor(counts), `bundled asset fails the floor: ${JSON.stringify(counts)}`);
    assert.ok(
      counts.stops > FLOOR.stops * 1.2,
      `floor of ${FLOOR.stops} stops is too close to the feed's ${counts.stops}`,
    );
  });

  test('rejects a database short on any one table', () => {
    const ample = { stops: 3800, routes: 120, stopRoutes: 18000, shapes: 532 };
    assert.equal(meetsFloor(ample), true);
    // A truncated upstream zip is the case this exists for: a perfectly valid,
    // perfectly hashed database with forty stops in it.
    assert.equal(meetsFloor({ ...ample, stops: 40 }), false);
    assert.equal(meetsFloor({ ...ample, routes: 4 }), false);
    assert.equal(meetsFloor({ ...ample, stopRoutes: 200 }), false);
    // A build that derived no shapes draws no route lines at all, while every
    // other count still looks perfectly healthy.
    assert.equal(meetsFloor({ ...ample, shapes: 0 }), false);
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

describe('route search', () => {
  let db;

  before(() => {
    if (!existsSync(DB)) {
      throw new Error('assets/db/gtfs.db missing — run: npm run build:gtfs');
    }
    db = new DatabaseSync(DB, { readOnly: true });
  });

  /** What `searchRoutes` binds, so these run the query the app runs. */
  const search = (input, limit = 30) => {
    const like = toLikeQuery(input);
    if (like === null) return [];
    return db.prepare(SEARCH_ROUTES).all(like.anywhere, like.anywhere, like.exact, like.prefix, limit);
  };

  test('finds a route by its number', () => {
    // Structural: any route whose number is what a rider would type.
    const route = db
      .prepare("SELECT short_name FROM routes WHERE short_name <> '' LIMIT 1")
      .get();
    assert.ok(route, 'expected at least one route with a number');

    const found = search(route.short_name);
    assert.ok(
      found.some((r) => r.short_name === route.short_name),
      `searching ${route.short_name} did not return it`,
    );
  });

  test('finds a route by its name', () => {
    const route = db
      .prepare("SELECT route_id, long_name FROM routes WHERE long_name LIKE '%_ _%' LIMIT 1")
      .get();
    assert.ok(route, 'expected a route whose name has more than one word');
    const word = route.long_name.match(/[A-Za-z]{4,}/)[0];

    const found = search(word);
    assert.ok(found.length > 0, `searching ${word} returned nothing`);
    for (const r of found) {
      const haystack = `${r.short_name} ${r.long_name}`.toLowerCase();
      assert.ok(haystack.includes(word.toLowerCase()), `${r.long_name} does not contain ${word}`);
    }
  });

  test('prefers an exact number match over a substring', () => {
    // Oahu has route 40 (Honolulu-Makaha) and routes 401, 402, 403. Typing
    // "40" must lead with 40 — the substring matches are a courtesy, not the
    // answer. Found structurally so this keeps meaning something if the feed
    // renumbers.
    const rows = db.prepare("SELECT short_name FROM routes WHERE short_name <> ''").all();
    const names = rows.map((r) => r.short_name);
    const exact = names.find((name) => names.some((other) => other !== name && other.startsWith(name)));
    assert.ok(exact, 'expected a route number that is a prefix of another');

    const found = search(exact);
    assert.equal(found[0].short_name, exact);
  });

  test('does not match a route by its route_id', () => {
    // The ids are not the numbers on the buses. In the current feed
    // `route_id: '40'` is route **C**, the CountryExpress to Makaha, and
    // `route_id: '13'` is route 14 — so matching on the id would answer "40"
    // with a route to the far side of the island.
    const liar = db
      .prepare(`
        SELECT route_id, short_name, long_name FROM routes
        WHERE instr(lower(short_name), lower(route_id)) = 0
          AND instr(lower(long_name), lower(route_id)) = 0
        LIMIT 1
      `)
      .get();
    assert.ok(liar, 'expected a route whose id appears in neither of its names');

    const found = search(liar.route_id);
    assert.ok(
      !found.some((r) => r.route_id === liar.route_id),
      `searching ${liar.route_id} returned the route whose id that is (${liar.short_name})`,
    );
  });

  test('an empty query returns nothing', () => {
    assert.deepEqual(search(''), []);
    assert.deepEqual(search('   '), []);
  });

  test('a wildcard in the query is not a wildcard', () => {
    // Unescaped, `%` would match every route in the feed — which reads as a
    // search that ignored what was typed.
    const all = db.prepare('SELECT count(*) AS c FROM routes').get().c;
    assert.ok(search('%').length < all);
    assert.ok(search('_').length < all);
  });
});

describe('toLikeQuery', () => {
  test('returns null when there is nothing to search for', () => {
    assert.equal(toLikeQuery(''), null);
    assert.equal(toLikeQuery('   '), null);
  });

  test('escapes the wildcards a rider might type', () => {
    assert.deepEqual(toLikeQuery('100%'), {
      anywhere: '%100\\%%',
      prefix: '100\\%%',
      // Compared with `=`, where a percent sign is a percent sign.
      exact: '100%',
    });
  });

  test('trims, because a trailing space is not part of a route name', () => {
    assert.deepEqual(toLikeQuery('  A LINE '), {
      anywhere: '%A LINE%',
      prefix: 'A LINE%',
      exact: 'A LINE',
    });
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

  /**
   * The invariant that the duplicate-stop filter broke, checked against the
   * real asset because that is the only place it was ever wrong.
   *
   * `deriveRouteStops` numbers one representative trip per direction `0..n-1`,
   * so a pattern's `seq` values are a contiguous run starting at zero **by
   * construction**. Nothing that legitimately shortens a route can dent that —
   * a short-turn trip simply is not the representative one. A hole can
   * therefore only mean a row was removed after numbering, which is exactly
   * what dropping a `_merge` twin's `route_stops` entry used to do: 17 of 236
   * patterns had a gap, and one more lost its last stop, where a missing row
   * leaves the run contiguous and merely short.
   *
   * The stop was still in the feed and still served by the route. It simply
   * vanished from the route's own list — which is the one screen a rider uses
   * to check whether a bus goes where they are going.
   */
  test('every directional pattern in the built asset covers every stop the route serves', () => {
    const patterns = db
      .prepare(
        'SELECT route_id, direction_id, COUNT(*) AS n, MIN(seq) AS lo, MAX(seq) AS hi ' +
          'FROM route_stops GROUP BY route_id, direction_id',
      )
      .all();

    assert.ok(patterns.length > 0, 'the asset should carry directional patterns at all');

    const holed = patterns
      .filter((p) => p.lo !== 0 || p.hi - p.lo + 1 !== p.n)
      .map((p) => `${p.route_id}/${p.direction_id}: ${p.n} stops numbered ${p.lo}..${p.hi}`);

    assert.deepEqual(holed, [], 'a gap in seq means a stop was dropped after numbering');
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
