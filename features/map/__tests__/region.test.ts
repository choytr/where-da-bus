import {
  centeredOn,
  hasDriftedFrom,
  panScreensBetween,
  regionAround,
  visibleCenter,
  visibleWidthMetres,
  type Region,
} from '../region';
import { metersBetween } from '../../../lib/distance';

const HONOLULU = { lat: 21.3069, lon: -157.8583 };

describe('regionAround', () => {
  it('centers on the anchor', () => {
    const region = regionAround(HONOLULU, 1500);
    expect(region.latitude).toBe(HONOLULU.lat);
    expect(region.longitude).toBe(HONOLULU.lon);
  });

  it('contains the whole query radius on the north-south axis', () => {
    const region = regionAround(HONOLULU, 1500);
    const northEdge = { lat: HONOLULU.lat + region.latitudeDelta / 2, lon: HONOLULU.lon };

    expect(metersBetween(HONOLULU, northEdge)).toBeGreaterThan(1500);
  });

  it('contains the whole query radius on the east-west axis too', () => {
    // The one that breaks if the cosine correction is dropped: a degree of
    // longitude is ~7% shorter than a degree of latitude at Oahu's latitude.
    const region = regionAround(HONOLULU, 1500);
    const eastEdge = { lat: HONOLULU.lat, lon: HONOLULU.lon + region.longitudeDelta / 2 };

    expect(metersBetween(HONOLULU, eastEdge)).toBeGreaterThan(1500);
  });

  it('frames the radius closely rather than pulling far back', () => {
    // Both edges are inside 2 km for a 1.5 km query, so this is a walking-scale
    // view. The bare map in task 7 used 0.35 degrees — roughly 39 km, the whole
    // island — which is the failure this guards against.
    const region = regionAround(HONOLULU, 1500);
    const northEdge = { lat: HONOLULU.lat + region.latitudeDelta / 2, lon: HONOLULU.lon };
    const eastEdge = { lat: HONOLULU.lat, lon: HONOLULU.lon + region.longitudeDelta / 2 };

    expect(metersBetween(HONOLULU, northEdge)).toBeLessThan(2000);
    expect(metersBetween(HONOLULU, eastEdge)).toBeLessThan(2000);
    expect(region.latitudeDelta).toBeLessThan(0.05);
  });

  it('is wider east-west than north-south, in degrees', () => {
    const region = regionAround(HONOLULU, 1500);
    expect(region.longitudeDelta).toBeGreaterThan(region.latitudeDelta);
  });

  it('scales with the radius it is given', () => {
    const small = regionAround(HONOLULU, 500);
    const large = regionAround(HONOLULU, 2000);
    expect(large.latitudeDelta / small.latitudeDelta).toBeCloseTo(4, 5);
  });

  it('does not divide by zero at the pole', () => {
    const region = regionAround({ lat: 90, lon: 0 }, 1500);
    expect(Number.isFinite(region.longitudeDelta)).toBe(true);
  });

  it('is unchanged when nothing is covered', () => {
    // The default, and the mount case: a fraction of 1 must be the same window
    // the map framed before a sheet existed.
    expect(regionAround(HONOLULU, 1500, 1)).toEqual(regionAround(HONOLULU, 1500));
  });

  it('frames the radius above the sheet when part of the screen is covered', () => {
    // The medium detent: 45% of the screen is sheet, 55% is map.
    const covered = regionAround(HONOLULU, 1500, 0.55);

    // The center goes south, because the visible strip is the top of the window.
    expect(covered.latitude).toBeLessThan(HONOLULU.lat);

    // And the anchor comes out in the middle of that strip, not the window.
    const stripNorth = covered.latitude + covered.latitudeDelta / 2;
    const stripSouth = stripNorth - 0.55 * covered.latitudeDelta;
    expect((stripNorth + stripSouth) / 2).toBeCloseTo(HONOLULU.lat, 9);

    // With the whole 1.5 km radius inside it.
    expect(metersBetween(HONOLULU, { lat: stripSouth, lon: HONOLULU.lon })).toBeGreaterThan(1500);
    expect(metersBetween(HONOLULU, { lat: stripNorth, lon: HONOLULU.lon })).toBeGreaterThan(1500);
  });

  it('does not open an infinite window when the sheet covers everything', () => {
    const region = regionAround(HONOLULU, 1500, 0);
    expect(Number.isFinite(region.latitudeDelta)).toBe(true);
  });
});

describe('hasDriftedFrom', () => {
  /** A window framing the 1.5 km query, which is what the map opens on. */
  const framing = regionAround(HONOLULU, 1500);

  const north = (metres: number) => ({
    ...framing,
    latitude: HONOLULU.lat + metres / 111_320,
  });

  it('is false while the camera is still over its anchor', () => {
    expect(hasDriftedFrom(HONOLULU, framing, 0.25)).toBe(false);
  });

  it('is false for a nudge', () => {
    // Well inside a quarter of a ~3.4 km window.
    expect(hasDriftedFrom(HONOLULU, north(200), 0.25)).toBe(false);
  });

  it('is true once the center passes the fraction of the visible width', () => {
    const quarter = visibleWidthMetres(framing) * 0.25;

    expect(hasDriftedFrom(HONOLULU, north(quarter * 0.9), 0.25)).toBe(false);
    expect(hasDriftedFrom(HONOLULU, north(quarter * 1.1), 0.25)).toBe(true);
  });

  it('is false for the very window regionAround just produced', () => {
    // The one that catches the off-by-a-sheet. `regionAround` centers the
    // *window* well south of the anchor so the radius lands above the sheet,
    // so measuring drift from `camera.latitude` marks a map as drifted the
    // instant it is framed — and offers to re-search what it is already
    // showing. At the medium detent that offset is about 1.4 km.
    const framed = regionAround(HONOLULU, 1500, 0.55);

    expect(hasDriftedFrom(HONOLULU, framed, 0.25, 0.55)).toBe(false);
    expect(metersBetween(HONOLULU, visibleCenter(framed, 0.55))).toBeCloseTo(0, 6);
  });

  it('means the same thing at every zoom', () => {
    // The reason this is a fraction and not a distance: 400 m is most of a
    // street-level screen and a rounding error on a city-wide one.
    const street = regionAround(HONOLULU, 300);
    const city = regionAround(HONOLULU, 6000);
    const moved = { lat: HONOLULU.lat + 400 / 111_320, lon: HONOLULU.lon };

    expect(hasDriftedFrom(HONOLULU, { ...street, ...{ latitude: moved.lat } }, 0.25)).toBe(true);
    expect(hasDriftedFrom(HONOLULU, { ...city, ...{ latitude: moved.lat } }, 0.25)).toBe(false);
  });
});

describe('centeredOn', () => {
  /** A rider who has zoomed well past the query radius, down to a street. */
  const zoomedIn = { latitude: 21.3069, longitude: -157.8583, latitudeDelta: 0.004, longitudeDelta: 0.004 };
  const target = { lat: 21.29, lon: -157.84 };

  it('keeps the zoom the rider chose', () => {
    // The bug this exists for: a long-press search rebuilt the window from the
    // 1.5 km radius and threw away a zoom the rider had set deliberately.
    const moved = centeredOn(zoomedIn, target, 0.55);

    expect(moved.latitudeDelta).toBe(zoomedIn.latitudeDelta);
    expect(moved.longitudeDelta).toBe(zoomedIn.longitudeDelta);
  });

  it('puts the target in the middle of what the rider can see', () => {
    const moved = centeredOn(zoomedIn, target, 0.55);

    expect(visibleCenter(moved, 0.55).lat).toBeCloseTo(target.lat, 9);
    expect(visibleCenter(moved, 0.55).lon).toBeCloseTo(target.lon, 9);
  });

  it('is the inverse of visibleCenter at any coverage', () => {
    for (const fraction of [1, 0.86, 0.55, 0.1]) {
      const seen = visibleCenter(centeredOn(zoomedIn, target, fraction), fraction);
      expect(seen.lat).toBeCloseTo(target.lat, 9);
    }
  });

  it('moves the window south of the target when a sheet covers the bottom', () => {
    expect(centeredOn(zoomedIn, target, 0.55).latitude).toBeLessThan(target.lat);
    // And not at all when nothing is covered.
    expect(centeredOn(zoomedIn, target, 1).latitude).toBe(target.lat);
  });
});

describe('visibleWidthMetres', () => {
  it('is the ground distance between the left and right edges', () => {
    const region = regionAround(HONOLULU, 1500);
    const west = { lat: HONOLULU.lat, lon: HONOLULU.lon - region.longitudeDelta / 2 };
    const east = { lat: HONOLULU.lat, lon: HONOLULU.lon + region.longitudeDelta / 2 };

    // Within 1%: this is flat-earth arithmetic against a great circle, and the
    // gap between them at a 3 km span is four metres.
    const great = metersBetween(west, east);
    expect(Math.abs(visibleWidthMetres(region) - great) / great).toBeLessThan(0.01);
  });
});

/**
 * *Search this area* is earned two ways, and this is the second: **distance
 * travelled**, not distance from the anchor. Judging on displacement alone
 * meant a rider nudging the map around one neighbourhood — the exact gesture
 * for looking at somewhere properly — never got the offer however long they
 * spent on it.
 */
describe('panScreensBetween', () => {
  const at = (lat: number, lon: number, delta = 0.01): Region => ({
    latitude: lat,
    longitude: lon,
    latitudeDelta: delta,
    longitudeDelta: delta,
  });

  it('is zero for a camera that did not move', () => {
    expect(panScreensBetween(at(21.3, -157.85), at(21.3, -157.85))).toBe(0);
  });

  it('counts about one screen for a pan of one screen', () => {
    const from = at(21.3, -157.85);
    const across = visibleWidthMetres(from);
    // A step of one screen's width, expressed back in degrees of longitude.
    const step = across / (111_320 * Math.cos((21.3 * Math.PI) / 180));

    expect(panScreensBetween(from, at(21.3, -157.85 + step))).toBeCloseTo(1, 1);
  });

  /**
   * The point of measuring travel rather than displacement: a wiggle that ends
   * where it started still adds up.
   */
  it('adds up over a wander that returns to where it began', () => {
    const home = at(21.3, -157.85);
    const away = at(21.3, -157.84);

    const there = panScreensBetween(home, away);
    const back = panScreensBetween(away, home);

    expect(there).toBeGreaterThan(0);
    expect(there + back).toBeCloseTo(there * 2, 5);
  });

  /** A zoom out must not dilute the pan that came with it. */
  it('measures against the narrower of the two windows', () => {
    const close = at(21.3, -157.85, 0.004);
    const wide = at(21.3, -157.84, 0.05);

    expect(panScreensBetween(close, wide)).toBeGreaterThan(panScreensBetween(wide, close) * 0.99);
    expect(panScreensBetween(close, wide)).toBeCloseTo(panScreensBetween(wide, close), 5);
  });

  it('survives a degenerate window rather than dividing by it', () => {
    const flat = { latitude: 21.3, longitude: -157.85, latitudeDelta: 0, longitudeDelta: 0 };

    expect(panScreensBetween(flat, flat)).toBe(0);
  });
});
