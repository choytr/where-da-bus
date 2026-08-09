import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { AGE_TICK_MS, FRESH_MS, VEHICLE_POLL_MS, useVehicles } from '../useVehicles';
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
