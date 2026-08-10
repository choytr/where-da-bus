import type { Region } from './region';
import type { StopWithDistance } from '../../data/gtfs/types';

/**
 * Which things on the map get a name written against them, and which are a bare
 * tile: stop names and bus fleet numbers, decided together against one screen.
 *
 * **Together is the point.** Buses had no part in this until 2026-08-09 and
 * always drew their label, so at the zoom where stop names were correctly
 * suppressed as hopeless, twelve fleet numbers were drawn over each other and
 * over the pins. `labelledMapIds` is the entry point; `labelledStopIds` is the
 * stop half of it, kept for the screens that have no bus layer.
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
 * 1. **Zoomed far enough out, nothing is labelled but what the rider just
 *    tapped.** Past `MAX_SPAN_FOR_LABELS` — which is `scaleOf`'s `'route'` — the
 *    tiles are already touching and no amount of culling produces a readable
 *    map.
 * 2. **Otherwise, greedily, in priority order** — buses before stops, the
 *    tapped one of each first, then stops nearest first — a thing keeps its
 *    label if the box clears everything claimed so far. Greedy because the
 *    alternative is an optimisation problem to place text on a map, and
 *    nearest-first is the order a rider cares about anyway. Buses lead because
 *    a stop's name can be had by tapping its pin and a fleet number cannot.
 * 3. **Every tile is an obstacle, not just every label** — and every tile of
 *    *both* layers. The first version only checked labels against other labels,
 *    and `IMG_4527` is the result: names running underneath other stops' icons,
 *    half-legible. A tile is opaque and cannot move, so it is claimed up front —
 *    all of them, including the ones that will never get a label.
 * 4. **A label may sit above its tile if it cannot sit below.** Doubles the
 *    chances of placing one in a crowd, which is what both reference apps do,
 *    and costs one style branch in `StopMarker`.
 * 5. **At most `MAX_LABELS` names and `MAX_BUS_LABELS` fleet numbers**, counted
 *    separately so one layer cannot starve the other. Collision rules alone
 *    still allowed a dozen names on a busy screen; Truman's word was "dense". A
 *    cap is a blunter instrument than the geometry and it is the one that makes
 *    the map calm.
 *
 * It is a pure function of the two sets, the camera and the viewport, so it is
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

/**
 * The two things the map draws differently, named once.
 *
 * `'street'` is a few blocks across: tiles are separate objects, names fit
 * between them, and the route line runs visibly through the gaps. `'route'` is
 * the whole route on screen, where none of that is true.
 */
export type MapScale = 'route' | 'street';

/**
 * Which of the two the camera is showing.
 *
 * **It reads `MAX_SPAN_FOR_LABELS` rather than declaring a threshold of its
 * own, and that is the point.** That constant already marks the span past which
 * the tiles are touching and no amount of culling produces a readable map — and
 * "the tiles are touching" is the whole reason the pins tier too. The span at
 * which names become hopeless and the span at which pins fuse are one fact
 * about one set of 34-point boxes, so they get one number. Two would drift the
 * first time either was tuned.
 *
 * This is the thing the 2026-08-09 screenshots showed: route mode at street
 * scale is legible and useful, and the same code at route scale is forty tiles
 * fused into a chain with the line invisible underneath it. Not two bugs — one
 * missing distinction.
 *
 * A null region — before the map has reported a camera — is `'route'`. Being
 * briefly too calm is a better first frame than being briefly fused.
 */
export function scaleOf(region: Region | null): MapScale {
  if (region === null) return 'route';
  return region.longitudeDelta > MAX_SPAN_FOR_LABELS ? 'route' : 'street';
}

/** The label's box, matching `StopMarker`'s own geometry. */
const LABEL_WIDTH = 124;
const LABEL_HEIGHT = 28;
/** The tile's box, likewise. Square, centered on the stop's coordinate. */
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
   * which over-culled — while the skewed center let genuine overlaps through.
   * Truman had both symptoms at once on 2026-08-08: "sometimes the labels do
   * overlap and sometimes it's really hard to get the labels to show up for the
   * stops I'm looking at."
   */
  height: number;
  /**
   * How much of that height is not under the sheet. With `width`, this is the
   * rectangle a rider can actually see, and only stops inside it compete for
   * the `MAX_LABELS` budget.
   *
   * The first version of this test looked at the bottom edge alone, which was
   * half a fix: stops off the *side* of the screen went on quietly taking
   * label slots, so a rider panning east from a dense block would find almost
   * nothing named. Truman, 2026-08-08, having guessed the mechanism from the
   * outside: "there are stops loaded on the left that have a bunch of labels.
   * Maybe those aren't being unloaded and are eating the labels count?"
   *
   * They are not unloaded, and should not be — the stop set belongs to the
   * anchor, not to the camera, which is `useAnchoredStops`' whole design. It is
   * the *labels* that are a property of what is on screen.
   */
  visibleHeight: number;
};

/** Which side of its tile a label sits on. */
export type LabelPlacement = 'below' | 'above';

/**
 * How many bus labels the map will carry at once.
 *
 * Smaller than `MAX_LABELS` because it is a smaller question. Route mode draws
 * about seven buses island-wide and rarely more than three or four in one
 * street-scale window, so this bites only on a depot or a bunched pair — which
 * is exactly where twelve overlapping strings came from on 2026-08-09.
 */
const MAX_BUS_LABELS = 4;

/** The geometry of one layer's boxes, so the placer does not know which layer it is. */
type Geometry = {
  /** The opaque square drawn at the coordinate — the marker's own wrapper view. */
  tile: number;
  labelWidth: number;
  labelHeight: number;
  /** Coordinate to the near edge of the label, either way up. */
  offset: number;
};

/** Both marker components wrap themselves in a 34-point box; see their `ANCHOR`s. */
const STOP_GEOMETRY: Geometry = {
  tile: TILE_SIZE,
  labelWidth: LABEL_WIDTH,
  labelHeight: LABEL_HEIGHT,
  offset: LABEL_OFFSET,
};

/** Wider and shorter than a stop's: one line holding a fleet number. */
const BUS_GEOMETRY: Geometry = {
  tile: TILE_SIZE,
  labelWidth: 150,
  labelHeight: 14,
  offset: LABEL_OFFSET,
};

/**
 * The tapped bus's popup, which is a different shape from every other label on
 * the map: narrower, and four lines tall.
 *
 * **The one variable-height box, and it has to be reserved at its full size.**
 * A popup that draws taller than it claimed would land on the names placed
 * around it. These numbers mirror `BusMarker`'s `DETAIL_*` constants — kept as
 * literals rather than imported, because this module is pure arithmetic tested
 * without React and importing a component would drag `react-native-maps` in
 * with it.
 */
const SELECTED_BUS_GEOMETRY: Geometry = {
  tile: TILE_SIZE,
  labelWidth: 132,
  labelHeight: 15 * 4 + 5 * 2,
  offset: LABEL_OFFSET,
};

/** Anything with a place on the map. The projection needs no more than this. */
type Positioned = { lat: number; lon: number };

/** Anything the map can write a name against. */
type Placeable = Positioned & { id: string };

/**
 * Screen geometry for one camera against one viewport, so the two layers cannot
 * project differently.
 */
function projectionFor(region: Region, viewport: Viewport) {
  const pointsPerDegreeX = viewport.width / region.longitudeDelta;
  const pointsPerDegreeY = viewport.height / region.latitudeDelta;

  // Latitude grows upward and y grows downward, hence the flip.
  const pointFor = (at: Positioned) => ({
    x: viewport.width / 2 + (at.lon - region.longitude) * pointsPerDegreeX,
    y: viewport.height / 2 - (at.lat - region.latitude) * pointsPerDegreeY,
  });

  const tileBox = (at: Positioned, geometry: Geometry): Box => {
    const { x, y } = pointFor(at);
    return {
      left: x - geometry.tile / 2,
      right: x + geometry.tile / 2,
      top: y - geometry.tile / 2,
      bottom: y + geometry.tile / 2,
    };
  };

  const labelBox = (at: Positioned, geometry: Geometry, side: LabelPlacement): Box => {
    const { x, y } = pointFor(at);
    const top =
      side === 'below'
        ? y + geometry.offset
        : y - geometry.offset - geometry.labelHeight;
    return {
      left: x - geometry.labelWidth / 2 - MARGIN,
      right: x + geometry.labelWidth / 2 + MARGIN,
      top: top - MARGIN,
      bottom: top + geometry.labelHeight + MARGIN,
    };
  };

  /** Overlaps the rectangle the rider can see, on both axes. */
  const onScreen = (box: Box) =>
    box.right > 0 &&
    box.left < viewport.width &&
    box.bottom > 0 &&
    box.top < viewport.visibleHeight;

  return { tileBox, labelBox, onScreen };
}

type Projection = ReturnType<typeof projectionFor>;

/**
 * Place one layer's labels into a collision map shared with every other layer.
 *
 * `items` arrive in priority order and `claimed` is **mutated**: obstacles go in
 * before the call, accepted label boxes come out of it. That is what lets two
 * layers compete for one screen rather than each pretending it is alone — which
 * is what buses did until 2026-08-09, when `875 · here now` was seen printed
 * straight through `KUHIO AVE + LILIU…`.
 *
 * `tiles[i]` is the very box `claimed` holds for `items[i]`, so a label can
 * exclude its own tile by identity rather than by geometry — a label always
 * overlaps the thing it names.
 */
function placeInto(
  items: readonly Placeable[],
  tiles: readonly Box[],
  geometryFor: (item: Placeable) => Geometry,
  projection: Projection,
  claimed: Box[],
  max: number,
  placement: Map<string, LabelPlacement>,
): void {
  const free = (box: Box, own: Box) =>
    !claimed.some((other) => other !== own && overlaps(box, other));

  for (const [index, item] of items.entries()) {
    const tile = tiles[index];
    if (tile === undefined) continue;

    // Per item rather than per layer, because the tapped bus's popup is four
    // lines where every other bus is one.
    const geometry = geometryFor(item);
    const forced = placement.get(item.id);
    // Off the edge or behind the sheet is nobody reading it. The forced entry
    // is exempt: a rider who just tapped something must see which.
    if (forced === undefined && !projection.onScreen(tile)) continue;
    if (forced === undefined && placement.size >= max) continue;

    const side = (['below', 'above'] as const).find((candidate) =>
      free(projection.labelBox(item, geometry, candidate), tile),
    );

    // A forced entry keeps its label whatever collides, but still takes the
    // better side, and still reserves the space so later labels avoid it.
    const chosen = side ?? forced;
    if (chosen === undefined) continue;

    placement.set(item.id, chosen);
    claimed.push(projection.labelBox(item, geometry, chosen));
  }
}

/** A bus, reduced to what the labeller needs of it. */
export type LabelledBus = { number: string; lat: number; lon: number };

export type MapLabels = {
  /** Keyed by `stop_id`. */
  readonly stops: Map<string, LabelPlacement>;
  /** Keyed by fleet number, which is what `BusMarker` is keyed on. */
  readonly buses: Map<string, LabelPlacement>;
};

/**
 * What the rider has touched, and therefore what keeps its name whatever else
 * is on screen.
 *
 * One parameter rather than three: they are three `string | null`s in a row
 * meaning three different things, and the only thing standing between the
 * caller and swapping two of them would be argument order.
 */
export type MapFocus = {
  /** The stop whose card is open. */
  readonly selectedStopId: string | null;
  /** The bus behind a tapped *arrival* — drawn larger, and always named. */
  readonly highlightedBusNumber: string | null;
  /** The bus a rider tapped, which is showing its popup. */
  readonly selectedBusNumber: string | null;
};

/**
 * Every name the map writes, decided in one pass over one collision map.
 *
 * **Buses claim before stops, and that ordering is the decision.** A bus label
 * never loses a collision to a stop name, because the live information is the
 * reason route mode exists — and because a stop's name can be had by tapping
 * its pin, while a bus's fleet number cannot be had at all. Both layers' tiles
 * are claimed as obstacles before either places anything, so a name never lands
 * under a marker of either kind.
 *
 * **At route scale the buses go quiet with the stops.** Past
 * `MAX_SPAN_FOR_LABELS` neither layer is labelled at all: that span is where
 * the boxes are already touching, and a label the rider cannot read is a label
 * that costs a marker re-snapshot for nothing. What is left is green dots on a
 * red line, which is the question that scale is asking. The two forced entries
 * survive it — see below.
 *
 * Everything in `focus` is labelled unconditionally, at any zoom: each marks a
 * thing the rider has just this moment tapped, and each would otherwise be lost
 * in exactly the crowd that made them tap it. **The selected bus is the reason
 * that exemption has to survive route scale** — its popup is the answer to the
 * tap, and a tap that silently does nothing at one zoom is worse than no popup
 * at all.
 */
export function labelledMapIds(
  stops: readonly StopWithDistance[],
  buses: readonly LabelledBus[],
  region: Region | null,
  viewport: Viewport,
  focus: MapFocus,
): MapLabels {
  const { selectedStopId, highlightedBusNumber, selectedBusNumber } = focus;
  const stopPlacement = new Map<string, LabelPlacement>();
  const busPlacement = new Map<string, LabelPlacement>();
  if (selectedStopId !== null) stopPlacement.set(selectedStopId, 'below');
  if (highlightedBusNumber !== null) busPlacement.set(highlightedBusNumber, 'below');
  if (selectedBusNumber !== null) busPlacement.set(selectedBusNumber, 'below');

  const labels: MapLabels = { stops: stopPlacement, buses: busPlacement };

  if (region === null || viewport.width <= 0 || viewport.height <= 0) return labels;
  if (scaleOf(region) === 'route') return labels;

  const projection = projectionFor(region, viewport);

  // Every tile of both layers, claimed before any label is placed. They are
  // opaque, they cannot move, and every one is drawn whether or not it is
  // named — including the ones behind the sheet, which a label above them could
  // still run into.
  const busGeometry = (item: { id: string }) =>
    item.id === selectedBusNumber ? SELECTED_BUS_GEOMETRY : BUS_GEOMETRY;

  const busTiles = buses.map((bus) => projection.tileBox(bus, BUS_GEOMETRY));
  const stopTiles = stops.map((stop) => projection.tileBox(stop, STOP_GEOMETRY));
  const claimed: Box[] = [...busTiles, ...stopTiles];

  // Each item paired with *the very box* already in `claimed`, so `placeInto`
  // can exclude its own tile by identity and never has to look one up. Paired
  // before sorting, because sorting is what would otherwise lose the pairing.
  const busOrder = buses
    .map((bus, index) => ({
      item: { id: bus.number, lat: bus.lat, lon: bus.lon },
      tile: busTiles[index] ?? projection.tileBox(bus, BUS_GEOMETRY),
    }))
    // **The tapped bus first, and it wins every tie**, because its popup is the
    // answer to a tap and it is the widest box on the map — placed late it
    // would be squeezed onto the worse side by labels nobody asked for. Then
    // the highlighted one, then the order they arrived in, which `useVehicles`
    // has already sorted freshest first.
    .sort((a, b) => rankOf(a.item.id) - rankOf(b.item.id));

  function rankOf(number: string): number {
    if (number === selectedBusNumber) return 0;
    if (number === highlightedBusNumber) return 1;
    return 2;
  }

  placeInto(
    busOrder.map(({ item }) => item),
    busOrder.map(({ tile }) => tile),
    busGeometry,
    projection,
    claimed,
    MAX_BUS_LABELS,
    busPlacement,
  );

  const stopOrder = stops
    .map((stop, index) => ({
      item: { id: stop.stop_id, lat: stop.lat, lon: stop.lon },
      tile: stopTiles[index] ?? projection.tileBox(stop, STOP_GEOMETRY),
      meters: stop.meters,
    }))
    // The selection first, then nearest first — the order a rider cares about.
    .sort((a, b) => {
      if (a.item.id === selectedStopId) return -1;
      if (b.item.id === selectedStopId) return 1;
      return a.meters - b.meters;
    });

  placeInto(
    stopOrder.map(({ item }) => item),
    stopOrder.map(({ tile }) => tile),
    () => STOP_GEOMETRY,
    projection,
    claimed,
    MAX_LABELS,
    stopPlacement,
  );

  return labels;
}

/**
 * Where each stop's label goes, keyed by stop id. A stop absent from the map
 * renders as a tile alone.
 *
 * The stop half of `labelledMapIds`, kept as its own name because plenty of the
 * app has no bus layer at all. `region` is the camera as last settled, or null
 * before the map has reported one — in which case only the selection is
 * labelled, since there is no way to know yet what would collide.
 */
export function labelledStopIds(
  stops: readonly StopWithDistance[],
  region: Region | null,
  viewport: Viewport,
  selectedId: string | null,
): Map<string, LabelPlacement> {
  return labelledMapIds(stops, [], region, viewport, {
    selectedStopId: selectedId,
    highlightedBusNumber: null,
    selectedBusNumber: null,
  }).stops;
}

/**
 * The stop a bus is sitting on top of, or null — nearest first where several
 * qualify.
 *
 * **Why the map needs to ask.** Buses draw *above* the stops, which is the right
 * order for a live layer over a reference one, and MapKit gives a tap to the
 * annotation on top. Truman found on 2026-08-09 that a stop pin under a bus dot
 * therefore took two taps: the first went to the bus and did nothing, because a
 * bus is not interactive. Forwarding that tap to the stop underneath is what
 * makes the pin reachable in one press. It cannot be fixed by making the bus
 * untappable — `Marker`'s `tappable` is *iOS: Google Maps only*, the same trap
 * as `zoomTapEnabled` in `docs/backlog.md`.
 *
 * **The same projection and the same tiles as the labeller**, deliberately.
 * Both layers wrap themselves in a 34-point box, so two markers overlap exactly
 * when their tiles do — and answering it here rather than with a distance in
 * metres means the answer tracks the zoom for free, and cannot drift out of
 * agreement with what the rider can see covering what.
 */
export function stopUnderBus(
  bus: { lat: number; lon: number },
  stops: readonly StopWithDistance[],
  region: Region | null,
  viewport: Viewport,
): StopWithDistance | null {
  if (region === null || viewport.width <= 0 || viewport.height <= 0) return null;

  const projection = projectionFor(region, viewport);
  const busTile = projection.tileBox(bus, BUS_GEOMETRY);

  let best: StopWithDistance | null = null;
  let bestGap = Infinity;

  for (const stop of stops) {
    const tile = projection.tileBox(stop, STOP_GEOMETRY);
    if (!overlaps(busTile, tile)) continue;

    // Center-to-center, squared: the nearest stop is the one the rider was
    // aiming at when two of them sit under one dot.
    const dx = (tile.left + tile.right) / 2 - (busTile.left + busTile.right) / 2;
    const dy = (tile.top + tile.bottom) / 2 - (busTile.top + busTile.bottom) / 2;
    const gap = dx * dx + dy * dy;
    if (gap < bestGap) {
      bestGap = gap;
      best = stop;
    }
  }

  return best;
}
