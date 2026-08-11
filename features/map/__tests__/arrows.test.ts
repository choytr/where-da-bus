import { arrowPlacements, bearingBetween } from '../arrows';
import { metersBetween, type Coords } from '../../../lib/distance';

/**
 * Where the arrowheads that say which way the line runs go.
 *
 * Arithmetic, tested as arithmetic. Two invariants carry most of this file:
 * the **count never changes**, because the caller mounts exactly that many
 * markers once and never again and a marker unmounting inside `MapView` is the
 * seam behind the SIGABRT; and placement is a function of **the line alone**,
 * because arrows that moved on every pan were the thing Truman called very
 * annoying.
 */

/** A line running due east, about 4.1 km end to end. */
const EASTWARD: Coords[] = [
  { lat: 21.3069, lon: -157.8823 },
  { lat: 21.3069, lon: -157.8583 },
  { lat: 21.3069, lon: -157.8423 },
];

const lengthOf = (line: readonly Coords[]) =>
  line.slice(1).reduce((sum, point, i) => sum + metersBetween(line[i]!, point), 0);

describe('bearingBetween', () => {
  it('reads due north as zero', () => {
    expect(bearingBetween({ lat: 21.3, lon: -157.85 }, { lat: 21.31, lon: -157.85 })).toBeCloseTo(0);
  });

  it('reads due east as ninety', () => {
    expect(bearingBetween({ lat: 21.3, lon: -157.85 }, { lat: 21.3, lon: -157.84 })).toBeCloseTo(90, 1);
  });

  it('reads due south as one hundred and eighty', () => {
    expect(bearingBetween({ lat: 21.31, lon: -157.85 }, { lat: 21.3, lon: -157.85 })).toBeCloseTo(180);
  });

  /** Never negative: it is handed to a view transform as degrees. */
  it('reads due west as two hundred and seventy rather than minus ninety', () => {
    expect(bearingBetween({ lat: 21.3, lon: -157.84 }, { lat: 21.3, lon: -157.85 })).toBeCloseTo(270, 1);
  });

  /**
   * A degree of longitude is *shorter* than a degree of latitude — at Oahu's
   * 21°N by about 7% — so equal degree steps cover less ground east than north,
   * and the true bearing is more northerly than the naive one. Reading the
   * degrees straight off the numbers would say 45° here; the ground says 43°.
   */
  it('accounts for longitude degrees being shorter than latitude ones', () => {
    const bearing = bearingBetween({ lat: 21.3, lon: -157.85 }, { lat: 21.31, lon: -157.84 });

    expect(bearing).toBeLessThan(45);
    expect(bearing).toBeCloseTo(43, 0);
  });
});

describe('arrowPlacements', () => {
  /**
   * **The invariant the whole design rests on.** The caller mounts exactly this
   * many markers once and never again, so a shorter answer for any line would
   * be a marker unmounting inside `MapView`.
   */
  it('returns a constant number of arrows for any line', () => {
    expect(arrowPlacements(EASTWARD, 8)).toHaveLength(8);
    expect(arrowPlacements([], 8)).toHaveLength(8);
    expect(arrowPlacements([{ lat: 21.3069, lon: -157.8583 }], 8)).toHaveLength(8);
    expect(arrowPlacements(EASTWARD, 40)).toHaveLength(40);
  });

  it('points along the line', () => {
    for (const arrow of arrowPlacements(EASTWARD, 8)) {
      if (!arrow.visible) continue;
      expect(arrow.bearingDeg).toBeCloseTo(90, 1);
    }
  });

  /** Reverse the points and every arrowhead turns round. */
  it('points the other way down a reversed line', () => {
    for (const arrow of arrowPlacements([...EASTWARD].reverse(), 8)) {
      if (!arrow.visible) continue;
      expect(arrow.bearingDeg).toBeCloseTo(270, 1);
    }
  });

  /**
   * **The behaviour Truman asked for.** Placement is a function of the line and
   * nothing else, so a pan, a zoom or a rotation cannot move an arrowhead off
   * the piece of road it is marking.
   */
  it('puts an arrow at the same place on the road however the camera moves', () => {
    // There is no camera argument at all any more — the type is the guarantee,
    // and this asserts the consequence: same line in, same answer out.
    expect(arrowPlacements(EASTWARD, 8)).toEqual(arrowPlacements(EASTWARD, 8));
  });

  it('spaces them evenly by distance travelled', () => {
    const arrows = arrowPlacements(EASTWARD, 8).filter((a) => a.visible);
    expect(arrows.length).toBeGreaterThan(2);

    const gaps = arrows
      .slice(1)
      .map((arrow, index) => metersBetween(arrows[index]!.at, arrow.at));

    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, 0);
  });

  /** 500 m apart on a ~4.1 km line is eight of them, and the ninth would fall off. */
  it('uses only as many slots as the line is long enough for', () => {
    const arrows = arrowPlacements(EASTWARD, 40, 500);
    const drawn = arrows.filter((a) => a.visible).length;

    expect(drawn).toBe(Math.floor(lengthOf(EASTWARD) / 500 + 0.5));
    expect(drawn).toBeLessThan(40);
  });

  /**
   * Widened rather than truncated: an arrow every 500 m for the first stretch
   * and none after would read as the line ending where the pool ran out.
   */
  it('spreads them wider rather than leaving the far end unmarked', () => {
    const arrows = arrowPlacements(EASTWARD, 4, 100).filter((a) => a.visible);

    expect(arrows).toHaveLength(4);
    // The last one is in the final quarter of a line it would otherwise have
    // stopped 400 m into.
    expect(metersBetween(arrows[3]!.at, EASTWARD[2]!)).toBeLessThan(lengthOf(EASTWARD) / 4);
  });

  it('hides every arrow when there is no line to sit on', () => {
    expect(arrowPlacements([], 8).every((arrow) => !arrow.visible)).toBe(true);
  });

  /**
   * Unused slots still need a coordinate MapKit can project — and one nowhere
   * near the middle of the screen, where an invisible 16 pt frame would sit
   * over whatever a rider is trying to tap.
   */
  it('parks unused arrows off the map, in one fixed place', () => {
    const parked = arrowPlacements([], 4);

    for (const arrow of parked) {
      expect(Number.isFinite(arrow.at.lat)).toBe(true);
      expect(arrow.at).toEqual(parked[0]?.at);
      expect(Math.abs(arrow.at.lon - -157.85)).toBeGreaterThan(1);
    }
  });

  /**
   * The feed's thinned shapes contain repeated points. Dividing by a
   * zero-length segment would put an arrow at NaN, which MapKit is handed.
   */
  it('survives a line that repeats a point', () => {
    const doubled: Coords[] = [
      { lat: 21.3069, lon: -157.8823 },
      { lat: 21.3069, lon: -157.8823 },
      { lat: 21.3069, lon: -157.8423 },
    ];

    for (const arrow of arrowPlacements(doubled, 8)) {
      expect(Number.isFinite(arrow.at.lat)).toBe(true);
      expect(Number.isFinite(arrow.bearingDeg)).toBe(true);
    }
  });

  it('asks for none and gets none', () => {
    expect(arrowPlacements(EASTWARD, 0)).toEqual([]);
  });
});
