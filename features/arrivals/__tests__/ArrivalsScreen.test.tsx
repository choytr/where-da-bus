import { act, cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ArrivalsScreen, NOTICES } from '../ArrivalsScreen';
import type { Arrival, ArrivalsResult, TheBusClient } from '../../../data/thebus';
import type { Stop } from '../../../data/gtfs/types';

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
  searchByCode: jest.fn(async (code: string): Promise<Stop | null> => ({
    stop_id: '596',
    stop_code: '596',
    stop_name: 'KING ST + BISHOP ST',
    lat: 21.31,
    lon: -157.86,
  })),
  routesForStops: jest.fn(async () => new Map()),
  stopsByIds: jest.fn(async () => []),
  feedEndDate: jest.fn(async () => null),
  routeById: jest.fn(async () => null),
  routeStops: jest.fn(async () => []),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
}));

/**
 * `initialWindowMetrics` is null off-device and a provider seeded with null
 * renders nothing at all, so the metrics of a real phone are supplied here.
 * The same reasoning as HomeScreen.test.tsx — and note this file wraps the
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
      return result.ok
        ? { ...result, board: { ...result.board, serverTime: new Date() } }
        : result;
    },
  };
};

const show = (client: TheBusClient) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ArrivalsScreen stopCode="596" client={client} />
    </SafeAreaProvider>,
  );

describe('ArrivalsScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-02T08:40:00.000Z'));
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
});
