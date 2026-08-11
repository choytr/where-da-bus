import { StyleSheet } from 'react-native';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ArrivalsScreen, NOTICES } from '../ArrivalsScreen';
import type { Arrival, ArrivalsResult, TheBusClient } from '../../../data/thebus';
import type { RouteSummary, Stop } from '../../../data/gtfs/types';
import { TestTheme } from '../../../lib/testing/theme';

/**
 * **This screen does ask for the fleet**, since 2026-08-10: a row must not
 * offer *Show live bus on map* for a bus the map cannot draw, and only the
 * fleet endpoint knows. See `features/arrivals/reportingBuses.ts`. An empty
 * one means "nothing is reporting", which is a real state and the one that
 * gates the entry off.
 */
const noFleet: TheBusClient['vehicles'] = async () => ({
  ok: true,
  fleet: { serverTime: new Date('2026-08-02T22:00:00Z'), vehicles: [] },
});


/**
 * What a rider actually sees in each of §4's three states. The GTFS query
 * layer is native and is doubled; the client is injected, so nothing here
 * touches a network or a database.
 *
 * The rule under test throughout is that no two states render alike — most of
 * all that "no buses are due" and "could not reach the bus service" are never
 * the same screen.
 */
const mockQueries = {
  nearby: jest.fn(async () => []),
  searchByName: jest.fn(async () => []),
  searchByCode: jest.fn(async (_code: string): Promise<Stop | null> => ({
    stop_id: '596',
    stop_code: '596',
    stop_name: 'KING ST + BISHOP ST',
    lat: 21.31,
    lon: -157.86,
  })),
  routesForStops: jest.fn(async (): Promise<Map<string, RouteSummary[]>> => new Map()),
  stopsByIds: jest.fn(async () => []),
  feedEndDate: jest.fn(async () => null),
  routeById: jest.fn(async () => null),
  routeStops: jest.fn(async () => []),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
}));

/**
 * The screen reads a location only if one is already permitted — see
 * `requestIfAllowed`. This double is what lets a test say "location is
 * available" or "it is not" without a native module, and the *absence* of
 * `request` here is deliberate: this screen must never be able to put a
 * permission dialog in front of anyone.
 */
const mockRequestIfAllowed = jest.fn(async (): Promise<{ lat: number; lon: number } | null> => null);

jest.mock('../../stops/useLocation', () => ({
  useLocation: () => ({
    status: 'idle',
    coords: null,
    request: () => {
      throw new Error('the arrival board must not ask for permission');
    },
    requestIfAllowed: mockRequestIfAllowed,
  }),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/**
 * `initialWindowMetrics` is null off-device and a provider seeded with null
 * renders nothing at all, so the metrics of a real phone are supplied here.
 * The same reasoning as StopsScreen.test.tsx — and note this file wraps the
 * screen itself rather than mocking the module, because it does not own the
 * provider the way App does.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const arrival = (over: Partial<Arrival> = {}): Arrival => ({
  id: 'a1',
  tripId: 't1',
  route: '2',
  headsign: 'WAIKIKI',
  direction: 'Westbound',
  arrivesAt: new Date('2026-08-02T08:45:00.000Z'),
  estimate: 'live',
  vehicle: '871',
  shape: null,
  position: { lat: 21.3, lon: -157.85 },
  canceled: false,
  ...over,
});

const boardOf = (...arrivals: Arrival[]): ArrivalsResult => ({
  ok: true,
  board: {
    stopCode: '596',
    serverTime: new Date('2026-08-02T08:40:00.000Z'),
    arrivals,
  },
});

/**
 * Stamps each successful board with the clock at the moment it is served.
 *
 * A fixed `serverTime` would be an unrealistic fake in a way that matters:
 * countdowns are measured against the *server's* clock carried onto the
 * device's, so a fake server whose clock never advances pushes the correction
 * further back on every poll and the countdown appears to stall. Real
 * responses carry a moving timestamp.
 */
const clientOf = (...results: ArrivalsResult[]): TheBusClient => {
  let call = 0;
  return {
    arrivals: async () => {
      const result = results[Math.min(call++, results.length - 1)];
      // Only reachable from `clientOf()` with no results, which is a test that
      // meant to say something and did not.
      if (result === undefined) throw new Error('clientOf() was given no results');
      return result.ok
        ? { ...result, board: { ...result.board, serverTime: new Date() } }
        : result;
    },
    vehicles: noFleet,
  };
};

const show = (client: TheBusClient) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TestTheme>
        <ArrivalsScreen stopCode="596" client={client} />
      </TestTheme>
    </SafeAreaProvider>,
  );

describe('ArrivalsScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-02T08:40:00.000Z'));
    mockQueries.routesForStops.mockResolvedValue(new Map());
    mockRequestIfAllowed.mockResolvedValue(null);
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('shows the stop it is about', async () => {
    await show(clientOf(boardOf(arrival())));
    screen.getByText('KING ST + BISHOP ST');
    screen.getByText('Stop 596');
  });

  /** See `StopCard`'s equivalent for the mechanism. A proxy for the bug — Jest
   *  makes no layout pass and so cannot scroll anything. */
  it('gives the board room to scroll in', async () => {
    await show(clientOf(boardOf(arrival())));

    expect(StyleSheet.flatten(screen.getByTestId('arrivals-list').props.style).flex).toBe(1);
  });

  it('carries the required attribution, which the terms call for wherever the data appears', async () => {
    await show(clientOf(boardOf(arrival())));
    screen.getByText(/provided by permission of Oahu Transit Services, Inc/);
  });

  it('lists a live arrival with its countdown, clock time and bus', async () => {
    await show(clientOf(boardOf(arrival())));
    screen.getByText('5 min');
    screen.getByText('10:45 PM');
    screen.getByText(/Live · Bus 871/);
  });

  it('says in words when a time is only a schedule', async () => {
    // 96% of arrivals are this. It is the common case, not an edge case, and
    // a rider deciding whether to leave the house needs to know.
    await show(clientOf(boardOf(arrival({ estimate: 'scheduled', vehicle: null }))));
    screen.getByText(/Scheduled · no GPS/);
    expect(screen.queryByText(/Live/)).toBeNull();
  });

  it('groups by direction, the way the old app did', async () => {
    await show(
      clientOf(
        boardOf(
          arrival({ id: 'a1', direction: 'Westbound' }),
          arrival({
            id: 'a2',
            direction: 'Eastbound',
            arrivesAt: new Date('2026-08-02T08:50:00.000Z'),
          }),
        ),
      ),
    );
    screen.getByText('Buses traveling westbound');
    screen.getByText('Buses traveling eastbound');
  });

  it('shows how old the data is', async () => {
    await show(clientOf(boardOf(arrival())));
    screen.getByText(/Updated just now/);
  });

  it('says no buses are due, and does not say anything failed', async () => {
    await show(clientOf(boardOf()));

    screen.getByText(NOTICES.empty);
    expect(screen.queryByText(NOTICES.unreachable)).toBeNull();
  });

  it('says the service could not be reached, and does not say there are no buses', async () => {
    // The other half of the same rule. These two screens are what a rider
    // uses to decide whether to keep waiting.
    await show(clientOf({ ok: false, failure: { kind: 'unreachable' } }));

    screen.getByText(NOTICES.unreachable);
    expect(screen.queryByText(NOTICES.empty)).toBeNull();
  });

  it('says the key was rejected, and does not say the service is unreachable', async () => {
    // The third state that must not collapse into the other two. An outage is
    // fixed by waiting; a rejected key never is, and a rider who is shown
    // "could not reach the bus service" will stand at the stop and wait for
    // an app that was never going to recover.
    await show(clientOf({ ok: false, failure: { kind: 'unauthorized' } }));

    screen.getByText(NOTICES.unauthorized);
    expect(screen.queryByText(NOTICES.unreachable)).toBeNull();
    expect(screen.queryByText(NOTICES.empty)).toBeNull();
  });

  it('passes on the vendor error rather than inventing a friendlier one', async () => {
    await show(
      clientOf({ ok: false, failure: { kind: 'api', message: 'Invalid or unspecified stop ID' } }),
    );
    screen.getByText('Invalid or unspecified stop ID');
  });

  it('keeps the times on screen when a later poll fails, and says they are stale', async () => {
    // The §4 requirement that a spinner never replaces cached data. The
    // arrivals must still be readable, and the screen must admit their age.
    await show(clientOf(boardOf(arrival()), { ok: false, failure: { kind: 'unreachable' } }));

    screen.getByText('5 min');

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    // Still listed, still counting down — the failed poll took nothing away.
    screen.getByText('WAIKIKI');
    screen.getByText('4 min');
    screen.getByText(new RegExp(NOTICES.stale));
    expect(screen.queryByText(NOTICES.loading)).toBeNull();
  });

  it('counts down as time passes without asking the API again', async () => {
    await show(clientOf(boardOf(arrival())));
    screen.getByText('5 min');

    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });

    screen.getByText('3 min');
  });

  it('marks a canceled bus as canceled', async () => {
    await show(clientOf(boardOf(arrival({ canceled: true }))));
    screen.getByText('Canceled');
  });
  /**
   * The card's meta block, which this screen did not have until Increment 9.
   * Which routes call here is a fact about the stop; how far away it is depends
   * on a location this screen must never ask for.
   */
  describe('the meta block', () => {
    const routes: RouteSummary[] = [
      { route_id: '31', short_name: '32', long_name: 'Mapunapuna-Airport' },
      { route_id: '18', short_name: '19', long_name: 'Airport-Hickam' },
    ];

    it('shows route chips for the stop', async () => {
      mockQueries.routesForStops.mockResolvedValue(new Map([['596', routes]]));

      await show(clientOf(boardOf(arrival())));

      await screen.findByLabelText('Route 32');
      expect(screen.getByLabelText('Route 19')).toBeTruthy();
    });

    it('shows the distance when a location is already permitted', async () => {
      mockRequestIfAllowed.mockResolvedValue({ lat: 21.311, lon: -157.86 });

      await show(clientOf(boardOf(arrival())));

      // ~111 m north of the stop, which formats in metres rather than km.
      await screen.findByText(/^\d+ m$/);
    });

    it('omits distance when location is unavailable', async () => {
      mockRequestIfAllowed.mockResolvedValue(null);

      await show(clientOf(boardOf(arrival())));

      expect(screen.queryByText(/ m$/)).toBeNull();
      expect(screen.queryByText(/ km$/)).toBeNull();
    });

    /**
     * The board is reachable by deep link, so it can be the first screen a
     * rider ever sees. `useLocation`'s double throws if `request` is called.
     */
    it('never asks for permission to show one', async () => {
      await show(clientOf(boardOf(arrival())));

      expect(mockRequestIfAllowed).toHaveBeenCalled();
    });
  });

});
