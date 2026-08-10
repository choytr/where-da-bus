import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  deriveStopRoutes,
  deriveRouteStops,
  deriveRouteDirections,
} from '../derive.mjs';

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

  test('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
    assert.deepEqual(rows, [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  test('preserves a newline embedded in a quoted field', () => {
    const rows = parseCsv('a,b\n"line1\nline2",z\n');
    assert.deepEqual(rows, [{ a: 'line1\nline2', b: 'z' }]);
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

  test('round-trips ids containing spaces', () => {
    // GTFS permits spaces in id fields, so the composite key cannot be
    // space-separated: 'STOP 5' + ' ' + 'RTE 8' would split into four parts
    // and yield stop_id 'STOP', route_id '5'.
    const spacedTrips = [{ trip_id: 't1', route_id: 'RTE 8', direction_id: '0' }];
    const stopTimes = [{ trip_id: 't1', stop_id: 'STOP 5', stop_sequence: '1' }];
    assert.deepEqual(deriveStopRoutes(stopTimes, spacedTrips), [
      { stop_id: 'STOP 5', route_id: 'RTE 8' },
    ]);
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

  test('round-trips a route_id containing a space', () => {
    const spacedTrips = [{ trip_id: 'long', route_id: 'RTE 8', direction_id: '0' }];
    const stopTimes = [{ trip_id: 'long', stop_id: '5', stop_sequence: '1' }];
    assert.deepEqual(deriveRouteStops(stopTimes, spacedTrips), [
      { route_id: 'RTE 8', direction_id: '0', seq: 0, stop_id: '5' },
    ]);
  });
});

describe('deriveRouteDirections', () => {
  test('collapses thousands of trips into distinct route/direction/headsign triples', () => {
    const trips = [
      { trip_id: 't1', route_id: '2', direction_id: '0', trip_headsign: 'WAIKIKI' },
      { trip_id: 't2', route_id: '2', direction_id: '0', trip_headsign: 'WAIKIKI' },
      { trip_id: 't3', route_id: '2', direction_id: '1', trip_headsign: 'KALIHI' },
    ];
    assert.deepEqual(deriveRouteDirections(trips), [
      { route_id: '2', direction_id: '0', headsign: 'WAIKIKI' },
      { route_id: '2', direction_id: '1', headsign: 'KALIHI' },
    ]);
  });

  test('keeps every headsign a direction is signed with', () => {
    // Route 2's direction 1 really carries five. A lookup written as a single
    // equality would attribute four fifths of its buses to nothing.
    const trips = [
      { trip_id: 't1', route_id: '2', direction_id: '1', trip_headsign: 'ALAPAI TRANSIT CENTER' },
      { trip_id: 't2', route_id: '2', direction_id: '1', trip_headsign: 'WAIKIKI - KAPIOLANI CC' },
      { trip_id: 't3', route_id: '2', direction_id: '1', trip_headsign: 'WAIKIKI BEACH' },
    ];
    const rows = deriveRouteDirections(trips);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.direction_id === '1'));
  });

  test('keeps a headsign that both directions share, since the ambiguity is the fact', () => {
    // Twelve routes do this — a short-turn signed with a street name has no
    // direction. Collapsing it to one side would attribute those buses wrongly
    // rather than leaving them unattributed.
    const trips = [
      { trip_id: 't1', route_id: '14', direction_id: '0', trip_headsign: 'WAIALAE AVENUE' },
      { trip_id: 't2', route_id: '14', direction_id: '1', trip_headsign: 'WAIALAE AVENUE' },
    ];
    assert.deepEqual(deriveRouteDirections(trips), [
      { route_id: '14', direction_id: '0', headsign: 'WAIALAE AVENUE' },
      { route_id: '14', direction_id: '1', headsign: 'WAIALAE AVENUE' },
    ]);
  });

  test('does not normalise the headsign, because the live join is exact equality', () => {
    const trips = [
      { trip_id: 't1', route_id: '2', direction_id: '0', trip_headsign: 'KAHAUIKI  KALIHI ' },
    ];
    assert.equal(deriveRouteDirections(trips)[0].headsign, 'KAHAUIKI  KALIHI ');
  });

  test('skips a trip carrying no direction or no headsign', () => {
    // Both are optional in GTFS, and a triple missing either half cannot
    // attribute a bus to a direction. A feed that lost them wholesale is caught
    // by the floor, not by refusing to build every other table.
    const trips = [
      { trip_id: 't1', route_id: '2', direction_id: '', trip_headsign: 'WAIKIKI' },
      { trip_id: 't2', route_id: '2', direction_id: '0', trip_headsign: '' },
      { trip_id: 't3', route_id: '2' },
    ];
    assert.deepEqual(deriveRouteDirections(trips), []);
  });

  test('round-trips ids and headsigns containing spaces', () => {
    const trips = [
      { trip_id: 't1', route_id: 'RTE 8', direction_id: '0', trip_headsign: 'ALA MOANA CENTER' },
    ];
    assert.deepEqual(deriveRouteDirections(trips), [
      { route_id: 'RTE 8', direction_id: '0', headsign: 'ALA MOANA CENTER' },
    ]);
  });

  test('throws on a trips row missing route_id', () => {
    assert.throws(
      () => deriveRouteDirections([{ trip_id: 't1', route_id: '', direction_id: '0', trip_headsign: 'X' }]),
      { message: /trips\.txt row 0: missing required field "route_id"/ },
    );
  });
});

describe('required-field validation', () => {
  const trips = [{ trip_id: 't1', route_id: '8', direction_id: '0' }];

  test('deriveStopRoutes throws on a stop_times row missing trip_id', () => {
    const stopTimes = [{ trip_id: '', stop_id: '5', stop_sequence: '1' }];
    assert.throws(() => deriveStopRoutes(stopTimes, trips), {
      message: 'Invalid stop_times.txt row 0: missing required field "trip_id"',
    });
  });

  test('deriveStopRoutes throws on a stop_times row missing stop_id', () => {
    const stopTimes = [{ trip_id: 't1', stop_id: '', stop_sequence: '1' }];
    assert.throws(() => deriveStopRoutes(stopTimes, trips), {
      message: 'Invalid stop_times.txt row 0: missing required field "stop_id"',
    });
  });

  test('deriveStopRoutes reports the actual row index for a later malformed row', () => {
    const stopTimes = [
      { trip_id: 't1', stop_id: '5', stop_sequence: '1' },
      { trip_id: 't1', stop_id: '', stop_sequence: '2' },
    ];
    assert.throws(() => deriveStopRoutes(stopTimes, trips), {
      message: 'Invalid stop_times.txt row 1: missing required field "stop_id"',
    });
  });

  test('deriveStopRoutes throws on a trips row missing route_id', () => {
    const badTrips = [{ trip_id: 't1', route_id: '', direction_id: '0' }];
    const stopTimes = [{ trip_id: 't1', stop_id: '5', stop_sequence: '1' }];
    assert.throws(() => deriveStopRoutes(stopTimes, badTrips), {
      message: 'Invalid trips.txt row 0: missing required field "route_id"',
    });
  });

  test('deriveStopRoutes throws on a trips row missing trip_id', () => {
    const badTrips = [{ trip_id: '', route_id: '8', direction_id: '0' }];
    const stopTimes = [{ trip_id: 't1', stop_id: '5', stop_sequence: '1' }];
    assert.throws(() => deriveStopRoutes(stopTimes, badTrips), {
      message: 'Invalid trips.txt row 0: missing required field "trip_id"',
    });
  });

  test('deriveRouteStops throws on a missing stop_sequence', () => {
    const stopTimes = [{ trip_id: 't1', stop_id: '5', stop_sequence: '' }];
    assert.throws(() => deriveRouteStops(stopTimes, trips), {
      message: 'Invalid stop_times.txt row 0: missing required field "stop_sequence"',
    });
  });

  test('deriveRouteStops throws on a non-numeric stop_sequence', () => {
    const stopTimes = [{ trip_id: 't1', stop_id: '5', stop_sequence: 'abc' }];
    assert.throws(() => deriveRouteStops(stopTimes, trips), {
      message: 'Invalid stop_times.txt row 0: field "stop_sequence" is "abc", not a number',
    });
  });
});
