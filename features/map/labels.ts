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
 * Two rules, in order:
 *
 * 1. **Zoomed far enough out, nothing is labelled but the selection.** Past
 *    `MAX_SPAN_FOR_LABELS` the tiles are already touching and no amount of
 *    culling produces a readable map.
 * 2. **Otherwise, greedily, in priority order** — the selected stop first, then
 *    nearest first — a stop keeps its label if the label's box clears every box
 *    already accepted. Greedy because the alternative is an optimisation
 *    problem to place text on a map, and nearest-first is the order a rider
 *    cares about anyway.
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
/** Vertical distance from the stop's coordinate down to the label's top edge. */
const LABEL_OFFSET = 20;
/** Breathing room, so two accepted labels are not merely not-overlapping. */
const MARGIN = 4;

type Box = { left: number; right: number; top: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export type Viewport = { width: number; height: number };

/**
 * The ids whose labels should be drawn. Everything not in the set renders as a
 * tile alone.
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
): Set<string> {
  const kept = new Set<string>();
  if (selectedId !== null) kept.add(selectedId);

  if (region === null || viewport.width <= 0 || viewport.height <= 0) return kept;
  if (region.longitudeDelta > MAX_SPAN_FOR_LABELS) return kept;

  const pointsPerDegreeX = viewport.width / region.longitudeDelta;
  const pointsPerDegreeY = viewport.height / region.latitudeDelta;

  const boxFor = (stop: StopWithDistance): Box => {
    // Screen position of the stop itself. Latitude grows upward and y grows
    // downward, hence the flip.
    const x = viewport.width / 2 + (stop.lon - region.longitude) * pointsPerDegreeX;
    const y = viewport.height / 2 - (stop.lat - region.latitude) * pointsPerDegreeY;

    return {
      left: x - LABEL_WIDTH / 2 - MARGIN,
      right: x + LABEL_WIDTH / 2 + MARGIN,
      top: y + LABEL_OFFSET - MARGIN,
      bottom: y + LABEL_OFFSET + LABEL_HEIGHT + MARGIN,
    };
  };

  // The selected stop is placed first and unconditionally: a rider who just
  // tapped a pin must see which one they tapped, even in a crowd.
  const ordered = [...stops].sort((a, b) => {
    if (a.stop_id === selectedId) return -1;
    if (b.stop_id === selectedId) return 1;
    return a.meters - b.meters;
  });

  const placed: Box[] = [];
  for (const stop of ordered) {
    const box = boxFor(stop);
    if (placed.some((other) => overlaps(box, other))) continue;
    placed.push(box);
    kept.add(stop.stop_id);
  }

  return kept;
}
