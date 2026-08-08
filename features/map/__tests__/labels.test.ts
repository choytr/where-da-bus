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

describe('labelledStopIds', () => {
  it('labels stops that do not collide', () => {
    const labelled = labelledStopIds(spreadOut(), CLOSE, VIEWPORT, null);

    expect(labelled).toEqual(new Set(['a', 'b', 'c']));
  });

  it('drops the label of a stop whose box overlaps one already placed', () => {
    // Two stops a few metres apart: at this zoom their boxes sit on top of one
    // another, which is exactly the heap on the device.
    const crowded = [
      stop('near', 21.3069, -157.8583, 10),
      stop('onTop', 21.30692, -157.85832, 20),
    ];

    const labelled = labelledStopIds(crowded, CLOSE, VIEWPORT, null);

    expect(labelled.has('near')).toBe(true);
    expect(labelled.has('onTop')).toBe(false);
  });

  it('keeps the nearer stop when two collide, whatever order they arrive in', () => {
    // The rider's own ordering, not the query's. A list handed back the other
    // way round must not change which name is on the map.
    const far = stop('far', 21.3069, -157.8583, 900);
    const near = stop('near', 21.30692, -157.85832, 30);

    const labelled = labelledStopIds([far, near], CLOSE, VIEWPORT, null);

    expect(labelled.has('near')).toBe(true);
    expect(labelled.has('far')).toBe(false);
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
    expect(labelledStopIds(spreadOut(), wide, VIEWPORT, 'b')).toEqual(new Set(['b']));
  });

  it('labels only the selection before the camera has reported a region', () => {
    // Nothing can be known about collisions yet, and guessing would put a heap
    // on screen for the first frame.
    expect(labelledStopIds(spreadOut(), null, VIEWPORT, null).size).toBe(0);
    expect(labelledStopIds(spreadOut(), null, VIEWPORT, 'a')).toEqual(new Set(['a']));
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
});
