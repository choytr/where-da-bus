import { labelledStopIds } from '../labels';
import type { Region } from '../region';
import type { StopWithDistance } from '../../../data/gtfs/types';

/**
 * Label culling as arithmetic. The rule it enforces came off a device:
 * labelling every stop produced `IMG_4479`, twenty overlapping names in a heap,
 * and both Apple Maps and Google Maps label only a minority of the pins they
 * draw.
 */

const VIEWPORT = { width: 400, height: 700, visibleHeight: 700 };

/** Centred on downtown Honolulu, spanning about 1 km. */
const CLOSE: Region = {
  latitude: 21.3069,
  longitude: -157.8583,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

function stop(id: string, lat: number, lon: number, meters: number): StopWithDistance {
  return {
    stop_id: id,
    stop_code: id,
    stop_name: `STOP ${id}`,
    lat,
    lon,
    meters,
  };
}

/**
 * Three stops in a column, far enough apart that their boxes cannot touch and
 * close enough that all three are on screen. At this zoom 0.0012° is about 84
 * points, against a label box 36 points tall.
 */
function spreadOut(): StopWithDistance[] {
  return [
    stop('a', 21.3069, -157.8583, 10),
    stop('b', 21.3057, -157.8583, 20),
    stop('c', 21.3045, -157.8583, 30),
  ];
}

/**
 * Twelve stops that all fit on screen and can all be labelled — two columns
 * far enough apart horizontally that their names never meet. Used for the cap,
 * which is about *choosing* between placeable labels rather than about running
 * out of room.
 */
function grid(): StopWithDistance[] {
  return Array.from({ length: 12 }, (_, i) => {
    const column = i % 2;
    const row = Math.floor(i / 2);
    return stop(
      `s${i}`,
      21.3069 - row * 0.00143,
      -157.8583 + (column === 0 ? -0.0025 : 0.0025),
      i * 10,
    );
  });
}

/** Just the ids, for the cases that do not care which side a label went. */
const ids = (placement: Map<string, unknown>) => new Set(placement.keys());

describe('labelledStopIds', () => {
  it('labels stops that do not collide', () => {
    const labelled = labelledStopIds(spreadOut(), CLOSE, VIEWPORT, null);

    expect(ids(labelled)).toEqual(new Set(['a', 'b', 'c']));
    expect(labelled.get('a')).toBe('below');
  });

  it('gives two stops on the same spot one side each rather than dropping one', () => {
    // Two stops a few metres apart. Before labels could flip, the second was
    // simply dropped; one above and one below is readable and keeps both names.
    const crowded = [
      stop('near', 21.3069, -157.8583, 10),
      stop('onTop', 21.30692, -157.85832, 20),
    ];

    const labelled = labelledStopIds(crowded, CLOSE, VIEWPORT, null);

    expect(labelled.get('near')).toBe('below');
    expect(labelled.get('onTop')).toBe('above');
  });

  it('drops a label only when both sides are blocked', () => {
    // Tiles roughly a label's height above and below leave nowhere to put the
    // middle stop's name, and a name half under an icon is what IMG_4527 was.
    const middle = stop('middle', 21.3069, -157.8583, 10);
    const under = stop('under', 21.3069 - 0.000486, -157.8583, 20);
    const over = stop('over', 21.3069 + 0.000486, -157.8583, 30);

    const labelled = labelledStopIds([middle, under, over], CLOSE, VIEWPORT, null);

    expect(labelled.has('middle')).toBe(false);
  });

  it('places by the rider’s ordering, not the order the query returned', () => {
    // Distance decides who is served first, so the same two stops handed back
    // the other way round must produce the same map. Which side each one ends
    // up on is geometry's business and is asserted elsewhere; what matters here
    // is that the answer does not depend on the caller's array order.
    const far = stop('far', 21.3069, -157.8583, 900);
    const near = stop('near', 21.30692, -157.85832, 30);

    const oneWay = labelledStopIds([far, near], CLOSE, VIEWPORT, null);
    const other = labelledStopIds([near, far], CLOSE, VIEWPORT, null);

    expect([...other.entries()].sort()).toEqual([...oneWay.entries()].sort());
    expect(oneWay.size).toBe(2);
  });

  it('always labels the selected stop, even in a crowd', () => {
    // A rider who just tapped a pin has to be shown which one they tapped.
    const crowded = [
      stop('near', 21.3069, -157.8583, 10),
      stop('buried', 21.30692, -157.85832, 800),
    ];

    const labelled = labelledStopIds(crowded, CLOSE, VIEWPORT, 'buried');

    expect(labelled.has('buried')).toBe(true);
  });

  it('labels nothing but the selection when zoomed far out', () => {
    // Past the span where tiles start touching, no culling produces a readable
    // map, so the rule changes rather than degrading.
    const wide: Region = { ...CLOSE, latitudeDelta: 0.2, longitudeDelta: 0.2 };

    expect(labelledStopIds(spreadOut(), wide, VIEWPORT, null).size).toBe(0);
    expect(ids(labelledStopIds(spreadOut(), wide, VIEWPORT, 'b'))).toEqual(new Set(['b']));
  });

  it('labels only the selection before the camera has reported a region', () => {
    // Nothing can be known about collisions yet, and guessing would put a heap
    // on screen for the first frame.
    expect(labelledStopIds(spreadOut(), null, VIEWPORT, null).size).toBe(0);
    expect(ids(labelledStopIds(spreadOut(), null, VIEWPORT, 'a'))).toEqual(new Set(['a']));
  });

  it('does not mutate the stop list it was given', () => {
    // It sorts by priority internally, and the caller's array is the one the
    // pins and the sheet rows are both rendered from.
    const stops = spreadOut();
    const order = stops.map((s) => s.stop_id);

    labelledStopIds(stops, CLOSE, VIEWPORT, 'c');

    expect(stops.map((s) => s.stop_id)).toEqual(order);
  });

  it('survives a zero-sized viewport rather than dividing by it', () => {
    const empty = { width: 0, height: 0, visibleHeight: 0 };

    expect(labelledStopIds(spreadOut(), CLOSE, empty, null).size).toBe(0);
  });

  it('does not spend the label budget on stops hidden behind the sheet', () => {
    // Truman, 2026-08-08: "sometimes it's really hard to get the labels to show
    // up for the stops I'm looking at." Six of the seven stops here sit under
    // the sheet, and were taking the whole cap with them.
    const behindTheSheet = Array.from({ length: 6 }, (_, i) =>
      // Well below centre: at this zoom these land past y = 600.
      stop(`hidden${i}`, 21.3069 - 0.0045 - i * 0.0002, -157.8583, 10 + i),
    );
    const inView = stop('visible', 21.3069, -157.8583, 900);

    const half = { ...VIEWPORT, visibleHeight: 400 };
    const labelled = labelledStopIds([...behindTheSheet, inView], CLOSE, half, null);

    expect(labelled.has('visible')).toBe(true);
    expect([...labelled.keys()].every((id) => !id.startsWith('hidden'))).toBe(true);
  });

  it('does not spend the label budget on stops off the side of the screen', () => {
    // Truman guessed this one from the outside: "there are stops loaded on the
    // left that have a bunch of labels. Maybe those aren't being unloaded and
    // are eating the labels count?" They are not unloaded and should not be —
    // the stop set belongs to the anchor, not the camera — but they were taking
    // label slots while sitting past the left edge.
    const offToTheLeft = Array.from({ length: 6 }, (_, i) =>
      // Well west of centre: at this zoom these land past x = 0.
      stop(`west${i}`, 21.3069 - i * 0.0012, -157.8583 - 0.008, 10 + i),
    );
    const inView = stop('visible', 21.3069, -157.8583, 900);

    const labelled = labelledStopIds([...offToTheLeft, inView], CLOSE, VIEWPORT, null);

    expect(labelled.has('visible')).toBe(true);
    expect([...labelled.keys()].every((id) => !id.startsWith('west'))).toBe(true);
  });

  it('still treats a hidden stop as an obstacle', () => {
    // It is drawn on the part of the map under the sheet, and a label reaching
    // down from a visible stop would run straight into it.
    const visible = stop('visible', 21.3069, -157.8583, 10);
    const justBelow = stop('justBelow', 21.3069 - 0.000486, -157.8583, 20);

    const labelled = labelledStopIds(
      [visible, justBelow],
      CLOSE,
      // The sheet's edge falls between the two.
      { ...VIEWPORT, visibleHeight: 355 },
      null,
    );

    expect(labelled.get('visible')).not.toBe('below');
  });

  it('will not write a name underneath another stop\'s tile', () => {
    // IMG_4527: names running under other stops' icons, because the first
    // version only checked labels against labels. A tile is opaque and cannot
    // be moved out of the way, so it is an obstacle like any other.
    const above = stop('above', 21.3069, -157.8583, 10);
    // Directly below it on screen, right where `above`'s label wants to go.
    const below = stop('below', 21.30655, -157.8583, 20);

    const labelled = labelledStopIds([above, below], CLOSE, VIEWPORT, null);

    // Not beneath its tile — either flipped over the top, or dropped.
    expect(labelled.get('above')).not.toBe('below');
  });

  it('flips a label above its tile when there is no room beneath', () => {
    const blocked = stop('blocked', 21.3069, -157.8583, 10);
    const inTheWay = stop('inTheWay', 21.30655, -157.8583, 20);

    const labelled = labelledStopIds([blocked, inTheWay], CLOSE, VIEWPORT, 'blocked');

    expect(labelled.get('blocked')).toBe('above');
  });

  it('caps how many names the map carries at once', () => {
    // Truman's word for the uncapped version was "dense". Twelve placeable
    // stops on screen, and the map still takes six.
    expect(labelledStopIds(grid(), CLOSE, VIEWPORT, null).size).toBe(6);
  });

  it('spends the cap on the nearest stops', () => {
    const labelled = labelledStopIds(grid(), CLOSE, VIEWPORT, null);

    expect(labelled.has('s0')).toBe(true);
    expect(labelled.has('s11')).toBe(false);
  });

  it('does not let the cap crowd out the selection', () => {
    // The selected stop is placed before the cap is counted, so tapping the
    // furthest pin on a busy screen still shows which one was tapped.
    expect(labelledStopIds(grid(), CLOSE, VIEWPORT, 's11').has('s11')).toBe(true);
  });
});
