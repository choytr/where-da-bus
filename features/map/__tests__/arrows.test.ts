import { arrowPlacements, bearingBetween } from '../arrows';
import type { Region } from '../region';
import type { Coords } from '../../../lib/distance';

/**
 * Where the arrowheads that say which way the line runs go.
 *
 * Arithmetic, tested as arithmetic: `MapPolylineProps` has no arrow support, so
 * these are markers, and the thing that keeps markers out of the seam behind the
 * SIGABRT is that the *count never changes*. That is the invariant most of this
 * file is about.
 */

/** Downtown Honolulu, spanning about 1 km. */
const CLOSE: Region = {
  latitude: 21.3069,
  longitude: -157.8583,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

/** The whole route on screen. */
const WIDE: Region = { ...CLOSE, latitudeDelta: 0.09, longitudeDelta: 0.09 };

/** A line running due east across the middle of `CLOSE`. */
const EASTWARD: Coords[] = [
  { lat: 21.3069, lon: -157.8623 },
  { lat: 21.3069, lon: -157.8583 },
  { lat: 21.3069, lon: -157.8543 },
];

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

  /** Never negative: it is handed to a marker's `rotation`. */
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
   * many markers once and never again, so a shorter answer at some zoom would
   * be a marker unmounting inside `MapView`.
   */
  it('returns a constant number of arrows at every zoom', () => {
    expect(arrowPlacements(EASTWARD, CLOSE, 8)).toHaveLength(8);
    expect(arrowPlacements(EASTWARD, WIDE, 8)).toHaveLength(8);
    expect(arrowPlacements([], CLOSE, 8)).toHaveLength(8);
    expect(arrowPlacements([{ lat: 21.3069, lon: -157.8583 }], CLOSE, 8)).toHaveLength(8);
  });

  it('points along the line', () => {
    const arrows = arrowPlacements(EASTWARD, CLOSE, 4);

    for (const arrow of arrows) {
      expect(arrow.visible).toBe(true);
      expect(arrow.bearingDeg).toBeCloseTo(90, 1);
    }
  });

  /** Reverse the points and every arrowhead turns round. */
  it('points the other way down a reversed line', () => {
    const arrows = arrowPlacements([...EASTWARD].reverse(), CLOSE, 4);

    for (const arrow of arrows) expect(arrow.bearingDeg).toBeCloseTo(270, 1);
  });

  it('hides every arrow when there is no line to sit on', () => {
    const arrows = arrowPlacements([], CLOSE, 8);

    expect(arrows.every((arrow) => !arrow.visible)).toBe(true);
  });

  /**
   * Outside route mode there is no line, and the pool still exists. A hidden
   * arrow needs a coordinate MapKit can project, not a real place.
   */
  it('gives a hidden arrow a coordinate anyway', () => {
    const [arrow] = arrowPlacements([], CLOSE, 1);

    expect(Number.isFinite(arrow?.at.lat)).toBe(true);
    expect(Number.isFinite(arrow?.at.lon)).toBe(true);
  });

  it('hides every arrow when the line is nowhere near the camera', () => {
    const elsewhere: Region = { ...CLOSE, latitude: 21.6, longitude: -158.0 };

    expect(arrowPlacements(EASTWARD, elsewhere, 8).every((a) => !a.visible)).toBe(true);
  });

  /**
   * **Spacing follows the visible stretch, which is what density-by-zoom is
   * actually for.** Zoomed out the arrows span the route; zoomed in they span
   * the few blocks on screen — same eight markers, and the spacing looks even
   * either way.
   */
  it('redistributes along the stretch the camera can see', () => {
    const long: Coords[] = Array.from({ length: 41 }, (_, i) => ({
      lat: 21.3069,
      lon: -157.9 + i * 0.002,
    }));

    const wide = arrowPlacements(long, WIDE, 4);
    const close = arrowPlacements(long, CLOSE, 4);

    const spread = (arrows: readonly { at: Coords }[]) => {
      const lons = arrows.map((a) => a.at.lon);
      return Math.max(...lons) - Math.min(...lons);
    };

    expect(spread(close)).toBeLessThan(spread(wide));
  });

  it('spaces them evenly along a straight visible line', () => {
    const arrows = arrowPlacements(EASTWARD, CLOSE, 4);
    const gaps = arrows
      .slice(1)
      .map((arrow, index) => arrow.at.lon - (arrows[index]?.at.lon ?? 0));

    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, 6);
  });

  /**
   * Half-steps, so no arrow lands on the very end of the visible stretch —
   * where half the glyph would be off screen and the last one would sit on the
   * terminus pin.
   */
  it('keeps the first and last arrows off the ends', () => {
    const arrows = arrowPlacements(EASTWARD, CLOSE, 4);
    const first = arrows[0]?.at.lon ?? 0;
    const last = arrows[arrows.length - 1]?.at.lon ?? 0;

    expect(first).toBeGreaterThan(-157.8623);
    expect(last).toBeLessThan(-157.8543);
  });

  /**
   * The feed's thinned shapes contain repeated points. Dividing by a
   * zero-length segment would put an arrow at NaN, which MapKit is handed.
   */
  it('survives a line that repeats a point', () => {
    const doubled: Coords[] = [
      { lat: 21.3069, lon: -157.8623 },
      { lat: 21.3069, lon: -157.8623 },
      { lat: 21.3069, lon: -157.8543 },
    ];

    for (const arrow of arrowPlacements(doubled, CLOSE, 4)) {
      expect(Number.isFinite(arrow.at.lat)).toBe(true);
      expect(Number.isFinite(arrow.bearingDeg)).toBe(true);
    }
  });

  it('asks for none and gets none', () => {
    expect(arrowPlacements(EASTWARD, CLOSE, 0)).toEqual([]);
  });
});
