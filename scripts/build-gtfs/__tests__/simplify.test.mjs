import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simplify } from '../simplify.mjs';

/** Roughly a metre of latitude, at Oahu's latitude near enough for a tolerance test. */
const METER = 1 / 111320;

describe('simplify', () => {
  test('keeps a line of two points untouched', () => {
    const points = [
      { lat: 21.3, lon: -157.85 },
      { lat: 21.31, lon: -157.86 },
    ];
    assert.deepEqual(simplify(points, 10), points);
  });

  test('drops a point that lies on the line between its neighbours', () => {
    const points = [
      { lat: 21.3, lon: -157.85 },
      { lat: 21.31, lon: -157.85 },
      { lat: 21.32, lon: -157.85 },
    ];
    assert.deepEqual(simplify(points, 10), [points[0], points[2]]);
  });

  test('keeps a point that deviates by more than the tolerance', () => {
    const points = [
      { lat: 21.3, lon: -157.85 },
      { lat: 21.31, lon: -157.85 + 50 * METER },
      { lat: 21.32, lon: -157.85 },
    ];
    assert.equal(simplify(points, 10).length, 3);
  });

  test('drops a point that deviates by less than the tolerance', () => {
    const points = [
      { lat: 21.3, lon: -157.85 },
      { lat: 21.31, lon: -157.85 + 2 * METER },
      { lat: 21.32, lon: -157.85 },
    ];
    assert.deepEqual(simplify(points, 10), [points[0], points[2]]);
  });

  test('always keeps the first and last points', () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      lat: 21.3 + i * 0.0001,
      lon: -157.85,
    }));
    const thinned = simplify(points, 10);
    assert.deepEqual(thinned[0], points[0]);
    assert.deepEqual(thinned[thinned.length - 1], points[points.length - 1]);
  });

  /**
   * Measuring to the infinite line rather than to the segment reports the far
   * end of a loop as lying on it, and the loop collapses to a straight there
   * and back. Oahu's feed has a loop at most termini.
   */
  test('does not collapse a line that doubles back on itself', () => {
    const points = [
      { lat: 21.3, lon: -157.85 },
      { lat: 21.31, lon: -157.85 },
      { lat: 21.3, lon: -157.85 },
    ];
    assert.equal(simplify(points, 10).length, 3);
  });

  test('survives a long gently curving line without recursing away', () => {
    const points = Array.from({ length: 20000 }, (_, i) => ({
      lat: 21.3 + i * 0.00002,
      lon: -157.85 + Math.sin(i / 500) * 0.002,
    }));
    assert.ok(simplify(points, 10).length < points.length);
  });
});
