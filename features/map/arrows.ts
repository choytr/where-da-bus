import { metersBetween, type Coords } from '../../lib/distance';

/**
 * Where to put the arrowheads that say which way the route line runs.
 *
 * **`MapPolylineProps` has no arrow support.** It carries `lineDashPattern` and
 * `lineDashPhase` and nothing else about how the stroke is decorated — checked,
 * not assumed — so the arrows are markers, and markers inside `MapView` is the
 * seam with the open SIGABRT behind it.
 *
 * That constraint is what shapes this module. **A fixed pool of arrows is
 * mounted once for the life of the map**, so nothing ever mounts, unmounts or
 * reorders inside `MapView`. The alternative — one marker per segment — would
 * be a wholesale swap on every direction flip, straight into that seam.
 *
 * **They are placed on the *line*, not on the screen, and that is the whole
 * design now.** The first version spread them along whatever stretch the camera
 * could see, which meant every pan and every zoom moved all of them at once:
 *
 * > "is it possible to just draw one set of arrows instead of refreshing it
 * > after each map interaction? It's very annoying."
 *
 * So spacing is a distance along the road and nothing else. An arrow sits at
 * the same point on the same street whatever the camera does, the placements
 * are recomputed only when the *line* changes, and panning moves nothing. The
 * cost is that they are no longer denser when zoomed in — which is exactly the
 * behaviour that was annoying.
 */

export type ArrowPlacement = {
  /** Where the arrowhead sits. Meaningless when `visible` is false. */
  readonly at: Coords;
  /** Compass bearing of the line at that point, degrees clockwise from north. */
  readonly bearingDeg: number;
  /** False for a pool slot this line is too short to use. */
  readonly visible: boolean;
};

/**
 * Where an unused arrow sits: far out to sea, and **fixed**.
 *
 * It was the camera's center, which stacked every hidden marker under the
 * middle of the screen and rewrote their coordinates on every pan. If a 16 pt
 * frame turns out to take a tap a pin wanted, the middle of the screen is the
 * worst possible place for it to be.
 */
const PARKED: Coords = { lat: 19.5, lon: -160.5 };

/**
 * How far apart the arrowheads sit along the road, in metres.
 *
 * A judgement, not a measurement: close enough that one is in view on a
 * street-scale screen, far enough apart not to read as a dashed line. It is the
 * one number to turn if they feel too sparse or too busy.
 */
export const ARROW_SPACING_METERS = 500;

/**
 * Bearing from `from` to `to`, degrees clockwise from north.
 *
 * The great-circle formula rather than `atan2(Δlat, Δlon)`, which is off by the
 * cosine of the latitude — about 7% at Oahu's 21°N, and visibly wrong on an
 * east-west street.
 */
export function bearingBetween(from: Coords, to: Coords): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const φ1 = toRadians(from.lat);
  const φ2 = toRadians(to.lat);
  const Δλ = toRadians(to.lon - from.lon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

type Piece = { from: Coords; to: Coords; meters: number; startsAt: number };

/** The line cut into segments, each carrying how far along it starts. */
function walkable(line: readonly Coords[]): Piece[] {
  const pieces: Piece[] = [];
  let running = 0;

  for (let i = 0; i + 1 < line.length; i += 1) {
    const from = line[i];
    const to = line[i + 1];
    if (from === undefined || to === undefined) continue;

    const meters = metersBetween(from, to);
    // A repeated point is not a direction, and dividing by its length would be
    // dividing by zero. The feed's thinned shapes do contain them.
    if (meters === 0) continue;

    pieces.push({ from, to, meters, startsAt: running });
    running += meters;
  }

  return pieces;
}

/** The point `meters` along the line, and the bearing of the piece it lands on. */
function walk(pieces: readonly Piece[], meters: number): ArrowPlacement | null {
  for (const piece of pieces) {
    const into = meters - piece.startsAt;
    if (into > piece.meters) continue;
    const fraction = into / piece.meters;
    return {
      at: {
        lat: piece.from.lat + (piece.to.lat - piece.from.lat) * fraction,
        lon: piece.from.lon + (piece.to.lon - piece.from.lon) * fraction,
      },
      bearingDeg: bearingBetween(piece.from, piece.to),
      visible: true,
    };
  }
  return null;
}

/**
 * `count` arrowheads along `line`, evenly spaced by distance travelled.
 *
 * Always exactly `count` entries, in a stable order, because the caller mounts
 * exactly that many markers once and never again. A line too short to use them
 * all leaves the rest `visible: false` and parked; a line long enough to want
 * more than `count` gets them spread wider instead, so the far end is never
 * left unmarked.
 *
 * The first sits half a spacing in, so an arrowhead never lands exactly on the
 * terminus pin.
 */
export function arrowPlacements(
  line: readonly Coords[],
  count: number,
  spacingMeters = ARROW_SPACING_METERS,
): readonly ArrowPlacement[] {
  const hidden: ArrowPlacement = { at: PARKED, bearingDeg: 0, visible: false };
  if (count <= 0) return [];

  const pieces = walkable(line);
  const total = pieces.reduce((sum, piece) => sum + piece.meters, 0);
  if (total === 0) return Array.from({ length: count }, () => hidden);

  // Widened rather than truncated when the route outruns the pool: an arrow
  // every 500 m for the first 16 km and none after would read as the line
  // ending.
  const spacing = Math.max(spacingMeters, total / count);

  return Array.from({ length: count }, (_, index) => {
    const along = spacing * (index + 0.5);
    return along > total ? hidden : (walk(pieces, along) ?? hidden);
  });
}
