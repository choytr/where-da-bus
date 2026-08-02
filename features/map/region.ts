import type { Coords } from '../../lib/distance';

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
 * A camera window centred on `center` that contains a circle of `radiusMetres`.
 *
 * Longitude degrees shrink towards the poles, so the east-west span is divided
 * by cos(latitude) to cover the same ground distance as the north-south one.
 * At Oahu's 21°N that is about an 8% widening — small, but the alternative is
 * a window that is subtly narrower than the query on one axis only.
 */
export function regionAround(center: Coords, radiusMetres: number): Region {
  const spanMetres = radiusMetres * 2 * PADDING;
  const latitudeDelta = spanMetres / METRES_PER_DEGREE_LAT;

  // Guarded against a degenerate cosine. Oahu is nowhere near a pole, but a
  // zero here would produce Infinity and a map showing nothing at all.
  const shrink = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);

  return {
    latitude: center.lat,
    longitude: center.lon,
    latitudeDelta,
    longitudeDelta: latitudeDelta / shrink,
  };
}
