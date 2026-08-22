import { distanceAlong, isOnLine, nextStopAlong } from '../nextStop';
import type { Coords } from '../../../lib/distance';
import type { Stop } from '../../../data/gtfs/types';

/**
 * Which stop a bus is heading for, derived — neither feed carries it.
 *
 * The interesting cases are the ones nearest-by-air gets wrong: a bus just past
 * the midpoint between two stops, and a route that doubles back on itself.
 */

/** A line running due east, in even 0.004° steps of about 415 m each. */
const EAST: Coords[] = [
  { lat: 21.3, lon: -157.9 },
  { lat: 21.3, lon: -157.896 },
  { lat: 21.3, lon: -157.892 },
  { lat: 21.3, lon: -157.888 },
];

const stop = (id: string, lon: number): Stop => ({
  stop_id: id,
  stop_code: id,
  stop_name: `STOP ${id}`,
  lat: 21.3,
  lon,
});

const STOPS = [stop('a', -157.9), stop('b', -157.896), stop('c', -157.892), stop('d', -157.888)];

describe('distanceAlong', () => {
  it('is zero at the start of the line', () => {
    expect(distanceAlong(EAST, { lat: 21.3, lon: -157.9 })).toBeCloseTo(0, 0);
  });

  it('grows along the line', () => {
    const first = distanceAlong(EAST, { lat: 21.3, lon: -157.898 }) ?? 0;
    const later = distanceAlong(EAST, { lat: 21.3, lon: -157.89 }) ?? 0;

    expect(first).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(first);
  });

  /** A point beside the road is still at that point *along* it. */
  it('projects a point off to one side onto the line', () => {
    const beside = distanceAlong(EAST, { lat: 21.3005, lon: -157.896 }) ?? 0;
    const on = distanceAlong(EAST, { lat: 21.3, lon: -157.896 }) ?? 0;

    expect(beside).toBeCloseTo(on, 0);
  });

  it('is null for something that is not a line', () => {
    expect(distanceAlong([], { lat: 21.3, lon: -157.9 })).toBeNull();
    expect(distanceAlong([{ lat: 21.3, lon: -157.9 }], { lat: 21.3, lon: -157.9 })).toBeNull();
  });
});

describe('nextStopAlong', () => {
  it('names the stop ahead of the bus', () => {
    const bus = { lat: 21.3, lon: -157.898 };

    expect(nextStopAlong(EAST, STOPS, bus)?.stop_id).toBe('b');
  });

  /**
   * **The case nearest-by-air gets wrong.** A bus 60% of the way from b to c is
   * closer to c, and "nearest, then the one after" would name d — skipping the
   * stop it is actually about to reach.
   */
  it('does not skip the stop the bus is closest to but has not reached', () => {
    const pastMidpoint = { lat: 21.3, lon: -157.8936 };

    expect(nextStopAlong(EAST, STOPS, pastMidpoint)?.stop_id).toBe('c');
  });

  it('is null once the bus is past every stop', () => {
    expect(nextStopAlong(EAST, STOPS, { lat: 21.3, lon: -157.887 })).toBeNull();
  });

  /**
   * **The case that matters on Oahu.** Where a route doubles back, the stop
   * *nearest* a bus is often one it went past ten minutes ago on the other
   * carriageway. Measuring along the line is what tells the two apart.
   *
   * Here `out` is 330 m from the bus and `end` is 520 m, so nearest-by-air
   * names the one already behind it.
   */
  it('ignores a nearer stop the bus has already gone past', () => {
    const outAndBack: Coords[] = [
      { lat: 21.3, lon: -157.9 },
      { lat: 21.3, lon: -157.89 },
      { lat: 21.305, lon: -157.89 },
      { lat: 21.305, lon: -157.9 },
    ];
    const stops = [
      { ...stop('out', -157.895), lat: 21.302 },
      { ...stop('end', -157.9), lat: 21.305 },
    ];
    // On the return leg, heading back west.
    const bus = { lat: 21.305, lon: -157.895 };

    expect(nextStopAlong(outAndBack, stops, bus)?.stop_id).toBe('end');
  });

  it('is null when there is no line to measure against', () => {
    expect(nextStopAlong([], STOPS, { lat: 21.3, lon: -157.9 })).toBeNull();
  });
});

describe('isOnLine', () => {
  it('accepts a bus sitting on the road', () => {
    expect(isOnLine(EAST, { lat: 21.3, lon: -157.895 })).toBe(true);
  });

  /**
   * A bus running the other direction projects onto this line somewhere
   * arbitrary, and an arbitrary answer stated confidently is worse than none.
   */
  it('rejects a bus nowhere near it', () => {
    expect(isOnLine(EAST, { lat: 21.34, lon: -157.895 })).toBe(false);
  });

  it('rejects everything when there is no line', () => {
    expect(isOnLine([], { lat: 21.3, lon: -157.9 })).toBe(false);
  });
});
