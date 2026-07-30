import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, deriveStopRoutes, deriveRouteStops } from '../derive.mjs';

describe('parseCsv', () => {
  test('parses a header and rows into objects', () => {
    const rows = parseCsv('a,b\n1,2\n3,4\n');
    assert.deepEqual(rows, [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  test('strips a UTF-8 BOM from the first header', () => {
    const rows = parseCsv('﻿stop_id,name\n5,LAGOON\n');
    assert.deepEqual(rows, [{ stop_id: '5', name: 'LAGOON' }]);
  });

  test('honours quoted fields containing commas', () => {
    const rows = parseCsv('a,b\n"x,y",z\n');
    assert.deepEqual(rows, [{ a: 'x,y', b: 'z' }]);
  });

  test('ignores a trailing blank line', () => {
    assert.equal(parseCsv('a\n1\n\n').length, 1);
  });
});

describe('deriveStopRoutes', () => {
  const trips = [
    { trip_id: 't1', route_id: '8', direction_id: '0' },
    { trip_id: 't2', route_id: '8', direction_id: '0' },
    { trip_id: 't3', route_id: '20', direction_id: '0' },
  ];

  test('collapses many trips into distinct stop/route pairs', () => {
    const stopTimes = [
      { trip_id: 't1', stop_id: '5', stop_sequence: '1' },
      { trip_id: 't2', stop_id: '5', stop_sequence: '1' },
      { trip_id: 't3', stop_id: '5', stop_sequence: '1' },
    ];
    assert.deepEqual(deriveStopRoutes(stopTimes, trips), [
      { stop_id: '5', route_id: '20' },
      { stop_id: '5', route_id: '8' },
    ]);
  });

  test('drops stop_times whose trip is unknown', () => {
    const stopTimes = [{ trip_id: 'ghost', stop_id: '5', stop_sequence: '1' }];
    assert.deepEqual(deriveStopRoutes(stopTimes, trips), []);
  });
});

describe('deriveRouteStops', () => {
  const trips = [
    { trip_id: 'short', route_id: '8', direction_id: '0' },
    { trip_id: 'long', route_id: '8', direction_id: '0' },
  ];

  test('picks the trip visiting the most stops as representative', () => {
    const stopTimes = [
      { trip_id: 'short', stop_id: '5', stop_sequence: '1' },
      { trip_id: 'long', stop_id: '5', stop_sequence: '1' },
      { trip_id: 'long', stop_id: '6', stop_sequence: '2' },
      { trip_id: 'long', stop_id: '7', stop_sequence: '3' },
    ];
    assert.deepEqual(deriveRouteStops(stopTimes, trips), [
      { route_id: '8', direction_id: '0', seq: 0, stop_id: '5' },
      { route_id: '8', direction_id: '0', seq: 1, stop_id: '6' },
      { route_id: '8', direction_id: '0', seq: 2, stop_id: '7' },
    ]);
  });

  test('orders by stop_sequence numerically, not lexically', () => {
    const stopTimes = [
      { trip_id: 'long', stop_id: 'b', stop_sequence: '10' },
      { trip_id: 'long', stop_id: 'a', stop_sequence: '2' },
    ];
    const result = deriveRouteStops(stopTimes, trips);
    assert.deepEqual(result.map((r) => r.stop_id), ['a', 'b']);
  });
});
