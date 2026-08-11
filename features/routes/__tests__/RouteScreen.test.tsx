import { StyleSheet } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { NOTICES, RouteScreen, SHOW_ON_MAP_LABEL } from '../RouteScreen';
import { showOnMap } from '../../map/showOnMap';
import { showRowMenu, type RowAction } from '../../../lib/rowMenu';
import type { RouteDirection } from '../../../data/gtfs/db';
import type { RouteSummary, Stop } from '../../../data/gtfs/types';
import { TestTheme } from '../../../lib/testing/theme';

const stop = (id: string, name: string): Stop => ({
  stop_id: id,
  stop_code: id,
  stop_name: name,
  lat: 21.3,
  lon: -157.8,
});

const mockQueries = {
  nearby: jest.fn(async () => []),
  searchByName: jest.fn(async () => []),
  searchByCode: jest.fn(async () => null),
  routesForStops: jest.fn(async () => new Map()),
  stopsByIds: jest.fn(async () => []),
  feedEndDate: jest.fn(async () => null),
  routeById: jest.fn(async (): Promise<RouteSummary | null> => ({
    route_id: '1',
    short_name: '1',
    long_name: 'KALIHI - WAIKIKI',
  })),
  routeStops: jest.fn(async (): Promise<RouteDirection[]> => [
    {
      directionId: '0',
      // RouteScreen draws no line — the shape is the map's business. It is here
      // because the query returns it, not because this screen reads it.
      shapeId: 's-out',
      headsigns: ['DILLINGHAM BLVD'],
      stops: [stop('3152', 'KALIHI TRANSIT CENTER'), stop('3223', 'DILLINGHAM BLVD')],
    },
    {
      directionId: '1',
      shapeId: 's-back',
      headsigns: ['KALIHI TRANSIT CENTER'],
      stops: [stop('3223', 'DILLINGHAM BLVD'), stop('3152', 'KALIHI TRANSIT CENTER')],
    },
  ]),
};

jest.mock('../../map/showOnMap', () => ({ showOnMap: jest.fn() }));
jest.mock('../../../lib/rowMenu', () => ({ showRowMenu: jest.fn(async () => {}) }));

const asked = jest.mocked(showOnMap);
const menu = jest.mocked(showRowMenu);

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const show = (routeId = '1') =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TestTheme>
        <RouteScreen routeId={routeId} />
      </TestTheme>
    </SafeAreaProvider>,
  );

describe('RouteScreen', () => {
  afterEach(async () => {
    await cleanup();
    jest.clearAllMocks();
  });

  it('names the route', async () => {
    await show();
    screen.getByText('Route 1');
    screen.getByText('KALIHI - WAIKIKI');
  });

  /** See `StopCard`'s equivalent. A long route is exactly the list that needs
   *  to scroll and exactly the one that would not. */
  it('gives the stop list room to scroll in', async () => {
    await show();

    expect(StyleSheet.flatten(screen.getByTestId('route-stops').props.style).flex).toBe(1);
  });

  it('carries the required attribution', async () => {
    await show();
    screen.getByText(/provided by permission of Oahu Transit Services, Inc/);
  });

  it('lists the stops in the order the route serves them', async () => {
    await show();
    // Position, not just presence: the sequence is what makes this a route
    // rather than a set of stops, and stop names carry no order themselves.
    const numbered = screen.getAllByText(/^[12]$/);
    expect(numbered.length).toBeGreaterThan(0);
    screen.getAllByText('KALIHI TRANSIT CENTER');
    screen.getAllByText('DILLINGHAM BLVD');
  });

  it('labels each direction by where it ends up, not by the feed’s 0 and 1', async () => {
    // "Direction 0" tells a rider nothing; GTFS never says which is which.
    await show();
    screen.getByText('Toward DILLINGHAM BLVD');
    screen.getByText('Toward KALIHI TRANSIT CENTER');
    expect(screen.queryByText(/Direction 0/)).toBeNull();
  });

  it('says so when the bundled data has no such route', async () => {
    mockQueries.routeById.mockResolvedValueOnce(null);
    mockQueries.routeStops.mockResolvedValueOnce([]);

    await show('nope');

    screen.getByText(NOTICES.unknownRoute);
  });

  it('says so when a real route has no stops recorded', async () => {
    // Distinct from the unknown-route case: the route exists, the ordering
    // data does not, and those are different problems with the build.
    mockQueries.routeStops.mockResolvedValueOnce([]);

    await show();

    screen.getByText(NOTICES.noStops);
    expect(screen.queryByText(NOTICES.unknownRoute)).toBeNull();
  });
});

/**
 * This screen is a list of names and a sequence; the map is where a route has a
 * shape. Until 2026-08-10 the only way across was the route *search's*
 * long-press menu, which is a strange place to go back to when you are already
 * looking at the route.
 */
describe('RouteScreen’s ways onto the map', () => {
  beforeEach(() => {
    asked.mockClear();
    menu.mockClear();
  });

  it('offers to draw the whole route on the map', async () => {
    await show();

    await fireEvent.press(await screen.findByLabelText(SHOW_ON_MAP_LABEL));

    expect(asked).toHaveBeenCalledWith({ kind: 'route', routeId: '1' });
  });

  it('offers no such control for a route the asset does not carry', async () => {
    mockQueries.routeById.mockResolvedValueOnce(null);
    await show();

    await screen.findByText(NOTICES.unknownRoute);
    expect(screen.queryByLabelText(SHOW_ON_MAP_LABEL)).toBeNull();
  });

  /** A tap opens arrivals, so the map is what the long press is for. */
  it('offers a stop on the map from a long press', async () => {
    await show();

    // The route calls at this stop in both directions, so there are two rows.
    const [row] = await screen.findAllByLabelText('Arrivals at KALIHI TRANSIT CENTER');
    await fireEvent(row!, 'longPress');

    const actions: readonly RowAction[] = menu.mock.calls.at(-1)?.[0] ?? [];
    expect(actions.map((a) => a.label)).toEqual(['Show stop on map']);

    actions[0]?.run();
    expect(asked).toHaveBeenCalledWith({ kind: 'stop', stopId: '3152' });
  });
});
