import { labelledStopIds } from '../labels';
import type { Region } from '../region';
import type { StopWithDistance } from '../../../data/gtfs/types';

/**
 * Label culling as arithmetic. The rule it enforces came off a device:
 * labelling every stop produced `IMG_4479`, twenty overlapping names in a heap,
 * and both Apple Maps and Google Maps label only a minority of the pins they
 * draw.
 */

const VIEWPORT = { width: 400, height: 700 };

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

/** Far enough apart on screen that their label boxes cannot touch. */
function spreadOut(): StopWithDistance[] {
  return [
    stop('a', 21.3069, -157.8583, 10),
    stop('b', 21.3009, -157.8583, 20),
    stop('c', 21.2949, -157.8583, 30),
  ];
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
    expect(labelledStopIds(spreadOut(), CLOSE, { width: 0, height: 0 }, null).size).toBe(0);
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
    // Truman's word for the uncapped version was "dense". Twelve stops in a
    // column, all of them placeable, and the map still takes six.
    const many = Array.from({ length: 12 }, (_, i) =>
      stop(`s${i}`, 21.3069 - i * 0.0016, -157.8583, i * 10),
    );

    expect(labelledStopIds(many, CLOSE, VIEWPORT, null).size).toBe(6);
  });

  it('spends the cap on the nearest stops', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      stop(`s${i}`, 21.3069 - i * 0.0016, -157.8583, i * 10),
    );

    const labelled = labelledStopIds(many, CLOSE, VIEWPORT, null);

    expect(labelled.has('s0')).toBe(true);
    expect(labelled.has('s11')).toBe(false);
  });

  it('does not let the cap crowd out the selection', () => {
    // The selected stop is placed before the cap is counted, so tapping the
    // furthest pin on a busy screen still shows which one was tapped.
    const many = Array.from({ length: 12 }, (_, i) =>
      stop(`s${i}`, 21.3069 - i * 0.0016, -157.8583, i * 10),
    );

    expect(labelledStopIds(many, CLOSE, VIEWPORT, 's11').has('s11')).toBe(true);
  });
});
