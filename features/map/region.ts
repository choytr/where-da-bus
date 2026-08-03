import { metersBetween, type Coords } from '../../lib/distance';

/**
 * How far the camera should be pulled back, derived from how far the query
 * reaches rather than picked by eye.
 *
 * The nearby query looks 1.5 km out. A camera showing less than that hides
 * stops that are in the list under it; a camera showing much more — the whole
 * island, which is what the bare map in task 7 did — is a view of nothing in
 * particular, at a zoom where no street is legible and every pin overlaps.
 * Tying the two together means the map always frames exactly the set of stops
 * it is showing, and keeps doing so if the radius is ever changed.
 */

/** Metres per degree of latitude. Constant enough anywhere on Earth for this. */
const METRES_PER_DEGREE_LAT = 111_320;

/**
 * A little wider than the query itself, so stops at the far edge of the radius
 * sit inside the frame rather than exactly on it.
 */
const PADDING = 1.15;

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/**
 * A camera window whose *visible* part contains a circle of `radiusMetres`
 * around `center`.
 *
 * Longitude degrees shrink towards the poles, so the east-west span is divided
 * by cos(latitude) to cover the same ground distance as the north-south one.
 * At Oahu's 21°N that is about an 8% widening — small, but the alternative is
 * a window that is subtly narrower than the query on one axis only.
 *
 * `visibleFraction` is how much of the screen's height is not under the sheet.
 * The window is widened by that fraction and its centre pushed *south*, so
 * what a rider can actually see is the radius rather than a circle half hidden
 * behind a bottom sheet. This is arithmetic on purpose. `mapPadding` looks
 * like the built-in way to do it and is not: on Apple Maps `AIRMap.m:645`
 * assigns it to `layoutMargins`, which moves the compass and the legal label
 * and never reaches MapKit's own `setVisibleMapRect:edgePadding:`. Doing it
 * here cannot be wrong about MapKit, because it never asks MapKit anything.
 */
export function regionAround(
  center: Coords,
  radiusMetres: number,
  visibleFraction = 1,
): Region {
  const spanMetres = radiusMetres * 2 * PADDING;
  const framingDelta = spanMetres / METRES_PER_DEGREE_LAT;

  // Guarded so a sheet covering the whole screen cannot ask for an infinite
  // window; at that point there is nothing to frame anyway.
  const visible = Math.min(Math.max(visibleFraction, 0.1), 1);
  const latitudeDelta = framingDelta / visible;

  // The visible strip's centre sits (1 - visible) / 2 of the window's height
  // above the window's own centre, so the centre goes that far south.
  const shift = ((1 - visible) / 2) * latitudeDelta;

  return {
    latitude: center.lat - shift,
    longitude: center.lon,
    latitudeDelta,
    longitudeDelta: framingDelta / cosLatitude(center.lat),
  };
}

/**
 * How far apart the left and right edges of a camera window are, on the ground.
 *
 * A degree of longitude is a degree of latitude shrunk by cos(latitude), so
 * this is the east-west span converted back into metres.
 */
export function visibleWidthMetres(camera: Region): number {
  return camera.longitudeDelta * cosLatitude(camera.latitude) * METRES_PER_DEGREE_LAT;
}

/**
 * The point in the middle of the part of the map a rider can actually see.
 *
 * Not `camera.latitude`. `regionAround` pushes the window's centre south so the
 * radius lands above the sheet, which means the window's centre is under the
 * sheet by construction — up to 1.4 km from the anchor at the medium detent.
 * Anything reasoning about "where the rider is looking" has to undo that first,
 * or the map is judged to have drifted the instant it is framed.
 */
export function visibleCentre(camera: Region, visibleFraction = 1): Coords {
  const shift = ((1 - visibleFraction) / 2) * camera.latitudeDelta;
  return { lat: camera.latitude + shift, lon: camera.longitude };
}

/**
 * Has the camera been carried far enough from the anchor that the stops on
 * screen are no longer about what is on screen?
 *
 * Measured as a fraction of the *visible width* rather than as a fixed
 * distance, so it means the same thing at every zoom: a quarter of a screen is
 * a quarter of a screen whether that screen is 300 m or 3 km across. A fixed
 * distance would offer to re-search after a nudge at city zoom and never offer
 * at all down a street.
 */
export function hasDriftedFrom(
  anchor: Coords,
  camera: Region,
  fraction: number,
  visibleFraction = 1,
): boolean {
  const away = metersBetween(anchor, visibleCentre(camera, visibleFraction));
  return away > visibleWidthMetres(camera) * fraction;
}

/**
 * Guarded against a degenerate cosine. Oahu is nowhere near a pole, but a zero
 * here would produce Infinity and a map showing nothing at all.
 */
function cosLatitude(latitude: number): number {
  return Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
}
