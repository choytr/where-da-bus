import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { HomeScreen } from '../HomeScreen';
import type { RouteSummary, Stop, StopWithDistance } from '../../../data/gtfs/types';
import type { LocationState } from '../useLocation';

/**
 * The two boundaries this screen sits on — the GTFS query layer and the
 * location permission — are both native, so both are doubled here. Everything
 * else (favorites ordering, which notice a given state produces, what the list
 * ends up containing) is exercised through the real component and asserted on
 * rendered text, because the point of this screen is what a rider actually
 * sees when a piece of it is missing.
 *
 * Names are `mock`-prefixed because babel-plugin-jest-hoist lifts jest.mock()
 * above the imports and rejects factories that close over anything else.
 */
const mockQueries = {
  nearby: jest.fn(async (): Promise<StopWithDistance[]> => []),
  searchByName: jest.fn(async (query: string): Promise<Stop[]> => []),
  searchByCode: jest.fn(async (code: string): Promise<Stop | null> => null),
  routesForStops: jest.fn(
    async (stopIds: string[]): Promise<Map<string, RouteSummary[]>> => new Map(),
  ),
  stopsByIds: jest.fn(async (stopIds: string[]): Promise<Stop[]> => []),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
}));

const mockLocation: LocationState = {
  status: 'idle',
  coords: null,
  request: jest.fn(async () => {}),
};

jest.mock('../useLocation', () => ({
  useLocation: () => mockLocation,
}));

const mockFavorites = {
  loadFavorites: jest.fn(async (): Promise<string[]> => []),
  addFavorite: jest.fn(async (stopId: string): Promise<string[]> => [stopId]),
  removeFavorite: jest.fn(async (stopId: string): Promise<string[]> => []),
  isFavorite: (ids: string[], id: string) => ids.includes(id),
};

// The factory runs while `../HomeScreen` is being imported — before the
// `const` above is initialised — so it hands back thin wrappers that read
// `mockFavorites` at call time rather than the object itself.
jest.mock('../../../data/storage/favorites', () => ({
  loadFavorites: () => mockFavorites.loadFavorites(),
  addFavorite: (stopId: string) => mockFavorites.addFavorite(stopId),
  removeFavorite: (stopId: string) => mockFavorites.removeFavorite(stopId),
  isFavorite: (ids: string[], id: string) => mockFavorites.isFavorite(ids, id),
}));

const stopA: Stop = {
  stop_id: '5',
  stop_code: '5',
  stop_name: 'LAGOON DR + IOLANA PL',
  lat: 21.321687,
  lon: -157.907687,
};
const stopB: Stop = {
  stop_id: '6',
  stop_code: '6',
  stop_name: 'LAGOON DR + KAPALULU PL',
  lat: 21.319702,
  lon: -157.910531,
};

const noRoutes = new Map<string, RouteSummary[]>([
  ['5', []],
  ['6', []],
]);

// @testing-library/react-native@14.0.1 returns a Promise from `render`,
// `fireEvent.*` and `renderHook`; `screen` only populates once it resolves, so
// every call here is awaited (see dist/render.d.ts, dist/fire-event.d.ts).
describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueries.routesForStops.mockResolvedValue(noRoutes);
    mockQueries.nearby.mockResolvedValue([
      { ...stopA, meters: 120 },
      { ...stopB, meters: 480 },
    ]);
    mockQueries.searchByName.mockResolvedValue([]);
    mockQueries.searchByCode.mockResolvedValue(null);
    mockQueries.stopsByIds.mockResolvedValue([]);
    mockFavorites.loadFavorites.mockResolvedValue([]);
    mockLocation.status = 'idle';
    mockLocation.coords = null;
  });

  it('prompts for location before any is granted', async () => {
    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/stops near you/i));
  });

  it('says it is locating while the permission request is in flight', async () => {
    mockLocation.status = 'loading';

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/finding your location/i));
    expect(screen.queryByText(/stops near you/i)).toBeNull();
  });

  it('lists nearby stops once coordinates are available', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.32, lon: -157.9 };

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
    screen.getByText('LAGOON DR + KAPALULU PL');
    screen.getByText('120 m');
  });

  it('says when nothing is nearby rather than showing an empty list', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.32, lon: -157.9 };
    mockQueries.nearby.mockResolvedValue([]);

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/no stops found within walking distance/i));
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('remains usable when location is denied', async () => {
    mockLocation.status = 'denied';

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/search for a stop/i));
    expect(screen.queryByText('LAGOON DR + IOLANA PL')).toBeNull();
    screen.getByPlaceholderText(/stop number or name/i);
  });

  it('distinguishes a location failure from a location denial', async () => {
    mockLocation.status = 'error';

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/could not read your location/i));
    expect(screen.queryByText(/location is off/i)).toBeNull();
  });

  it('still shows favorites when location is denied', async () => {
    mockLocation.status = 'denied';
    mockFavorites.loadFavorites.mockResolvedValue(['9999']);
    mockQueries.stopsByIds.mockResolvedValue([
      { stop_id: '9999', stop_code: '9999', stop_name: 'FAR AWAY STOP', lat: 21.5, lon: -158.1 },
    ]);

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText('FAR AWAY STOP'));
    screen.getByText(/location is off/i);
  });

  it('searches by stop number when the query is numeric', async () => {
    mockQueries.searchByCode.mockResolvedValue(stopA);

    await render(<HomeScreen />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(/stop number or name/i),
      '5',
    );

    await waitFor(() => expect(mockQueries.searchByCode).toHaveBeenCalledWith('5'));
    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
    expect(mockQueries.searchByName).not.toHaveBeenCalled();
  });

  it('searches by name when the query is not numeric', async () => {
    mockQueries.searchByName.mockResolvedValue([stopA]);

    await render(<HomeScreen />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(/stop number or name/i),
      'lagoon',
    );

    await waitFor(() => expect(mockQueries.searchByName).toHaveBeenCalledWith('lagoon'));
    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
    expect(mockQueries.searchByCode).not.toHaveBeenCalled();
  });

  it('collapses a burst of typing into one query for the finished word', async () => {
    // Without the debounce this is one FTS query per keystroke, each one
    // dragging a route lookup behind it, for results nobody reads because the
    // rider is still typing.
    mockQueries.searchByName.mockResolvedValue([stopA]);

    await render(<HomeScreen />);
    const field = screen.getByPlaceholderText(/stop number or name/i);
    await fireEvent.changeText(field, 'l');
    await fireEvent.changeText(field, 'la');
    await fireEvent.changeText(field, 'lag');
    await fireEvent.changeText(field, 'lagoon');

    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
    expect(mockQueries.searchByName).toHaveBeenCalledTimes(1);
    expect(mockQueries.searchByName).toHaveBeenCalledWith('lagoon');
  });

  it('says it is searching while a query is in flight', async () => {
    mockQueries.searchByName.mockResolvedValue([stopA]);

    await render(<HomeScreen />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(/stop number or name/i),
      'lagoon',
    );

    screen.getByText(/searching/i);
    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
  });

  it('says a search matched nothing, in different words from having no stops nearby', async () => {
    mockQueries.searchByName.mockResolvedValue([]);

    await render(<HomeScreen />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(/stop number or name/i),
      'zzzz',
    );

    await waitFor(() => screen.getByText(/no stops match that/i));
    expect(screen.queryByText(/walking distance/i)).toBeNull();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('shows a favorited stop even when it is not nearby', async () => {
    // The favorite is deliberately absent from the nearby results: favorites
    // are resolved from the database, not scraped out of what is close by.
    mockFavorites.loadFavorites.mockResolvedValue(['9999']);
    const distant: Stop = {
      stop_id: '9999',
      stop_code: '9999',
      stop_name: 'FAR AWAY STOP',
      lat: 21.5,
      lon: -158.1,
    };
    mockQueries.stopsByIds.mockResolvedValue([distant]);
    mockQueries.routesForStops.mockResolvedValue(new Map([['9999', []]]));

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText('FAR AWAY STOP'));
  });

  it('pins a favorite above the nearer stops once it is starred', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.32, lon: -157.9 };
    mockFavorites.addFavorite.mockResolvedValue(['6']);
    mockQueries.stopsByIds.mockResolvedValue([stopB]);

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText('LAGOON DR + KAPALULU PL'));
    await fireEvent.press(
      screen.getByLabelText('Add LAGOON DR + KAPALULU PL to favorites'),
    );

    await waitFor(() =>
      screen.getByLabelText('Remove LAGOON DR + KAPALULU PL from favorites'),
    );
    expect(mockFavorites.addFavorite).toHaveBeenCalledWith('6');
    const names = screen.getAllByText(/^LAGOON DR/).map((node) => node.props.children);
    expect(names).toEqual(['LAGOON DR + KAPALULU PL', 'LAGOON DR + IOLANA PL']);
  });

  it('renders a stop the route lookup returned nothing for', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.32, lon: -157.9 };
    mockQueries.nearby.mockResolvedValue([{ ...stopA, meters: 120 }]);
    mockQueries.routesForStops.mockResolvedValue(new Map());

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText('LAGOON DR + IOLANA PL'));
  });

  it('reports a failed database read instead of an empty result', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.32, lon: -157.9 };
    mockQueries.nearby.mockRejectedValue(new Error('disk I/O error'));

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/something went wrong reading the stop list/i));
    expect(screen.queryByText(/no stops found within walking distance/i)).toBeNull();
  });

  it('reports a failure to read saved favorites', async () => {
    mockFavorites.loadFavorites.mockRejectedValue(new Error('storage unavailable'));

    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/something went wrong reading your saved favorites/i));
  });

  it('shows the required attribution', async () => {
    await render(<HomeScreen />);
    await waitFor(() =>
      screen.getByText(
        'Route and arrival data provided by permission of Oahu Transit Services, Inc',
      ),
    );
  });

  it('states it is not affiliated with the agency', async () => {
    await render(<HomeScreen />);
    await waitFor(() => screen.getByText(/not affiliated with or endorsed by/i));
  });
});
