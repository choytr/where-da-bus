import { metersBetween, type Coords } from '../../lib/distance';
import type { Region } from './region';

/**
 * Where to put the arrowheads that say which way the route line runs.
 *
 * **`MapPolylineProps` has no arrow support.** It carries `lineDashPattern` and
 * `lineDashPhase` and nothing else about how the stroke is decorated — checked,
 * not assumed — so the arrows are markers, and markers inside `MapView` is the
 * seam with the open SIGABRT behind it.
 *
 * That constraint is what shapes this module. **A fixed pool of arrows is
 * mounted once for the life of the map and redistributed**, so nothing ever
 * mounts, unmounts or reorders inside `MapView` when the camera moves or the
 * route changes. The alternative — one marker per segment — would be a
 * wholesale swap on every direction flip, straight into that seam. It is the
 * same trick `RouteLine` uses (always mounted, only coordinates change) and
 * that the bus labels use (always mounted, hidden with opacity).
 *
 * So this always returns exactly `count` placements. When there is no line, or
 * none of it is on screen, they are all `visible: false` and the markers draw
 * at opacity zero rather than leaving the map.
 *
 * Spacing is by **arc length along the visible stretch**, not by segment, which
 * is what keeps the arrows looking evenly spaced at every zoom while their
 * number never changes. Zoomed out to the whole route, eight arrows span the
 * route; zoomed into three blocks, the same eight span three blocks.
 */

export type ArrowPlacement = {
  /** Where the arrowhead sits. Meaningless when `visible` is false. */
  readonly at: Coords;
  /** Compass bearing of the line at that point, degrees clockwise from north. */
  readonly bearingDeg: number;
  /** False when there was no line under this arrow; the marker hides itself. */
  readonly visible: boolean;
};

/**
 * Where a hidden arrow sits: far out to sea, and **fixed**.
 *
 * It was the camera's center, which meant that outside route mode — the common
 * case — all eight invisible 16 pt markers stacked up under the middle of the
 * screen, and had their coordinates rewritten on every camera settle. If a
 * marker's frame turns out to take a tap the pin under it wanted, the middle of
 * the screen is the worst possible place for that to be true.
 */
const PARKED: Coords = { lat: 19.5, lon: -160.5 };

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

type Span = { minLat: number; maxLat: number; minLon: number; maxLon: number };

function boxOf(region: Region): Span {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLon: region.longitude - region.longitudeDelta / 2,
    maxLon: region.longitude + region.longitudeDelta / 2,
  };
}

/**
 * Whether a segment could be on screen at all.
 *
 * The segment's own bounding box against the camera's, which is generous — a
 * diagonal segment passing near a corner is kept when it does not quite cross.
 * Being generous is the right way to be wrong here: an arrow slightly off the
 * visible stretch is invisible, while a missing one leaves a gap in an
 * otherwise even row.
 */
function couldBeVisible(from: Coords, to: Coords, box: Span): boolean {
  return (
    Math.max(from.lat, to.lat) >= box.minLat &&
    Math.min(from.lat, to.lat) <= box.maxLat &&
    Math.max(from.lon, to.lon) >= box.minLon &&
    Math.min(from.lon, to.lon) <= box.maxLon
  );
}

type Piece = { from: Coords; to: Coords; meters: number; startsAt: number };

/** The stretch of `line` the camera can see, cut into segments with running length. */
function visibleStretch(line: readonly Coords[], region: Region): Piece[] {
  const box = boxOf(region);
  const pieces: Piece[] = [];
  let running = 0;

  for (let i = 0; i + 1 < line.length; i += 1) {
    const from = line[i];
    const to = line[i + 1];
    if (from === undefined || to === undefined) continue;
    if (!couldBeVisible(from, to, box)) continue;

    const meters = metersBetween(from, to);
    // A repeated point is not a direction, and dividing by its length would be
    // dividing by zero. The feed's thinned shapes do contain them.
    if (meters === 0) continue;

    pieces.push({ from, to, meters, startsAt: running });
    running += meters;
  }

  return pieces;
}

/** The point `meters` along the stretch, and the bearing of the piece it lands on. */
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
 * `count` arrowheads spread along whatever of `line` is inside `visible`.
 *
 * Always exactly `count`, in a stable order, because the caller mounts exactly
 * that many markers once and never again.
 *
 * They sit at the half-steps — 1/16, 3/16, … for eight — rather than at 0, 1/8,
 * … so none of them lands on the very end of the visible stretch, where half
 * the glyph would be off screen and the last one would sit on top of the
 * terminus pin.
 */
export function arrowPlacements(
  line: readonly Coords[],
  visible: Region,
  count: number,
): readonly ArrowPlacement[] {
  const hidden: ArrowPlacement = { at: PARKED, bearingDeg: 0, visible: false };
  if (count <= 0) return [];

  const pieces = visibleStretch(line, visible);
  const total = pieces.reduce((sum, piece) => sum + piece.meters, 0);
  if (total === 0) return Array.from({ length: count }, () => hidden);

  return Array.from({ length: count }, (_, index) => {
    const along = (total * (index * 2 + 1)) / (count * 2);
    return walk(pieces, along) ?? hidden;
  });
}
