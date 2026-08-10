import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downgradeToV1, manifestNameFor, pkg } from '../publish.mjs';
import { emitDatabase } from '../emit.mjs';
import { SCHEMA_VERSION, FLOOR_COUNTS, meetsFloor } from '../../../data/gtfs/sql.ts';

/**
 * The dual publish exists for one reason: a binary already on a phone has
 * `manifest.json` compiled into it and ignores a manifest of another schema, so
 * the day this stops publishing a v1 generation is the day every one of those
 * installs silently stops updating forever.
 */

const stops = Array.from({ length: 3801 }, (_, i) => ({
  stop_id: String(i),
  stop_code: String(i),
  stop_name: `STOP ${i}`,
  stop_lat: '21.3',
  stop_lon: '-157.85',
}));

const routes = Array.from({ length: 101 }, (_, i) => ({
  route_id: String(i),
  route_short_name: String(i),
  route_long_name: `Route ${i}`,
}));

const stopRoutes = Array.from({ length: 5001 }, (_, i) => ({
  stop_id: String(i % 3801),
  route_id: String(i % 101),
}));

const shapes = Array.from({ length: 401 }, (_, i) => ({
  shape_id: `s${i}`,
  polyline: '_p~iF~ps|U_ulLnnqC',
}));

const routeShapes = [{ route_id: '1', direction_id: '0', shape_id: 's1' }];

let work;
let sourcePath;

before(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'wheredabus-publish-'));
  sourcePath = path.join(work, 'gtfs.db');

  const db = new DatabaseSync(sourcePath);
  emitDatabase(db, {
    stops,
    routes,
    stopRoutes,
    routeStops: [{ route_id: '1', direction_id: '0', seq: 0, stop_id: '1' }],
    shapes,
    routeShapes,
    feedStartDate: '20260701',
    feedEndDate: '20260822',
  });
  db.close();
});

after(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('downgradeToV1', () => {
  test('leaves the source database untouched', async () => {
    const dest = path.join(work, 'legacy-untouched.db');
    await downgradeToV1(sourcePath, dest);

    const source = new DatabaseSync(sourcePath, { readOnly: true });
    assert.equal(source.prepare('SELECT COUNT(*) AS n FROM shapes').get().n, 401);
    assert.equal(source.prepare('SELECT schema_version AS v FROM meta').get().v, SCHEMA_VERSION);
    source.close();
  });

  test('has no shapes or route_shapes table', async () => {
    const dest = path.join(work, 'legacy-tables.db');
    await downgradeToV1(sourcePath, dest);

    const db = new DatabaseSync(dest, { readOnly: true });
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    db.close();

    assert.equal(names.includes('shapes'), false);
    assert.equal(names.includes('route_shapes'), false);
  });

  /**
   * `installUpdate` reads this field out of the downloaded file and refuses a
   * mismatch, so a v2 file merely *labelled* v1 in its manifest would be
   * rejected on the phone rather than in CI — the worst place to find out.
   */
  test('reports schema version 1, so an old binary will accept it', async () => {
    const dest = path.join(work, 'legacy-version.db');
    await downgradeToV1(sourcePath, dest);

    const db = new DatabaseSync(dest, { readOnly: true });
    assert.equal(db.prepare('SELECT schema_version AS v FROM meta').get().v, 1);
    db.close();
  });

  test('keeps every table a v1 binary actually reads', async () => {
    const dest = path.join(work, 'legacy-kept.db');
    await downgradeToV1(sourcePath, dest);

    const db = new DatabaseSync(dest, { readOnly: true });
    const counts = db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM stops) AS stops, ' +
          '(SELECT COUNT(*) FROM routes) AS routes, ' +
          '(SELECT COUNT(*) FROM stop_routes) AS stopRoutes, ' +
          '(SELECT COUNT(*) FROM route_stops) AS routeStops, ' +
          '(SELECT COUNT(*) FROM stops_fts) AS fts',
      )
      .get();
    db.close();

    assert.equal(counts.stops, 3801);
    assert.equal(counts.routes, 101);
    assert.equal(counts.stopRoutes > 0, true);
    assert.equal(counts.routeStops, 1);
    assert.equal(counts.fts, 3801);
  });

  test('is smaller than the build it came from', async () => {
    const dest = path.join(work, 'legacy-size.db');
    await downgradeToV1(sourcePath, dest);

    const [before, after] = await Promise.all([readFile(sourcePath), readFile(dest)]);
    assert.ok(
      after.length < before.length,
      `expected the v1 file to shed the shape tables' pages: ${before.length} -> ${after.length}`,
    );
  });

  /**
   * The floor is checked on the current schema before anything is downgraded,
   * because `FLOOR_COUNTS` counts a table the v1 file does not have. This is
   * what makes that ordering safe rather than merely convenient.
   */
  test('the current build clears the floor that the v1 file cannot be asked about', () => {
    const db = new DatabaseSync(sourcePath, { readOnly: true });
    const counts = db.prepare(FLOOR_COUNTS).get();
    db.close();
    assert.equal(meetsFloor(counts), true);
  });
});

describe('manifestNameFor', () => {
  /**
   * The unsuffixed name is a frozen contract with binaries already on phones.
   * `data/gtfs/refresh.ts` builds the same two names from the app's own
   * SCHEMA_VERSION; that file's own test asserts the app half.
   */
  test('v1 keeps the unsuffixed name every shipped binary asks for', () => {
    assert.equal(manifestNameFor(1), 'manifest.json');
  });

  test('every later schema gets a name of its own', () => {
    assert.equal(manifestNameFor(2), 'manifest-v2.json');
    assert.equal(manifestNameFor(3), 'manifest-v3.json');
  });
});

describe('package stages both generations', () => {
  let dist;
  let staged;

  before(async () => {
    dist = path.join(work, 'dist');
    staged = await pkg('feed-sha', { built: sourcePath, dist });
  });

  test('writes a manifest for the current schema and one for v1', async () => {
    const names = await readdir(dist);
    assert.ok(names.includes('manifest.json'), names.join(', '));
    assert.ok(names.includes(manifestNameFor(SCHEMA_VERSION)), names.join(', '));
  });

  test('each manifest names a database that was actually staged', async () => {
    const names = await readdir(dist);
    assert.ok(names.includes(staged.current.file), names.join(', '));
    assert.ok(names.includes(staged.legacy.file), names.join(', '));
  });

  test('the unsuffixed manifest describes the v1 generation', async () => {
    const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.match(manifest.file, /^gtfs-v1-/);
  });

  test('the current schema’s manifest describes the current generation', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(dist, manifestNameFor(SCHEMA_VERSION)), 'utf8'),
    );
    assert.equal(manifest.schemaVersion, SCHEMA_VERSION);
    assert.match(manifest.file, new RegExp(`^gtfs-v${SCHEMA_VERSION}-`));
  });

  /**
   * One build, two generations. If these ever disagreed, `check` would compare
   * against one of them and conclude the feed had changed on every run.
   */
  test('both generations describe the same feed and the same build', async () => {
    const [legacy, current] = await Promise.all([
      readFile(path.join(dist, 'manifest.json'), 'utf8'),
      readFile(path.join(dist, manifestNameFor(SCHEMA_VERSION)), 'utf8'),
    ]).then((files) => files.map((text) => JSON.parse(text)));

    assert.equal(legacy.builtAt, current.builtAt);
    assert.equal(legacy.sourceSha256, current.sourceSha256);
    assert.equal(legacy.feedEndDate, current.feedEndDate);
  });

  test('each manifest’s hash and size match the file it names', async () => {
    for (const name of ['manifest.json', manifestNameFor(SCHEMA_VERSION)]) {
      const manifest = JSON.parse(await readFile(path.join(dist, name), 'utf8'));
      const bytes = await readFile(path.join(dist, manifest.file));
      assert.equal(bytes.length, manifest.bytes, name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256, name);
    }
  });

  test('the staged v1 database really is schema v1', async () => {
    const db = new DatabaseSync(path.join(dist, staged.legacy.file), { readOnly: true });
    assert.equal(db.prepare('SELECT schema_version AS v FROM meta').get().v, 1);
    db.close();
  });

  test('leaves no intermediate file behind for the release upload to find', async () => {
    const names = await readdir(dist);
    assert.equal(names.includes('gtfs-v1-source.db'), false, names.join(', '));
  });
});
