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

  test('brackets the centre point', () => {
    const box = boundingBox({ lat: 21.3, lon: -157.9 }, 500);
    assert.ok(box.minLat < 21.3 && box.maxLat > 21.3);
    assert.ok(box.minLon < -157.9 && box.maxLon > -157.9);
  });
});
