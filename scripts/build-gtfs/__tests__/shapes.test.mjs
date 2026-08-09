import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRouteShapes,
  deriveRouteStops,
  deriveShapes,
  representativeTrips,
} from '../derive.mjs';
import { decodePolyline } from '../../../data/gtfs/polyline.ts';

/**
 * `representativeTrips` keys on `route_id\0direction_id` — NUL, because GTFS
 * permits spaces in ids. Written through this helper rather than as a literal
 * so the key stays readable in a test.
 */
const key = (routeId, directionId) => `${routeId}\0${directionId}`;

const trips = [
  { trip_id: 'short', route_id: '8', direction_id: '0', shape_id: 's-short' },
  { trip_id: 'full', route_id: '8', direction_id: '0', shape_id: 's-full' },
  { trip_id: 'back', route_id: '8', direction_id: '1', shape_id: 's-back' },
];

const stopTimes = [
  { trip_id: 'short', stop_id: '5', stop_sequence: '1' },
  { trip_id: 'short', stop_id: '6', stop_sequence: '2' },
  { trip_id: 'full', stop_id: '5', stop_sequence: '1' },
  { trip_id: 'full', stop_id: '6', stop_sequence: '2' },
  { trip_id: 'full', stop_id: '7', stop_sequence: '3' },
  { trip_id: 'back', stop_id: '7', stop_sequence: '1' },
];

describe('representativeTrips', () => {
  test('picks the trip visiting the most stops, so a short turn does not truncate the route', () => {
    assert.equal(representativeTrips(stopTimes, trips).get(key('8', '0')), 'full');
  });

  test('picks one trip per direction', () => {
    const representatives = representativeTrips(stopTimes, trips);
    assert.equal(representatives.size, 2);
    assert.equal(representatives.get(key('8', '1')), 'back');
  });

  /**
   * The stop list and the road line have to come from the *same* trip.
   * Comparing one trip's stops against another trip's shape is the mistake that
   * was made while measuring whether polylines were affordable at all, and it
   * inflated the error badly.
   */
  test('picks the same representative trip that the stop sequences came from', () => {
    const representatives = representativeTrips(stopTimes, trips);
    const derived = deriveRouteStops(stopTimes, trips)
      .filter((row) => row.route_id === '8' && row.direction_id === '0')
      .map((row) => row.stop_id);
    const fromRepresentative = stopTimes
      .filter((row) => row.trip_id === representatives.get(key('8', '0')))
      .map((row) => row.stop_id);
    assert.deepEqual(derived, fromRepresentative);
  });
});

describe('deriveRouteShapes', () => {
  test('takes the shape of the representative trip, not of any other', () => {
    const shapes = deriveRouteShapes(trips, representativeTrips(stopTimes, trips));
    assert.deepEqual(shapes, [
      { route_id: '8', direction_id: '0', shape_id: 's-full' },
      { route_id: '8', direction_id: '1', shape_id: 's-back' },
    ]);
  });

  test('omits a direction whose representative has no shape', () => {
    const shapeless = trips.map((trip) =>
      trip.trip_id === 'back' ? { ...trip, shape_id: '' } : trip,
    );
    const shapes = deriveRouteShapes(shapeless, representativeTrips(stopTimes, shapeless));
    assert.equal(
      shapes.some((row) => row.direction_id === '1'),
      false,
    );
  });
});

describe('deriveShapes', () => {
  test('emits one row per shape_id', () => {
    const rows = [
      { shape_id: 'a', shape_pt_lat: '21.30', shape_pt_lon: '-157.85', shape_pt_sequence: '1' },
      { shape_id: 'a', shape_pt_lat: '21.31', shape_pt_lon: '-157.86', shape_pt_sequence: '2' },
      { shape_id: 'b', shape_pt_lat: '21.40', shape_pt_lon: '-157.95', shape_pt_sequence: '1' },
      { shape_id: 'b', shape_pt_lat: '21.41', shape_pt_lon: '-157.96', shape_pt_sequence: '2' },
    ];
    assert.deepEqual(
      deriveShapes(rows, 10).map((row) => row.shape_id),
      ['a', 'b'],
    );
  });

  /**
   * The feed numbers points from 10001 in steps of one, so a lexical sort puts
   * 10010 before 1002 and the line becomes a scribble.
   */
  test('orders points numerically, not lexically', () => {
    const rows = [
      { shape_id: 'a', shape_pt_lat: '21.30', shape_pt_lon: '-157.85', shape_pt_sequence: '10002' },
      { shape_id: 'a', shape_pt_lat: '21.32', shape_pt_lon: '-157.85', shape_pt_sequence: '10010' },
      // Off the line between its neighbours, so simplification keeps it and the
      // order it lands in is observable.
      { shape_id: 'a', shape_pt_lat: '21.31', shape_pt_lon: '-157.84', shape_pt_sequence: '10003' },
    ];
    const decoded = decodePolyline(deriveShapes(rows, 10)[0].polyline);
    assert.deepEqual(
      decoded.map((point) => point.lat),
      [21.3, 21.31, 21.32],
    );
  });

  test('thins a straight line down to its two ends', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      shape_id: 'a',
      shape_pt_lat: String(21.3 + i * 0.0001),
      shape_pt_lon: '-157.85',
      shape_pt_sequence: String(10001 + i),
    }));
    assert.equal(decodePolyline(deriveShapes(rows, 10)[0].polyline).length, 2);
  });

  test('throws on a shapes row with a non-numeric coordinate', () => {
    const rows = [
      { shape_id: 'a', shape_pt_lat: 'x', shape_pt_lon: '-157.85', shape_pt_sequence: '1' },
    ];
    assert.throws(() => deriveShapes(rows, 10), {
      message: 'Invalid shapes.txt row 0: field "shape_pt_lat" is "x", not a number',
    });
  });
});
