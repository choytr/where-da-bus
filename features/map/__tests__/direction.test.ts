import { directionIndexFor } from '../direction';
import type { RouteDirection } from '../../../data/gtfs/db';

function direction(directionId: string, headsigns: string[]): RouteDirection {
  return { directionId, shapeId: `shape-${directionId}`, headsigns, stops: [] };
}

/** Route 2's real shape: five headsigns one way, one the other. */
const ROUTE_2: RouteDirection[] = [
  direction('0', ['KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN']),
  direction('1', [
    'WAIKIKI - KAPIOLANI CC - DIAMOND HEAD',
    'ALAPAI TRANSIT CENTER',
    'WAIKIKI BEACH & HOTELS',
  ]),
];

describe('directionIndexFor', () => {
  it('finds the direction a headsign belongs to', () => {
    expect(directionIndexFor(ROUTE_2, 'KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN')).toBe(0);
  });

  it('finds a headsign that is not the first of its direction', () => {
    // The bug this whole module exists for: one direction, several signs, and
    // the map used to open at 0 regardless.
    expect(directionIndexFor(ROUTE_2, 'ALAPAI TRANSIT CENTER')).toBe(1);
  });

  it('cannot tell for a headsign the asset has never seen', () => {
    // GTFS here is reference data that can be weeks stale, so an unknown sign
    // is the app's ignorance. Undefined leaves the direction alone; 0 would
    // yank a rider off the direction they were already looking at.
    expect(directionIndexFor(ROUTE_2, 'KAPOLEI TRANSIT CENTER')).toBeUndefined();
  });

  it('cannot tell for a bus that signed nothing', () => {
    expect(directionIndexFor(ROUTE_2, null)).toBeUndefined();
  });

  it('cannot tell when the feed signed the route no way at all', () => {
    expect(directionIndexFor([direction('0', []), direction('1', [])], 'ANYTHING')).toBeUndefined();
  });

  it('takes the first direction when both are signed alike', () => {
    // Twelve routes do this — 6, 7, 8, 51, 52, 53, 54 and friends, mostly
    // loops. Their buses draw both ways, so either index shows the bus.
    const loop = [direction('0', ['MAKAHA - LOOP']), direction('1', ['MAKAHA - LOOP'])];
    expect(directionIndexFor(loop, 'MAKAHA - LOOP')).toBe(0);
  });

  it('is exact, so a near-miss degrades to cannot-tell', () => {
    expect(directionIndexFor(ROUTE_2, 'alapai transit center')).toBeUndefined();
  });
});
