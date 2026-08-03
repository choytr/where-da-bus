import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { MapScreen } from '../MapScreen';
import { MEDIUM_DETENT } from '../StopSheet';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';
import { NOTICES } from '../../arrivals/board';
import type { RouteSummary, StopWithDistance } from '../../../data/gtfs/types';
import type { ArrivalsResult } from '../../../data/thebus/types';
import type { LocationState } from '../../stops/useLocation';
import type { Coords } from '../../../lib/distance';

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
/** Every camera move the screen asks for. The rule under test is mostly that
 *  this stays empty — the camera moves on ⌖ and the first fix, and nowhere. */
const mockCameraMoves: unknown[] = [];

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  const press = { stopPropagation: () => {} };

  const MockMapView = React.forwardRef((props: any, ref: any) => {
    const { children, onPress, onLongPress, onRegionChangeComplete } = props;
    React.useImperativeHandle(ref, () => ({
      animateToRegion: (region: unknown) => mockCameraMoves.push(region),
    }));

    return (
      <View>
        <Pressable
          accessibilityLabel="map surface"
          onPress={() =>
            onPress?.({
              ...press,
              nativeEvent: {
                coordinate: { latitude: 21.4, longitude: -157.9 },
              },
            })
          }
        />
        <Pressable
          accessibilityLabel="long press the map"
          onPress={() =>
            onLongPress?.({
              ...press,
              nativeEvent: {
                coordinate: { latitude: 21.45, longitude: -157.95 },
              },
            })
          }
        />
        <Pressable
          accessibilityLabel="the map finished drawing"
          onPress={() => props.onMapReady?.()}
        />
        {/* A camera settling a long way from the fallback anchor: about 16 km
              north, on a window roughly 3 km wide. */}
        <Pressable
          accessibilityLabel="pan the camera away"
          onPress={() =>
            onRegionChangeComplete?.({
              latitude: 21.45,
              longitude: -157.8583,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            })
          }
        />
        {/* And settling back over it: 220 m north, well inside a quarter of
            the same window. */}
        <Pressable
          accessibilityLabel="pan the camera back"
          onPress={() =>
            onRegionChangeComplete?.({
              latitude: 21.3089,
              longitude: -157.8583,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            })
          }
        />
        {children}
      </View>
    );
  });

  const MockMarker = ({ title, onPress, identifier, children }: any) => (
    <Pressable accessibilityLabel={`pin ${identifier}`} onPress={() => onPress?.(press)}>
      {title === undefined ? null : <Text>{title}</Text>}
      {children}
    </Pressable>
  );

  const MockCallout = ({ onPress, children }: any) => (
    <Pressable accessibilityLabel="callout" onPress={onPress}>
      {children}
    </Pressable>
  );

  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Callout: MockCallout,
  };
});

/**
 * `__esModule: true` is not optional here. The shipped mock is CommonJS with a
 * `default` key and no `__esModule` flag, so babel's interop treats the whole
 * module object as the default export — and `<BottomSheet>` renders as
 * "element type is invalid ... got: object", which points nowhere near the
 * cause.
 *
 * The sheet itself is replaced rather than reused. Its *height* is now part of
 * the screen's behaviour — selection must never lower it, and the map stops
 * taking touches at the top detent — and the shipped double renders children
 * while swallowing `onChange` and `snapToIndex` both. This one adds the two
 * things a test needs: a way to settle the sheet on a detent, and a record of
 * what the screen asked it to snap to.
 */
const mockSnapCalls: number[] = [];

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');

  const MockBottomSheet = React.forwardRef(({ children, onChange }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      snapToIndex: (index: number) => {
        mockSnapCalls.push(index);
        onChange?.(index);
      },
      snapToPosition: () => {},
      expand: () => {},
      collapse: () => {},
      close: () => {},
      forceClose: () => {},
    }));

    return (
      <View>
        {[0, 1, 2].map((index) => (
          <Pressable
            key={index}
            accessibilityLabel={`settle the sheet at ${index}`}
            onPress={() => onChange?.(index)}
          />
        ))}
        {children}
      </View>
    );
  });

  return {
    __esModule: true,
    ...require('@gorhom/bottom-sheet/mock'),
    default: MockBottomSheet,
  };
});

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

const mockRequest = jest.fn(async (): Promise<Coords | null> => null);

const mockLocation: LocationState = {
  status: 'idle',
  coords: null,
  request: mockRequest,
};

jest.mock('../../stops/useLocation', () => ({
  useLocation: () => mockLocation,
}));

/** The only route back from a denial, so a test has to be able to see it taken. */
const mockOpenSettings = jest.fn(async () => {});

jest.mock('expo-linking', () => ({ openSettings: () => mockOpenSettings() }));

jest.mock('../../../data/storage/favorites', () => ({
  loadFavorites: jest.fn(async () => []),
  addFavorite: jest.fn(async (id: string) => [id]),
  removeFavorite: jest.fn(async () => []),
  isFavorite: (ids: string[], id: string) => ids.includes(id),
}));

/** Every arrivals request the selected stop's card makes, so aborts can be observed. */
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
    mockSnapCalls.length = 0;
    mockCameraMoves.length = 0;
    mockRequest.mockResolvedValue(null);
    mockNearby.mockResolvedValue([]);
    mockRoutesForStops.mockResolvedValue(new Map());
    mockLocation.status = 'idle';
    mockLocation.coords = null;
    mockArrivalsResult = {
      ok: true,
      board: {
        stopCode: '5',
        serverTime: new Date('2026-08-02T22:00:00Z'),
        arrivals: [],
      },
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

  it('does not move the anchor when the map is tapped', async () => {
    // The reversal this pass exists for. A tap an inch wide of a pin used to
    // throw away the stop set and the card being read, together.
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('map surface'));

    expect(mockNearby).toHaveBeenCalledTimes(1);
  });

  it('clears the selection when the map is tapped', async () => {
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);
    await show();
    await waitFor(() => {
      screen.getByLabelText('pin 5');
    });
    await fireEvent.press(screen.getByLabelText('pin 5'));
    await waitFor(() => {
      screen.getByLabelText('Back to nearby stops');
    });

    await fireEvent.press(screen.getByLabelText('map surface'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Back to nearby stops')).toBeNull();
    });
  });

  it('does not query on a long press until the callout is pressed', async () => {
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('long press the map'));

    // A marker offering to search, and nothing asked for yet. The long press
    // itself moves nothing — not the stop set, not the anchor, not the camera.
    screen.getByLabelText('pin pending-anchor');
    expect(mockNearby).toHaveBeenCalledTimes(1);
    expect(mockCameraMoves).toEqual([]);

    await fireEvent.press(screen.getByLabelText('callout'));

    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(2);
    });
    expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.45, lon: -157.95 });
    // The offer is taken up and gone, not left standing on the map.
    expect(screen.queryByLabelText('pin pending-anchor')).toBeNull();
  });

  it('offers to search this area once the camera has moved away', async () => {
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByLabelText('Search this area')).toBeNull();

    await fireEvent.press(screen.getByLabelText('pan the camera away'));

    await fireEvent.press(screen.getByLabelText('Search this area'));

    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(2);
    });
    // The middle of what the rider can *see*, which at the peek detent is a
    // little north of the window's own 21.45 — the sheet covers the bottom.
    expect(mockNearby).toHaveBeenLastCalledWith({
      lat: expect.closeTo(21.4521, 4),
      lon: -157.8583,
    });
    // Re-anchored to the screen centre, so the offer is answered and retires.
    expect(screen.queryByLabelText('Search this area')).toBeNull();
  });

  it('keeps offering to search this area after the camera drifts back', async () => {
    // Truman, 2026-08-03: an offer that blinks out while you are reading the
    // map is worse than one that lingers. It stands until the anchor moves.
    await show();
    await fireEvent.press(screen.getByLabelText('pan the camera away'));
    screen.getByLabelText('Search this area');

    await fireEvent.press(screen.getByLabelText('pan the camera back'));

    screen.getByLabelText('Search this area');
  });

  it('stops the map receiving touches at full height', async () => {
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('settle the sheet at 2'));
    await fireEvent.press(screen.getByLabelText('map surface'));

    // The strip of map above a full-height sheet is all misses, so nothing
    // reaches it — no anchor move, no pin.
    expect(mockNearby).toHaveBeenCalledTimes(1);
  });

  it('asks for location once the map is ready', async () => {
    await show();
    expect(mockRequest).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('the map finished drawing'));

    // Over a drawn map, not over a grey rectangle, and not on mount.
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('does not ask again after a denial', async () => {
    // iOS shows its dialog once per install; asking again returns `denied`
    // silently, so the only thing a second request buys is a pointless call.
    mockLocation.status = 'denied';

    await show();
    await fireEvent.press(screen.getByLabelText('the map finished drawing'));

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('opens Settings when location was denied', async () => {
    mockLocation.status = 'denied';

    await show();
    await fireEvent.press(screen.getByLabelText('Turn on location in Settings'));

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    // Asking again would do nothing at all, which is the bug being closed.
    expect(mockRequest).not.toHaveBeenCalled();
    screen.getByText(/turn it on in Settings/);
  });

  it('retries after a location error', async () => {
    // Nothing was refused here, so there is a prompt still to be had.
    mockLocation.status = 'error';

    await show();
    await fireEvent.press(screen.getByLabelText('Centre on my location'));

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockOpenSettings).not.toHaveBeenCalled();
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

  it('asks for location when recentre is tapped, and goes there', async () => {
    mockRequest.mockResolvedValue({ lat: 21.28, lon: -157.83 });
    await show();

    await fireEvent.press(screen.getByLabelText('Centre on my location'));

    expect(mockRequest).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockCameraMoves).toHaveLength(1);
    });
  });

  it('does not move the camera when a stop is selected', async () => {
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);
    await show();
    await waitFor(() => {
      screen.getByLabelText('pin 5');
    });

    await fireEvent.press(screen.getByLabelText('pin 5'));

    await waitFor(() => {
      screen.getByLabelText('Back to nearby stops');
    });
    expect(mockCameraMoves).toEqual([]);
  });

  it('does not move the camera when Search this area re-anchors', async () => {
    // The rule this pass exists to state. A camera that travels under a rider
    // who did not ask was judged the worse failure than a map and a list that
    // disagree about how far "nearby" reaches. This control names the area
    // already on screen, so there is nothing to travel to.
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('pan the camera away'));
    await fireEvent.press(screen.getByLabelText('Search this area'));

    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(2);
    });
    expect(mockCameraMoves).toEqual([]);
  });

  it('centres the map when Search here is pressed, not when the long press lands', async () => {
    // The one exception, and Truman's call on 2026-08-03: a long press names a
    // point, often near an edge or under the sheet, so answering the question
    // without travelling to it puts the answer where it cannot be seen. The
    // travelling waits for the callout — the press that says yes.
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('long press the map'));
    expect(mockCameraMoves).toEqual([]);

    await fireEvent.press(screen.getByLabelText('callout'));

    await waitFor(() => {
      expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.45, lon: -157.95 });
    });
    expect(mockCameraMoves).toHaveLength(1);
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
        screen.getByLabelText('Back to nearby stops');
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
        screen.getByLabelText('Back to nearby stops');
      });
      expect(mockArrivalCalls.map((c) => c.stopCode)).toContain('5');
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
      // The card is about the new stop, so the old stop's poll is gone with it.
      screen.getByLabelText('Back to nearby stops');
      // And the in-flight request it left behind was abandoned, not left running.
      const first = mockArrivalCalls.find((c) => c.stopCode === '5');
      expect(first?.signal?.aborted).toBe(true);
    });

    it('returns to the nearby list from the card', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });
      await fireEvent.press(screen.getByLabelText('pin 5'));
      await waitFor(() => {
        screen.getByLabelText('Back to nearby stops');
      });

      await fireEvent.press(screen.getByLabelText('Back to nearby stops'));

      await waitFor(() => {
        expect(screen.queryByLabelText('Back to nearby stops')).toBeNull();
      });
      // Both stops are rows again, not just the one that was open. Two matches
      // apiece: the pin's title renders the name as well as the row does.
      expect(screen.getAllByText('LAGOON DR').length).toBeGreaterThan(1);
      expect(screen.getAllByText('KAPALULU PL').length).toBeGreaterThan(1);
    });

    it('raises the sheet to medium when a stop is selected from peek', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));

      expect(mockSnapCalls).toEqual([MEDIUM_DETENT]);
    });

    it('does not lower the sheet when a stop is selected at full height', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });
      await fireEvent.press(screen.getByLabelText('settle the sheet at 2'));

      // From the row: at full height the map is not taking touches at all.
      await fireEvent.press(screen.getByLabelText('Arrivals at LAGOON DR'));

      await waitFor(() => {
        screen.getByLabelText('Back to nearby stops');
      });
      // Selecting took back none of the height the rider had asked for.
      expect(mockSnapCalls).toEqual([]);
    });

    it('says no buses are due rather than looking like a failure', async () => {
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));

      await waitFor(() => {
        screen.getByText(NOTICES.empty);
      });
      expect(screen.queryByText(NOTICES.unreachable)).toBeNull();
    });

    it('says it could not reach the service rather than looking empty', async () => {
      mockArrivalsResult = { ok: false, failure: { kind: 'unreachable' } };

      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('pin 5'));

      await waitFor(() => {
        screen.getByText(NOTICES.unreachable);
      });
      expect(screen.queryByText(NOTICES.empty)).toBeNull();
    });
  });
});
