import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { StopsScreen } from '../StopsScreen';
import type { RouteSummary, Stop } from '../../../data/gtfs/types';
import type { FavoritesRead } from '../../../data/storage/favorites';
import { TestTheme } from '../../../lib/testing/theme';

/**
 * The GTFS query layer is native, so it is doubled. Everything else — which
 * notice a given state produces, whether favorites or results are on screen —
 * runs through the real component and is asserted on rendered text, because
 * what this screen is *for* is what a rider sees.
 *
 * There is no location double here, and that is the point of the split: this
 * screen no longer asks where you are. Proximity belongs to the map tab.
 *
 * Names are `mock`-prefixed because babel-plugin-jest-hoist lifts jest.mock()
 * above the imports and rejects factories closing over anything else.
 */
const mockQueries = {
  nearby: jest.fn(async (): Promise<Stop[]> => []),
  searchByName: jest.fn(async (_query: string): Promise<Stop[]> => []),
  searchByCode: jest.fn(async (_code: string): Promise<Stop | null> => null),
  routesForStops: jest.fn(
    async (_stopIds: string[]): Promise<Map<string, RouteSummary[]>> => new Map(),
  ),
  stopsByIds: jest.fn(async (_stopIds: string[]): Promise<Stop[]> => []),
  feedEndDate: jest.fn(async (): Promise<string | null> => null),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
}));

/**
 * `readFavorites` delegates to `loadFavorites` by default so the dozen tests
 * that only care *which* favorites exist keep saying so in one line. A test
 * about storage being unreadable overrides `readFavorites` directly — that is
 * the state the lenient reader cannot express, which is why the screen uses
 * the other one.
 */
const mockFavorites = {
  loadFavorites: jest.fn(async (): Promise<string[]> => []),
  readFavorites: jest.fn(async (): Promise<FavoritesRead> => ({ available: true, ids: [] })),
  addFavorite: jest.fn(async (stopId: string): Promise<string[]> => [stopId]),
  removeFavorite: jest.fn(async (_stopId: string): Promise<string[]> => []),
  isFavorite: (ids: string[], id: string) => ids.includes(id),
};

jest.mock('../../../data/storage/favorites', () => ({
  loadFavorites: () => mockFavorites.loadFavorites(),
  readFavorites: () => mockFavorites.readFavorites(),
  addFavorite: (stopId: string) => mockFavorites.addFavorite(stopId),
  removeFavorite: (stopId: string) => mockFavorites.removeFavorite(stopId),
  isFavorite: (ids: string[], id: string) => mockFavorites.isFavorite(ids, id),
}));

/**
 * Written out, never derived from the clock. The bundled feed really does
 * expire, so a test computing "yesterday" would keep passing while asserting a
 * different thing every day. Boundary behaviour is proved against an injected
 * clock in data/gtfs/__tests__/feedValidity.test.ts.
 */
const LONG_EXPIRED_FEED = '20200101';
const FEED_VALID_FOR_DECADES = '20991231';

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

const IPHONE_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={IPHONE_METRICS}>
      <TestTheme>
        <StopsScreen />
      </TestTheme>
    </SafeAreaProvider>,
  );
}

/** The search field debounces by 175 ms before it asks the database anything. */
async function typeSearch(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Find a stop by number or name'), text);
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
}

describe('StopsScreen', () => {
  beforeEach(() => {
    // Call history leaks between tests otherwise, and the numeric-query test
    // asserts on what was *not* called.
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockQueries.searchByName.mockResolvedValue([]);
    mockQueries.searchByCode.mockResolvedValue(null);
    mockQueries.stopsByIds.mockResolvedValue([]);
    mockQueries.routesForStops.mockResolvedValue(new Map());
    mockQueries.feedEndDate.mockResolvedValue(FEED_VALID_FOR_DECADES);
    mockFavorites.loadFavorites.mockResolvedValue([]);
    // `clearAllMocks` clears call records, not implementations, so the default
    // has to be re-established rather than merely declared above.
    mockFavorites.readFavorites.mockImplementation(async () => ({
      available: true,
      ids: await mockFavorites.loadFavorites(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists saved favorites when the search field is empty', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['5', '6']);
    mockQueries.stopsByIds.mockResolvedValue([stopA, stopB]);

    await renderScreen();

    await waitFor(() => {
      screen.getByText('LAGOON DR + IOLANA PL');
    });
    screen.getByText('LAGOON DR + KAPALULU PL');
  });

  it('keeps favorites in the order they were saved, not the order the database returned', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['6', '5']);
    mockQueries.stopsByIds.mockResolvedValue([stopA, stopB]);

    await renderScreen();

    await waitFor(() => {
      screen.getByText('LAGOON DR + KAPALULU PL');
    });
    const names = screen.getAllByText(/^LAGOON DR/).map((node) => node.props.children);
    expect(names).toEqual(['LAGOON DR + KAPALULU PL', 'LAGOON DR + IOLANA PL']);
  });

  it('shows an empty state rather than a blank screen with no favorites and no query', async () => {
    await renderScreen();

    await waitFor(() => {
      screen.getByText('No saved stops yet');
    });
    screen.getByText(/tap its star to keep it here/);
  });

  it('replaces favorites with results once a query is typed', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['5']);
    mockQueries.stopsByIds.mockResolvedValue([stopA]);
    mockQueries.searchByName.mockResolvedValue([stopB]);

    await renderScreen();
    await waitFor(() => {
      screen.getByText('LAGOON DR + IOLANA PL');
    });

    await typeSearch('kapalulu');

    await waitFor(() => {
      screen.getByText('LAGOON DR + KAPALULU PL');
    });
    expect(screen.queryByText('LAGOON DR + IOLANA PL')).toBeNull();
  });

  it('looks a purely numeric query up by stop code, not by name', async () => {
    mockQueries.searchByCode.mockResolvedValue(stopA);

    await renderScreen();
    await typeSearch('596');

    await waitFor(() => {
      expect(mockQueries.searchByCode).toHaveBeenCalledWith('596');
    });
    expect(mockQueries.searchByName).not.toHaveBeenCalled();
  });

  it('says nothing matched rather than falling back to the empty state', async () => {
    await renderScreen();
    await typeSearch('zzzzz');

    await waitFor(() => {
      screen.getByText('No stops match that.');
    });
    // The favorites empty state would be a different claim entirely.
    expect(screen.queryByText('No saved stops yet')).toBeNull();
  });

  it('restores favorites when the query is cleared', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['5']);
    mockQueries.stopsByIds.mockResolvedValue([stopA]);
    mockQueries.searchByName.mockResolvedValue([stopB]);

    await renderScreen();
    await typeSearch('kapalulu');
    await waitFor(() => {
      screen.getByText('LAGOON DR + KAPALULU PL');
    });

    await typeSearch('');

    await waitFor(() => {
      screen.getByText('LAGOON DR + IOLANA PL');
    });
  });

  it('reports a failed lookup as a failure, not as an empty result', async () => {
    mockQueries.searchByName.mockRejectedValue(new Error('disk'));

    await renderScreen();
    await typeSearch('lagoon');

    await waitFor(() => {
      screen.getByText('Something went wrong reading the stop list on this device.');
    });
    expect(screen.queryByText('No stops match that.')).toBeNull();
  });

  it('says so when the bundled feed has expired', async () => {
    mockQueries.feedEndDate.mockResolvedValue(LONG_EXPIRED_FEED);

    await renderScreen();

    await waitFor(() => {
      screen.getByText(/published for service through 1 January 2020/i);
    });
  });

  it('says nothing about the feed while it is still current', async () => {
    await renderScreen();

    await waitFor(() => {
      screen.getByText('No saved stops yet');
    });
    expect(screen.queryByText(/published for service through/i)).toBeNull();
  });

  it('carries the attribution and the disclaimer', async () => {
    await renderScreen();

    screen.getByText('Route and arrival data provided by permission of Oahu Transit Services, Inc');
    screen.getByText(/unofficial app/i);
  });

  it('pins a matching favorite above the rest of the results', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['6']);
    mockQueries.stopsByIds.mockResolvedValue([stopB]);
    // The database returns the favorite last; it must still come out first.
    mockQueries.searchByName.mockResolvedValue([stopA, stopB]);

    await renderScreen();
    await typeSearch('lagoon');

    await waitFor(() => {
      screen.getByText('LAGOON DR + IOLANA PL');
    });
    const names = screen.getAllByText(/^LAGOON DR/).map((node) => node.props.children);
    expect(names).toEqual(['LAGOON DR + KAPALULU PL', 'LAGOON DR + IOLANA PL']);
  });

  it('shows a matching favorite the search itself missed', async () => {
    // Past searchByName's result limit, or matched by a code prefix that the
    // exact-code lookup cannot return. Either way the rider starred it, so it
    // has to be findable.
    mockFavorites.loadFavorites.mockResolvedValue(['6']);
    mockQueries.stopsByIds.mockResolvedValue([stopB]);
    mockQueries.searchByName.mockResolvedValue([]);

    await renderScreen();
    await typeSearch('kapalulu');

    await waitFor(() => {
      screen.getByText('LAGOON DR + KAPALULU PL');
    });
    // A pinned favorite is a match, so the empty notice must not appear.
    expect(screen.queryByText('No stops match that.')).toBeNull();
  });

  it('lists a favorite that is also a result exactly once', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['6']);
    mockQueries.stopsByIds.mockResolvedValue([stopB]);
    mockQueries.searchByName.mockResolvedValue([stopB]);

    await renderScreen();
    await typeSearch('kapalulu');

    await waitFor(() => {
      screen.getByText('LAGOON DR + KAPALULU PL');
    });
    expect(screen.getAllByText('LAGOON DR + KAPALULU PL')).toHaveLength(1);
  });

  it('pins a favorite whose code starts with a numeric query', async () => {
    // searchByCode is an exact lookup and returns nothing for a prefix, so
    // without the local match this favorite would be unreachable by number.
    mockFavorites.loadFavorites.mockResolvedValue(['6']);
    mockQueries.stopsByIds.mockResolvedValue([{ ...stopB, stop_code: '6123' }]);
    mockQueries.searchByCode.mockResolvedValue(null);

    await renderScreen();
    await typeSearch('61');

    await waitFor(() => {
      screen.getByText('LAGOON DR + KAPALULU PL');
    });
  });

  it('does not pin a favorite that has nothing to do with the query', async () => {
    mockFavorites.loadFavorites.mockResolvedValue(['6']);
    mockQueries.stopsByIds.mockResolvedValue([stopB]);
    mockQueries.searchByName.mockResolvedValue([stopA]);

    await renderScreen();
    await typeSearch('iolana');

    await waitFor(() => {
      screen.getByText('LAGOON DR + IOLANA PL');
    });
    expect(screen.queryByText('LAGOON DR + KAPALULU PL')).toBeNull();
  });

  it('never asks for location', async () => {
    // The whole reason the nearby list moved to the map tab: this screen works
    // identically with location switched off, and must not prompt for it.
    await renderScreen();
    expect(mockQueries.nearby).not.toHaveBeenCalled();
  });
});
