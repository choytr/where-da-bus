import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { MapScreen } from '../MapScreen';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';
import type { RouteSummary, StopWithDistance } from '../../../data/gtfs/types';
import type { ArrivalsResult } from '../../../data/thebus/types';
import type { LocationState } from '../../stops/useLocation';

/**
 * `react-native-maps` and `@gorhom/bottom-sheet` are both doubled, for opposite
 * reasons. The map is a native view Jest cannot render at all. The sheet
 * *could* render, but its gesture and animation machinery would put every
 * assertion behind a layout pass that never happens off-device — and what is
 * being tested here is which stops reach the pins and the rows, not how a sheet
 * slides. The package's own `mock.js` exists for exactly this.
 *
 * Both doubles keep the props visible as rendered output, so a test can read
 * what a user would see or touch.
 */
jest.mock('react-native-maps', () => {
  const { View, Text, Pressable } = require('react-native');
  const MockMapView = ({ children, onPress }: any) => (
    <View>
      <Pressable
        accessibilityLabel="map surface"
        onPress={() =>
          onPress?.({ nativeEvent: { coordinate: { latitude: 21.4, longitude: -157.9 } } })
        }
      />
      {children}
    </View>
  );
  const MockMarker = ({ title, onPress, identifier }: any) => (
    <Pressable accessibilityLabel={`pin ${identifier}`} onPress={onPress}>
      <Text>{title}</Text>
    </Pressable>
  );
  return { __esModule: true, default: MockMapView, Marker: MockMarker };
});

/**
 * `__esModule: true` is not optional here. The shipped mock is CommonJS with a
 * `default` key and no `__esModule` flag, so babel's interop treats the whole
 * module object as the default export — and `<BottomSheet>` renders as
 * "element type is invalid ... got: object", which points nowhere near the
 * cause.
 */
jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  ...require('@gorhom/bottom-sheet/mock'),
}));

const mockNearby = jest.fn(async (): Promise<StopWithDistance[]> => []);
const mockRoutesForStops = jest.fn(
  async (): Promise<Map<string, RouteSummary[]>> => new Map(),
);

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => ({
    nearby: mockNearby,
    routesForStops: mockRoutesForStops,
    searchByName: jest.fn(async () => []),
    searchByCode: jest.fn(async () => null),
    stopsByIds: jest.fn(async () => []),
    feedEndDate: jest.fn(async () => null),
  }),
  NEARBY_RADIUS_METERS: 1500,
}));

const mockLocation: LocationState = {
  status: 'idle',
  coords: null,
  request: jest.fn(async () => {}),
};

jest.mock('../../stops/useLocation', () => ({
  useLocation: () => mockLocation,
}));

jest.mock('../../../data/storage/favorites', () => ({
  loadFavorites: jest.fn(async () => []),
  addFavorite: jest.fn(async (id: string) => [id]),
  removeFavorite: jest.fn(async () => []),
  isFavorite: (ids: string[], id: string) => ids.includes(id),
}));

/** Every arrivals request the expanded row makes, so aborts can be observed. */
const mockArrivalCalls: { stopCode: string; signal: AbortSignal | undefined }[] = [];
let mockArrivalsResult: ArrivalsResult = {
  ok: true,
  board: { stopCode: '5', serverTime: new Date('2026-08-02T22:00:00Z'), arrivals: [] },
};

jest.mock('../../../data/thebus', () => ({
  theBus: {
    arrivals: jest.fn(async (stopCode: string, options?: { signal?: AbortSignal }) => {
      mockArrivalCalls.push({ stopCode, signal: options?.signal });
      return mockArrivalsResult;
    }),
  },
}));

const stop = (id: string, name: string, meters: number): StopWithDistance => ({
  stop_id: id,
  stop_code: id,
  stop_name: name,
  lat: 21.3 + Number(id) / 1000,
  lon: -157.85,
  meters,
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function show() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TestTheme>
        <MapScreen />
      </TestTheme>
    </SafeAreaProvider>,
  );
}

describe('MapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockArrivalCalls.length = 0;
    mockNearby.mockResolvedValue([]);
    mockRoutesForStops.mockResolvedValue(new Map());
    mockLocation.status = 'idle';
    mockLocation.coords = null;
    mockArrivalsResult = {
      ok: true,
      board: { stopCode: '5', serverTime: new Date('2026-08-02T22:00:00Z'), arrivals: [] },
    };
  });

  it('renders a pin and a row for the same stops', async () => {
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120), stop('6', 'KAPALULU PL', 340)]);

    await show();

    await waitFor(() => {
      screen.getByLabelText('pin 5');
    });
    screen.getByLabelText('pin 6');
    // The sheet lists the same two, by name.
    expect(screen.getAllByText('LAGOON DR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('KAPALULU PL').length).toBeGreaterThan(0);
  });

  it('carries the required attribution at the top of the sheet', async () => {
    await show();
    screen.getByText(ATTRIBUTION);
  });

  it('moves the anchor when the map is tapped', async () => {
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('map surface'));

    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(2);
    });
    expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.4, lon: -157.9 });
  });

  it('prompts for location while it is showing the fallback', async () => {
    await show();
    screen.getByText(/Tap ⌖ to use your location/);
  });

  it('does not prompt once the location is known', async () => {
    mockLocation.status = 'granted';
    mockLocation.coords = { lat: 21.28, lon: -157.83 };

    await show();

    expect(screen.queryByText(/Tap ⌖ to use your location/)).toBeNull();
  });

  it('asks for location when recentre is tapped', async () => {
    await show();

    await fireEvent.press(screen.getByLabelText('Centre on my location'));

    expect(mockLocation.request).toHaveBeenCalledTimes(1);
  });

  it('says nothing is nearby without saying something failed', async () => {
    mockNearby.mockResolvedValue([]);

    await show();

    await waitFor(() => {
      screen.getByText('No stops within walking distance of here.');
    });
    expect(screen.queryByText(/Could not read the stop list/)).toBeNull();
  });

  it('says the lookup failed without saying nothing is nearby', async () => {
    mockNearby.mockRejectedValue(new Error('disk'));

    await show();

    await waitFor(() => {
      screen.getByText('Could not read the stop list on this device.');
    });
    expect(screen.queryByText('No stops within walking distance of here.')).toBeNull();
  });

  describe('selection', () => {
    beforeEach(() => {
      mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120), stop('6', 'KAPALULU PL', 340)]);
    });

    it('shows arrivals for a stop whose pin is tapped', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));

      await waitFor(() => {
        screen.getByLabelText('Open arrivals for LAGOON DR');
      });
      expect(mockArrivalCalls.map((c) => c.stopCode)).toContain('5');
    });

    it('reaches the same state from a row tap as from a pin tap', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      // The row, not the pin — "LAGOON DR" is rendered by both.
      await fireEvent.press(screen.getByLabelText('Arrivals at LAGOON DR'));

      await waitFor(() => {
        screen.getByLabelText('Open arrivals for LAGOON DR');
      });
    });

    it('polls only the selected stop, and stops when selection moves', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));
      await waitFor(() => {
        expect(mockArrivalCalls.some((c) => c.stopCode === '5')).toBe(true);
      });

      await fireEvent.press(screen.getByLabelText('pin 6'));

      await waitFor(() => {
        expect(mockArrivalCalls.some((c) => c.stopCode === '6')).toBe(true);
      });
      // The previous stop's row is gone, which is what tears its poll down.
      expect(screen.queryByLabelText('Open arrivals for LAGOON DR')).toBeNull();
      // And its in-flight request was abandoned rather than left running.
      const first = mockArrivalCalls.find((c) => c.stopCode === '5');
      expect(first?.signal?.aborted).toBe(true);
    });

    it('clears the selection when the anchor moves', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });
      await fireEvent.press(screen.getByLabelText('pin 5'));
      await waitFor(() => {
        screen.getByLabelText('Open arrivals for LAGOON DR');
      });

      await fireEvent.press(screen.getByLabelText('map surface'));

      await waitFor(() => {
        expect(screen.queryByLabelText('Open arrivals for LAGOON DR')).toBeNull();
      });
    });

    it('says no buses are due rather than looking like a failure', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));

      await waitFor(() => {
        screen.getByText('No buses due here right now.');
      });
      expect(screen.queryByText(/Could not reach the service/)).toBeNull();
    });

    it('says it could not reach the service rather than looking empty', async () => {
      mockArrivalsResult = { ok: false, failure: { kind: 'unreachable' } };

      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));

      await waitFor(() => {
        screen.getByText(/Could not reach the service/);
      });
      expect(screen.queryByText('No buses due here right now.')).toBeNull();
    });
  });
});
