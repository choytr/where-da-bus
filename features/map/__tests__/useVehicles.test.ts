import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import {
  AGE_TICK_MS,
  FRESH_MS,
  VEHICLE_POLL_MS,
  drawsInDirection,
  useVehicles,
} from '../useVehicles';
import type { FleetResult, TheBusClient, Vehicle } from '../../../data/thebus';

/**
 * The freshness rule, which is the whole of this layer's correctness.
 *
 * One request returns every bus on Oahu and roughly 950 of them last reported
 * years ago while sitting on entirely plausible streets. Unfiltered, the map
 * draws ~1,100 ghosts parked since 2022.
 */

const SERVER_TIME = new Date('2026-08-02T21:43:00Z');

function bus(number: string, route: string | null, agoMs: number): Vehicle {
  return {
    number,
    tripId: `trip-${number}`,
    route,
    position: { lat: 21.31, lon: -157.85 },
    headsign: 'WAIKIKI',
    adherence: 0,
    lastMessage: new Date(SERVER_TIME.getTime() - agoMs),
  };
}

function clientOf(...results: FleetResult[]): TheBusClient & { calls: () => number } {
  let call = 0;
  const client = {
    arrivals: jest.fn(),
    vehicles: jest.fn(async () => {
      const result = results[Math.min(call, results.length - 1)];
      call += 1;
      return result ?? { ok: false as const, failure: { kind: 'unreachable' as const } };
    }),
    calls: () => call,
  };
  return client;
}

const fleetOf = (...vehicles: Vehicle[]): FleetResult => ({
  ok: true,
  fleet: { serverTime: SERVER_TIME, vehicles },
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
  jest.setSystemTime(new Date('2026-08-02T21:43:00Z'));
});

afterEach(async () => {
  // RNTL registers its auto-cleanup as a top-level afterEach, which Jest runs
  // *after* this one — so components would still be mounted and still polling
  // while real timers came back. See CLAUDE.md.
  await cleanup();
  jest.useRealTimers();
});

/** Advance synchronously inside an async act; `advanceTimersByTimeAsync` trips
 *  React's overlapping-act guard. */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useVehicles', () => {
  it('asks for nothing at all when no route is showing', async () => {
    const client = clientOf(fleetOf(bus('252', '1', 20_000)));

    const { result } = await renderHook(() => useVehicles(client, null));

    expect(client.calls()).toBe(0);
    expect(result.current.buses).toEqual([]);
  });

  it('draws a bus reporting inside the window', async () => {
    const client = clientOf(fleetOf(bus('252', '1', 20_000)));

    const { result } = await renderHook(() => useVehicles(client, '1'));

    await waitFor(() => expect(result.current.buses.length).toBe(1));
    expect(result.current.buses[0]?.vehicle.number).toBe('252');
  });

  /**
   * 929 stale vehicles in the daytime sample carried plausible Oahu
   * coordinates. This is the line between a live map and a car park.
   */
  it('drops a bus whose last report is older than the window', async () => {
    const client = clientOf(fleetOf(bus('801', '1', FRESH_MS + 60_000)));

    const { result } = await renderHook(() => useVehicles(client, '1'));

    await waitFor(() => expect(client.calls()).toBe(1));
    expect(result.current.buses).toEqual([]);
  });

  it('draws only the buses on the route being shown', async () => {
    const client = clientOf(
      fleetOf(bus('252', '1', 20_000), bus('300', '2', 20_000), bus('410', null, 20_000)),
    );

    const { result } = await renderHook(() => useVehicles(client, '1'));

    await waitFor(() => expect(result.current.buses.length).toBe(1));
    expect(result.current.buses[0]?.vehicle.number).toBe('252');
  });

  /** 17 of 235 live buses report the literal string "null". Known, accepted. */
  it('leaves a bus reporting no route off the map', async () => {
    const client = clientOf(fleetOf(bus('410', null, 20_000)));

    const { result } = await renderHook(() => useVehicles(client, '1'));

    await waitFor(() => expect(client.calls()).toBe(1));
    expect(result.current.buses).toEqual([]);
  });

  it('matches a route whose number is not a number', async () => {
    const client = clientOf(fleetOf(bus('197', 'A LINE', 20_000)));

    const { result } = await renderHook(() => useVehicles(client, 'a line'));

    await waitFor(() => expect(result.current.buses.length).toBe(1));
  });

  /**
   * The rule applied in the *other* direction, and the reason a failed fetch
   * needs no special case: the age is computed from the bus's own last report,
   * so it keeps growing whether or not anything new arrives.
   */
  it('ages a bus off the map between polls, with no new data', async () => {
    const client = clientOf(fleetOf(bus('252', '1', FRESH_MS - AGE_TICK_MS / 2)));

    const { result } = await renderHook(() => useVehicles(client, '1'));
    await waitFor(() => expect(result.current.buses.length).toBe(1));

    await advance(AGE_TICK_MS);

    await waitFor(() => expect(result.current.buses).toEqual([]));
  });

  it('keeps the buses it has when a poll fails, and lets them age', async () => {
    const client = clientOf(
      fleetOf(bus('252', '1', 20_000)),
      { ok: false, failure: { kind: 'unreachable' } },
    );

    const { result } = await renderHook(() => useVehicles(client, '1'));
    await waitFor(() => expect(result.current.buses.length).toBe(1));

    await advance(VEHICLE_POLL_MS);

    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'unreachable' }));
    // Not blanked. The whole point: a spinner must never replace what is known.
    expect(result.current.buses.length).toBe(1);
    expect(result.current.buses[0]?.ageMs).toBeGreaterThan(20_000);
  });

  it('polls on the same cycle the arrival board uses', async () => {
    const client = clientOf(fleetOf(bus('252', '1', 20_000)));

    await renderHook(() => useVehicles(client, '1'));
    await waitFor(() => expect(client.calls()).toBe(1));

    await advance(VEHICLE_POLL_MS);

    await waitFor(() => expect(client.calls()).toBe(2));
  });

  /**
   * The response is the whole island either way, so flipping direction or
   * switching route must not throw away a fleet that is still current and spend
   * another request to receive the same bytes.
   */
  it('does not re-request when the route changes', async () => {
    const client = clientOf(fleetOf(bus('252', '1', 20_000), bus('300', '2', 20_000)));

    const { result, rerender } = await renderHook(
      ({ route }: { route: string | null }) => useVehicles(client, route),
      { initialProps: { route: '1' } },
    );
    await waitFor(() => expect(client.calls()).toBe(1));

    await rerender({ route: '2' });

    await waitFor(() => expect(result.current.buses[0]?.vehicle.number).toBe('300'));
    expect(client.calls()).toBe(1);
  });

  it('forgets the fleet once the route is dismissed', async () => {
    const client = clientOf(fleetOf(bus('252', '1', 20_000)));

    const { result, rerender } = await renderHook(
      ({ route }: { route: string | null }) => useVehicles(client, route),
      { initialProps: { route: '1' as string | null } },
    );
    await waitFor(() => expect(result.current.buses.length).toBe(1));

    await rerender({ route: null });

    expect(result.current.buses).toEqual([]);
    expect(result.current.fetchedAt).toBeNull();
  });

  it('reports the freshest bus first', async () => {
    const client = clientOf(
      fleetOf(bus('old', '1', 200_000), bus('new', '1', 5_000), bus('mid', '1', 60_000)),
    );

    const { result } = await renderHook(() => useVehicles(client, '1'));

    await waitFor(() => expect(result.current.buses.length).toBe(3));
    expect(result.current.buses.map((b) => b.vehicle.number)).toEqual(['new', 'mid', 'old']);
  });
});

describe('the clock ages are read against', () => {
  /**
   * `now` is seeded when the *screen* mounts and only ticks while a route is
   * showing, so the map sitting idle leaves it arbitrarily far in the past.
   *
   * Without the reset, `now − fetchedAt` comes out negative, `ageOf`'s
   * `Math.max(0, …)` clamps every age to zero, and for a whole `AGE_TICK_MS`
   * every bus reads "here now" while nothing can fail the freshness filter that
   * keeps ~950 ghosts off the map. Found by reading; the 2026-08-09 screenshot
   * of twelve labels every one of which said "here now" is consistent with it.
   */
  it('ages a fleet against a current clock after a long idle', async () => {
    // Well past FRESH_MS, so this bus must not be drawn.
    const stale = bus('999', '1', FRESH_MS + 10 * 60_000);
    const client = clientOf(fleetOf(stale));

    const { rerender, result } = await renderHook(
      ({ route }: { route: string | null }) => useVehicles(client, route),
      { initialProps: { route: null } },
    );

    // The map, open and idle, with no route showing and the tick not running.
    await advance(30 * 60_000);

    await rerender({ route: '1' });
    await waitFor(() => expect(result.current.buses.length).toBe(0));

    expect(result.current.buses).toHaveLength(0);
  });

  it('still draws a fresh bus after the same idle', async () => {
    const fresh = bus('252', '1', 20_000);
    const client = clientOf(fleetOf(fresh));

    const { rerender, result } = await renderHook(
      ({ route }: { route: string | null }) => useVehicles(client, route),
      { initialProps: { route: null } },
    );

    await advance(30 * 60_000);
    await rerender({ route: '1' });

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
    expect(result.current.buses[0]?.vehicle.number).toBe('252');
  });
});

describe('lateCount', () => {
  /** Counted beside the buses so the ring on a dot and the number in the band
   *  cannot disagree — both read one `adherenceOf`. */
  it('counts only the buses running behind', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('a', '1', 10_000), adherence: -12 },
        { ...bus('b', '1', 10_000), adherence: -30 },
        { ...bus('c', '1', 10_000), adherence: 0 },
        // Positive is EARLY, and early is not late.
        { ...bus('d', '1', 10_000), adherence: 6 },
        { ...bus('e', '1', 10_000), adherence: null },
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '1'));

    await waitFor(() => expect(result.current.buses).toHaveLength(5));
    expect(result.current.lateCount).toBe(2);
  });
});

describe('a fleet number the feed reports twice', () => {
  /**
   * Observed live on 2026-08-09, on Route 10: fleet numbers `605` and `209`
   * each came back twice inside the freshness window, and React reported
   * "Encountered two children with the same key" against `buses.map` in
   * `MapScreen` — the fleet number being the only stable identity a bus has,
   * and therefore its marker's key.
   *
   * Duplicate keys mean React's model of what it mounted diverges from what it
   * mounted, and these children are `react-native-maps` markers, whose native
   * subview list already diverges from React's by construction. That pairing is
   * the leading candidate for the SIGABRT in `docs/backlog.md`.
   */
  it('draws it once', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('605', '10', 60_000), headsign: 'EWA' },
        { ...bus('605', '10', 10_000), headsign: 'KAILUA' },
        bus('209', '10', 20_000),
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '10'));

    await waitFor(() => expect(result.current.buses.length).toBeGreaterThan(0));
    expect(result.current.buses.map((b) => b.vehicle.number)).toEqual(['605', '209']);
  });

  /** Two records for one bus are one bus reported twice; the older is out of date. */
  it('keeps the fresher of the two reports', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('605', '10', 200_000), headsign: 'STALE' },
        { ...bus('605', '10', 5_000), headsign: 'FRESH' },
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '10'));

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
    expect(result.current.buses[0]?.vehicle.headsign).toBe('FRESH');
  });

  /** The count in the route band reads the drawn list, not the raw one. */
  it('does not count the duplicate twice when it is late', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('605', '10', 10_000), adherence: -12 },
        { ...bus('605', '10', 20_000), adherence: -12 },
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '10'));

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
    expect(result.current.lateCount).toBe(1);
  });
});

/**
 * Which way a bus is going, from the only thing the fleet feed says about it.
 *
 * A vehicle carries a headsign and no direction, so this is the whole basis of
 * the filter. The two lists exist because "signed the other way" and "signed
 * something this app has never heard of" are different facts, and only the
 * first is a reason to hide a bus — GTFS is reference data that can be weeks
 * stale, and hiding on ignorance would empty the map rather than tidy it.
 */
const KALIHI_SIGN = 'KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN';
const WAIKIKI_SIGN = 'WAIKIKI - KAPIOLANI CC - DIAMOND HEAD';

describe('drawsInDirection', () => {
  const route2 = {
    showing: ['KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN'],
    known: [
      'KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN',
      'WAIKIKI - KAPIOLANI CC - DIAMOND HEAD',
      'ALAPAI TRANSIT CENTER',
    ],
  };

  it('draws a bus signed the way the map is looking', () => {
    expect(drawsInDirection(route2, 'KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN')).toBe(true);
  });

  it('hides a bus signed the other way', () => {
    // Bus 889 on 2026-08-09, drawn a block off a line headed for Kalihi. Its
    // position was right and MapKit was right; it was the other way's bus.
    expect(drawsInDirection(route2, 'WAIKIKI - KAPIOLANI CC - DIAMOND HEAD')).toBe(false);
  });

  it('draws a bus signed something the feed does not carry', () => {
    expect(drawsInDirection(route2, 'SOMEWHERE NEW')).toBe(true);
  });

  it('draws a bus that reported no headsign at all', () => {
    expect(drawsInDirection(route2, null)).toBe(true);
  });

  it('draws every bus when the direction is not known yet', () => {
    expect(drawsInDirection(null, 'WAIKIKI - KAPIOLANI CC - DIAMOND HEAD')).toBe(true);
  });

  /**
   * Twelve routes sign both directions alike — a short-turn gets a generic sign
   * and a street name has no direction. 4.00% of trips, accepted rather than
   * guessed at, so those buses keep drawing both ways as they always have.
   */
  it('draws a bus whose sign both directions share', () => {
    const route14 = {
      showing: ['ST LOUIS HTS VIA KAPAHULU', 'WAIALAE AVENUE'],
      known: ['ST LOUIS HTS VIA KAPAHULU', 'MAUNALANI HTS VIA KAPAHULU', 'WAIALAE AVENUE'],
    };
    expect(drawsInDirection(route14, 'WAIALAE AVENUE')).toBe(true);
  });

  /**
   * `RouteDirection.headsigns` documents empty as *cannot tell*, and the one
   * thing this filter must never do is empty the map. Without the guard the
   * rule below would hide every bus the feed recognises, because none of them
   * is in a `showing` of nothing.
   */
  it('draws everything for a direction the feed signed no way at all', () => {
    const unsigned = { showing: [], known: [KALIHI_SIGN, WAIKIKI_SIGN] };

    expect(drawsInDirection(unsigned, WAIKIKI_SIGN)).toBe(true);
    expect(drawsInDirection(unsigned, KALIHI_SIGN)).toBe(true);
  });

  /** Exact equality, both sides. A divergence degrades to "unknown", which draws. */
  it('does not match a headsign that differs only in case', () => {
    expect(drawsInDirection(route2, 'waikiki - kapiolani cc - diamond head')).toBe(true);
  });
});

describe('useVehicles direction filter', () => {
  const KALIHI = 'KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN';
  const WAIKIKI = 'WAIKIKI - KAPIOLANI CC - DIAMOND HEAD';
  const toward = (showing: string) => ({ showing: [showing], known: [KALIHI, WAIKIKI] });

  it('drops a bus running the other direction', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('231', '2', 10_000), headsign: KALIHI },
        { ...bus('889', '2', 10_000), headsign: WAIKIKI },
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '2', toward(KALIHI)));

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
    expect(result.current.buses[0]?.vehicle.number).toBe('231');
  });

  it('keeps a bus whose headsign is unknown', async () => {
    const client = clientOf(fleetOf({ ...bus('231', '2', 10_000), headsign: 'A NEW SIGN' }));

    const { result } = await renderHook(() => useVehicles(client, '2', toward(KALIHI)));

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
  });

  it('filters nothing when no headsigns are supplied', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('231', '2', 10_000), headsign: KALIHI },
        { ...bus('889', '2', 10_000), headsign: WAIKIKI },
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '2', null));

    await waitFor(() => expect(result.current.buses).toHaveLength(2));
  });

  /**
   * The response is the whole island either way, so flipping direction must
   * re-filter a fleet already in hand rather than spend another request to
   * receive the same bytes.
   */
  it('flips direction without asking for the fleet again', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('231', '2', 10_000), headsign: KALIHI },
        { ...bus('889', '2', 10_000), headsign: WAIKIKI },
      ),
    );

    const { result, rerender } = await renderHook(
      ({ showing }: { showing: string }) => useVehicles(client, '2', toward(showing)),
      { initialProps: { showing: KALIHI } },
    );

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
    expect(result.current.buses[0]?.vehicle.number).toBe('231');
    const before = client.calls();

    await rerender({ showing: WAIKIKI });

    await waitFor(() => expect(result.current.buses[0]?.vehicle.number).toBe('889'));
    expect(client.calls()).toBe(before);
  });

  /** The band's count is of what is drawn, so a hidden bus is not counted late. */
  it('does not count a hidden bus among the late ones', async () => {
    const client = clientOf(
      fleetOf(
        { ...bus('231', '2', 10_000), headsign: KALIHI, adherence: -12 },
        { ...bus('889', '2', 10_000), headsign: WAIKIKI, adherence: -12 },
      ),
    );

    const { result } = await renderHook(() => useVehicles(client, '2', toward(KALIHI)));

    await waitFor(() => expect(result.current.buses).toHaveLength(1));
    expect(result.current.lateCount).toBe(1);
  });
});
