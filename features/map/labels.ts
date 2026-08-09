import type { Region } from './region';
import type { StopWithDistance } from '../../data/gtfs/types';

/**
 * Which stops get their name written on the map, and which are a bare tile.
 *
 * **Labelling every stop does not work**, which took one device round to
 * establish: `IMG_4479`, 2026-08-08, is twenty overlapping names in a heap over
 * Kalihi, unreadable and — Truman's word — awful. Apple and Google both label a
 * minority of the pins they draw. Apple clusters and writes `+3 more`; Google
 * simply drops the labels that would collide and keeps the pin. This does the
 * Google thing, because it needs no clustering and never moves a pin away from
 * the stop it marks.
 *
 * The rules, in order:
 *
 * 1. **Zoomed far enough out, nothing is labelled but the selection.** Past
 *    `MAX_SPAN_FOR_LABELS` the tiles are already touching and no amount of
 *    culling produces a readable map.
 * 2. **Otherwise, greedily, in priority order** — the selected stop first, then
 *    nearest first — a stop keeps its label if the box clears everything
 *    claimed so far. Greedy because the alternative is an optimisation problem
 *    to place text on a map, and nearest-first is the order a rider cares about
 *    anyway.
 * 3. **Every tile is an obstacle, not just every label.** The first version
 *    only checked labels against other labels, and `IMG_4527` is the result:
 *    names running underneath other stops' icons, half-legible. A tile is
 *    opaque and cannot move, so it is claimed up front — all of them, including
 *    stops that will never get a label.
 * 4. **A label may sit above its tile if it cannot sit below.** Doubles the
 *    chances of placing one in a crowd, which is what both reference apps do,
 *    and costs one style branch in `StopMarker`.
 * 5. **At most `MAX_LABELS`.** Collision rules alone still allowed a dozen
 *    names on a busy screen; Truman's word was "dense". A cap is a blunter
 *    instrument than the geometry and it is the one that makes the map calm.
 *
 * It is a pure function of the stop set, the camera and the viewport, so it is
 * tested as arithmetic rather than through a map that Jest cannot render. It is
 * recomputed only when the camera **settles**, never during a pan: a marker
 * whose view changes has to be re-snapshotted by iOS, and doing that to twenty
 * markers per frame is how a map becomes unusable.
 */

/**
 * Widest camera, in degrees of longitude, that still gets labels. Roughly a
 * 2 km window on Oahu — about the point where the query radius fills the screen
 * and the tiles start touching.
 */
const MAX_SPAN_FOR_LABELS = 0.022;

/** The label's box, matching `StopMarker`'s own geometry. */
const LABEL_WIDTH = 124;
const LABEL_HEIGHT = 28;
/** The tile's box, likewise. Square, centred on the stop's coordinate. */
const TILE_SIZE = 34;
/** Distance from the coordinate to the near edge of the label, either way up. */
const LABEL_OFFSET = 20;
/** Breathing room, so two accepted boxes are not merely not-overlapping. */
const MARGIN = 4;

/**
 * How many names the map will carry at once, however much room there is.
 *
 * The geometry alone still produced a dozen on a busy screen — legible
 * individually, and collectively the thing Truman called dense. Apple's own map
 * of the same neighbourhood carries about this many.
 */
const MAX_LABELS = 6;

type Box = { left: number; right: number; top: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export type Viewport = {
  width: number;
  /**
   * The **whole** map view, which is the full window: the map runs under the
   * status bar and behind the sheet on purpose. The camera's region spans this,
   * so this is what the projection divides by.
   *
   * It was the height *above the sheet* for one build, and that was simply
   * wrong. Every stop separation came out short by the sheet's fraction, so
   * boxes that were comfortably apart on screen were computed as touching —
   * which over-culled — while the skewed centre let genuine overlaps through.
   * Truman had both symptoms at once on 2026-08-08: "sometimes the labels do
   * overlap and sometimes it's really hard to get the labels to show up for the
   * stops I'm looking at."
   */
  height: number;
  /**
   * How much of that height is not under the sheet. Used only to skip stops a
   * rider cannot see — they would otherwise spend the `MAX_LABELS` budget on
   * names hidden behind the sheet, which is the other half of "hard to get the
   * labels to show up for the stops I'm looking at".
   */
  visibleHeight: number;
};

/** Which side of its tile a label sits on. */
export type LabelPlacement = 'below' | 'above';

/**
 * Where each stop's label goes, keyed by stop id. A stop absent from the map
 * renders as a tile alone.
 *
 * `region` is the camera as last settled, or null before the map has reported
 * one — in which case only the selection is labelled, since there is no way to
 * know yet what would collide.
 */
export function labelledStopIds(
  stops: readonly StopWithDistance[],
  region: Region | null,
  viewport: Viewport,
  selectedId: string | null,
): Map<string, LabelPlacement> {
  const placement = new Map<string, LabelPlacement>();
  // The selected stop is labelled first and unconditionally: a rider who just
  // tapped a pin must see which one they tapped, even in a crowd.
  if (selectedId !== null) placement.set(selectedId, 'below');

  if (region === null || viewport.width <= 0 || viewport.height <= 0) return placement;
  if (region.longitudeDelta > MAX_SPAN_FOR_LABELS) return placement;

  const pointsPerDegreeX = viewport.width / region.longitudeDelta;
  const pointsPerDegreeY = viewport.height / region.latitudeDelta;

  // Screen position of the stop itself. Latitude grows upward and y grows
  // downward, hence the flip.
  const pointFor = (stop: StopWithDistance) => ({
    x: viewport.width / 2 + (stop.lon - region.longitude) * pointsPerDegreeX,
    y: viewport.height / 2 - (stop.lat - region.latitude) * pointsPerDegreeY,
  });

  const tileBox = (stop: StopWithDistance): Box => {
    const { x, y } = pointFor(stop);
    return {
      left: x - TILE_SIZE / 2,
      right: x + TILE_SIZE / 2,
      top: y - TILE_SIZE / 2,
      bottom: y + TILE_SIZE / 2,
    };
  };

  const labelBox = (stop: StopWithDistance, side: LabelPlacement): Box => {
    const { x, y } = pointFor(stop);
    const top = side === 'below' ? y + LABEL_OFFSET : y - LABEL_OFFSET - LABEL_HEIGHT;
    return {
      left: x - LABEL_WIDTH / 2 - MARGIN,
      right: x + LABEL_WIDTH / 2 + MARGIN,
      top: top - MARGIN,
      bottom: top + LABEL_HEIGHT + MARGIN,
    };
  };

  // Tiles are claimed before any label is placed. They are opaque, they cannot
  // move, and every one of them is drawn whether or not it is named — including
  // the ones behind the sheet, which a label above them could still run into.
  const claimed: Box[] = stops.map(tileBox);

  // Each stop paired with *the very box* in `claimed`, so the loop below can
  // exclude a stop's own tile by identity and never has to look one up.
  const candidates = stops
    .map((stop, index) => ({ stop, tile: claimed[index] ?? tileBox(stop) }))
    // A stop behind the sheet is a stop nobody is reading, and it must not
    // spend the label budget on a name that cannot be seen.
    .filter(({ tile }) => tile.top < viewport.visibleHeight);

  const ordered = [...candidates].sort((a, b) => {
    if (a.stop.stop_id === selectedId) return -1;
    if (b.stop.stop_id === selectedId) return 1;
    return a.stop.meters - b.stop.meters;
  });

  // A label always overlaps its *own* tile — it is drawn hard against it — so
  // that one box is excluded by identity rather than by geometry.
  const free = (box: Box, own: Box) =>
    !claimed.some((other) => other !== own && overlaps(box, other));

  for (const { stop, tile } of ordered) {
    const forced = placement.get(stop.stop_id);
    if (forced === undefined && placement.size >= MAX_LABELS) continue;

    const side = (['below', 'above'] as const).find((candidate) =>
      free(labelBox(stop, candidate), tile),
    );

    // The selection keeps its label whatever collides, but still takes the
    // better side, and still reserves the space so later labels avoid it.
    const chosen = side ?? forced;
    if (chosen === undefined) continue;

    placement.set(stop.stop_id, chosen);
    claimed.push(labelBox(stop, chosen));
  }

  return placement;
}
