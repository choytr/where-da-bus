import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { MapScreen } from '../MapScreen';
import { MEDIUM_DETENT, PEEK_DETENT, detentsFor, tabBarOverlapOf, visibleAbove } from '../StopSheet';
import { centredOn } from '../region';
import { SEARCH_PLACEHOLDER } from '../SearchBar';
import type { Place } from '../address';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';
import { NOTICES } from '../../arrivals/board';
import type { RouteSummary, Stop, StopWithDistance } from '../../../data/gtfs/types';
import type { ArrivalsResult } from '../../../data/thebus/types';
import type { TheBusClient } from '../../../data/thebus';
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
        {/* The zoom lockout after a pin tap is a prop on the map and nothing
            else, so the double reports it the way it reports a camera move. */}
        <Text>{`zoomEnabled: ${props.zoomEnabled !== false}`}</Text>
        {/* `mapPadding` becomes `layoutMargins` on Apple Maps, which is what
            positions the compass. Reported so a test can read what the screen
            asked for; where MapKit then draws is a device question. */}
        <Text>{`mapPadding top: ${props.mapPadding?.top}`}</Text>
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
        {/* A rider zoomed down to a street: spans well inside the 1.5 km the
            query frames, so a reframe would be visible as one. */}
        <Pressable
          accessibilityLabel="zoom in close"
          onPress={() =>
            onRegionChangeComplete?.({
              latitude: 21.3069,
              longitude: -157.8583,
              latitudeDelta: 0.004,
              longitudeDelta: 0.004,
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

  /**
   * `title` is rendered under a label of its own rather than as bare text.
   * A `Marker` with a `title` is a `Marker` MapKit will draw its own callout
   * for and select by itself, which is the state disagreement `StopMarker`
   * exists to end — so a test has to be able to see the prop distinctly from
   * the name the marker now draws in its own view.
   */
  const MockMarker = ({ title, onPress, identifier, children }: any) => (
    <Pressable accessibilityLabel={`pin ${identifier}`} onPress={() => onPress?.(press)}>
      {title === undefined ? null : <Text>{`native callout: ${title}`}</Text>}
      {children}
    </Pressable>
  );

  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
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

/**
 * One object, held still. The real `useStopQueries` returns `useCallback`-stable
 * functions, and `useSearch` keys its debounce effect on those identities — so
 * a factory minting a fresh `jest.fn` per render would restart the debounce on
 * every render and no search would ever resolve.
 */
const mockQueries = {
  nearby: mockNearby,
  routesForStops: mockRoutesForStops,
  searchByName: jest.fn(async (_query: string): Promise<Stop[]> => []),
  searchByCode: jest.fn(async (_code: string): Promise<Stop | null> => null),
  searchRoutes: jest.fn(async (_query: string): Promise<RouteSummary[]> => []),
  stopsByIds: jest.fn(async (): Promise<Stop[]> => []),
  feedEndDate: jest.fn(async (): Promise<string | null> => null),
};

jest.mock('../../../data/gtfs/db', () => ({
  useStopQueries: () => mockQueries,
  NEARBY_RADIUS_METERS: 1500,
}));

/**
 * The router, so "a stop result does not leave the map" can be asserted as the
 * absence of a navigation rather than as the presence of a card. A route result
 * is the one thing here that *does* navigate.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href) },
}));

/**
 * The geocoder, doubled at the module boundary rather than injected: the
 * overlay is the one place that knows about `expo-location`, which is what
 * keeps `features/map/address.ts` testable without it. `useLocation` is doubled
 * separately, so nothing here touches the real module either way.
 */
const mockGeocode = jest.fn(
  async (_address: string): Promise<{ latitude: number; longitude: number }[]> => [],
);
const mockReverseGeocode = jest.fn(async (): Promise<Place[]> => []);

jest.mock('expo-location', () => ({
  geocodeAsync: (address: string) => mockGeocode(address),
  reverseGeocodeAsync: () => mockReverseGeocode(),
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

/**
 * Handed to the screen as a prop rather than mocked into the module graph.
 * Before Increment 4 this replaced the whole data/thebus barrel to substitute a
 * module-level `theBus`; that instance is gone, because the AppID belongs to
 * the user and the client is rebuilt whenever it changes. The route reads the
 * real one from `useTheBus()`.
 */
const client: TheBusClient = {
  arrivals: jest.fn(async (stopCode: string, options?: { signal?: AbortSignal }) => {
    mockArrivalCalls.push({ stopCode, signal: options?.signal });
    return mockArrivalsResult;
  }),
};

/**
 * The opacity of the name drawn under a pin, or null if no marker carries that
 * name at all.
 *
 * Presence is the wrong question now. `StopMarker` keeps its label mounted at
 * all times and hides it with opacity, because adding and removing that child
 * threw markers to the top-left corner of a real device — see the note in that
 * file. So the sheet's row and the map's label are both always in the tree, and
 * the one under the pin is the one whose style carries an opacity.
 */
const labelOpacity = (name: string): number | null => {
  for (const node of screen.queryAllByText(name)) {
    const style = StyleSheet.flatten(node.props.style);
    if (style !== undefined && typeof style.opacity === 'number') return style.opacity;
  }
  return null;
};

/**
 * `lon` is a parameter only because the label tests need a stop the close-zoom
 * camera can actually see. Labels are culled to the visible rectangle on both
 * axes, and the default longitude sits well off the right-hand edge at that
 * zoom — which is correct behaviour, and which no other test cares about.
 */
const stop = (
  id: string,
  name: string,
  meters: number,
  lon = -157.85,
): StopWithDistance => ({
  stop_id: id,
  stop_code: id,
  stop_name: name,
  lat: 21.3 + Number(id) / 1000,
  lon,
  meters,
});

/** Centred under the close-zoom camera, so its name is on screen to be read. */
const IN_VIEW_LON = -157.8583;

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/**
 * What `useBottomTabBarHeight()` reports on the device the metrics above
 * describe: 49 pt of bar over a 34 pt inset. The screen takes it as a prop
 * rather than reading it, because that hook throws outside a navigator and this
 * suite deliberately does not stand one up.
 */
const TAB_BAR_HEIGHT = 83;

/**
 * The camera the "zoom in close" button reports, so a test can say what
 * framing against a given detent would produce from it.
 */
const CLOSE_CAMERA = {
  latitude: 21.3069,
  longitude: -157.8583,
  latitudeDelta: 0.004,
  longitudeDelta: 0.004,
};

/**
 * Where the camera lands if stop 5 is centred in the map left visible above
 * `detent`.
 *
 * Built from the screen's own helpers rather than from a literal, so tuning
 * `MEDIUM_FRACTION` on a device does not break a test about which detent was
 * chosen. `onLayout` never fires under Jest, so the screen falls back to the
 * window and the tab bar counts as overlapping it — the same two inputs here.
 */
function framedAgainst(detent: number) {
  const windowHeight = Dimensions.get('window').height;
  const detents = detentsFor(
    windowHeight,
    tabBarOverlapOf(windowHeight, windowHeight, TAB_BAR_HEIGHT),
    METRICS.insets.top,
  );
  return centredOn(
    CLOSE_CAMERA,
    { lat: 21.305, lon: -157.85 },
    visibleAbove(detents, detent, windowHeight),
  );
}

function show() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TestTheme>
        <MapScreen client={client} tabBarHeight={TAB_BAR_HEIGHT} />
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
    // `clearAllMocks` clears call records, not implementations, so the defaults
    // have to be re-established rather than merely declared above.
    mockQueries.searchByName.mockResolvedValue([]);
    mockQueries.searchByCode.mockResolvedValue(null);
    mockQueries.searchRoutes.mockResolvedValue([]);
    mockQueries.stopsByIds.mockResolvedValue([]);
    mockQueries.feedEndDate.mockResolvedValue(null);
    mockGeocode.mockResolvedValue([]);
    mockReverseGeocode.mockResolvedValue([]);
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

  it('writes a stop name on the map once the camera is close enough', async () => {
    // Truman, 2026-08-08, with screenshots of Apple Maps and Google Maps: both
    // put the name beside the icon and neither hides it behind a bubble.
    //
    // Stop '7' rather than '5' because `stop` derives latitude from the id, and
    // only '7' lands near the centre of the close-zoom camera. Anything much
    // further south falls behind the sheet, where labels are deliberately not
    // spent.
    mockNearby.mockResolvedValue([stop('7', 'LAGOON DR', 120, IN_VIEW_LON)]);

    await show();
    await waitFor(() => screen.getByLabelText('pin 7'));
    await fireEvent.press(screen.getByLabelText('zoom in close'));

    await waitFor(() => expect(labelOpacity('LAGOON DR')).toBe(1));
  });

  it('writes no names at the zoom the map opens on', async () => {
    // The default framing is the whole 1.5 km query radius, and that is the
    // zoom at which every name at once became the heap in IMG_4479. Nothing
    // but the selection is labelled until a rider comes closer.
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);

    await show();

    await waitFor(() => screen.getByLabelText('pin 5'));
    // Mounted, and invisible. Unmounting it is what moved the pins.
    expect(labelOpacity('LAGOON DR')).toBe(0);
  });

  it('stops the map zooming for a moment after a pin is tapped', async () => {
    // Tapping two pins in quick succession was being counted as a double tap,
    // and iOS zoomed. The zooming recogniser is MKMapView's own and is not
    // exposed, so the map is simply told not to zoom for slightly longer than
    // the system's double-tap window.
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);
    await show();
    await waitFor(() => screen.getByLabelText('pin 5'));

    screen.getByText('zoomEnabled: true');
    await fireEvent.press(screen.getByLabelText('pin 5'));

    screen.getByText('zoomEnabled: false');
  });

  it('gives zooming back once the double-tap window has passed', async () => {
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);
    await show();
    await waitFor(() => screen.getByLabelText('pin 5'));
    await fireEvent.press(screen.getByLabelText('pin 5'));

    // A pinch a second later has to work, or the cure is worse than the zoom.
    await waitFor(() => screen.getByText('zoomEnabled: true'));
  });

  it('keeps the label mounted when its visibility changes', async () => {
    // The regression that put two markers in the top-left corner of a real
    // device, IMG_4524. Adding or removing a child inside a react-native-maps
    // marker is a mount instruction against a view whose subviews belong to
    // MapKit, and the two come apart; hidden-with-opacity never mounts or
    // unmounts anything. Counted rather than inspected, because what must not
    // happen is the node going away.
    mockNearby.mockResolvedValue([stop('7', 'LAGOON DR', 120, IN_VIEW_LON)]);

    await show();
    await waitFor(() => screen.getByLabelText('pin 7'));
    const before = screen.getAllByText('LAGOON DR').length;

    await fireEvent.press(screen.getByLabelText('zoom in close'));
    await waitFor(() => expect(labelOpacity('LAGOON DR')).toBe(1));

    expect(screen.getAllByText('LAGOON DR')).toHaveLength(before);
  });

  it('leaves MapKit no callout of its own to open', async () => {
    // A `title` hands MapKit a callout *and* an annotation selection it manages
    // itself, which nothing here can see or synchronise with `selectedStop`.
    // On a device the two disagreed in both directions: a callout up over an
    // unselected sheet, and a selected sheet with no pin marked at all.
    mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);

    await show();

    await waitFor(() => screen.getByLabelText('pin 5'));
    expect(screen.queryByText(/native callout/)).toBeNull();
  });

  it('carries the required attribution in the sheet', async () => {
    await show();
    // Off the peek, where the sheet is showing something to attribute. At rest
    // it is a grab handle over the tab bar and presents no Data at all — see
    // `StopSheet` and `lib/Attribution.tsx`.
    await fireEvent.press(screen.getByLabelText('settle the sheet at 1'));

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

  it('does not query on a long press until the offer is pressed', async () => {
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

    await fireEvent.press(screen.getByLabelText('pin pending-anchor'));

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
    //
    // A little north of it: the peek is the grab handle, one band, one row, and
    // whatever the tab bar covers — 243 pt here, against the 750 × 1334 window
    // React Native reports under Jest. `onLayout` never fires off-device, so
    // the screen falls back to the window and the bar counts as overlapping it.
    expect(mockNearby).toHaveBeenLastCalledWith({
      lat: expect.closeTo(21.4527, 4),
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

  it('says nothing about location before it has asked', async () => {
    // The launch flash, reported 2026-08-09 with a screen recording taken to
    // read it by: "Showing downtown Honolulu. Tap ⌖ to use your location."
    // appeared on every single launch and vanished immediately.
    //
    // It could not have done anything else. `onMapReady` calls
    // `requestLocation()` from `idle`, so `idle` lasts exactly from the map's
    // first frame until the request goes out — a window nobody can read, let
    // alone act on. The banner now waits for an answer.
    await show();

    expect(screen.queryByText(/Tap ⌖/)).toBeNull();
    expect(screen.queryByText(/Showing downtown Honolulu/)).toBeNull();
  });

  it('still explains a location error, which is a state a rider sits in', async () => {
    // The other half of the change above: suppressing the premature banner must
    // not suppress the two that are worth reading.
    mockLocation.status = 'error';

    await show();

    screen.getByText(/Could not get your location/);
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

  it('does not move the camera when a pin is tapped', async () => {
    // A pin *is* the thing on the map, already under the thumb, so travelling
    // to it reads as the map lurching for no reason. Truman's call on
    // 2026-08-09, made against the argument that a pin tapped low on screen
    // ends up behind the risen sheet — a cost to look for on a device rather
    // than to pre-empt with logic. A row tap is the opposite case; see below.
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
    // travelling waits for the offer — the press that says yes.
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByLabelText('long press the map'));
    expect(mockCameraMoves).toEqual([]);

    await fireEvent.press(screen.getByLabelText('pin pending-anchor'));

    await waitFor(() => {
      expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.45, lon: -157.95 });
    });
    expect(mockCameraMoves).toHaveLength(1);
  });

  it('keeps the rider’s zoom when Search here is pressed', async () => {
    // Truman, 2026-08-03, off the device: going to a point is not a reason to
    // throw away a zoom he set. The camera travels; it does not reframe.
    await show();
    await waitFor(() => {
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    // A rider zoomed in well past the 1.5 km the query frames.
    await fireEvent.press(screen.getByLabelText('zoom in close'));

    await fireEvent.press(screen.getByLabelText('long press the map'));
    await fireEvent.press(screen.getByLabelText('pin pending-anchor'));

    await waitFor(() => {
      expect(mockCameraMoves).toHaveLength(1);
    });
    expect(mockCameraMoves[0]).toMatchObject({
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    });
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
      // Both stops are rows again, not just the one that was open, and at the
      // zoom the map opens on neither pin is showing its name.
      expect(screen.getAllByText('LAGOON DR').length).toBeGreaterThan(0);
      expect(screen.getAllByText('KAPALULU PL').length).toBeGreaterThan(0);
      expect(labelOpacity('LAGOON DR')).toBe(0);
      expect(labelOpacity('KAPALULU PL')).toBe(0);
    });

    it('centres the map on a stop chosen from the list', async () => {
      // A row names a stop the rider cannot see: the map behind the sheet is
      // showing whatever it was showing before. So the map goes to it — which
      // is the only thing that makes the list and the map one view rather than
      // two.
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });

      await fireEvent.press(screen.getByLabelText('Arrivals at LAGOON DR'));

      await waitFor(() => {
        expect(mockCameraMoves).toHaveLength(1);
      });
      expect(mockCameraMoves[0]).toMatchObject({ longitude: -157.85 });
    });

    it('centres against the medium detent, not the one the sheet is leaving', async () => {
      // Selection *raises* the sheet, so framing against the peek it is leaving
      // would put the stop under where the sheet is about to be.
      //
      // **Derived, not hard-coded.** This used to assert a literal latitude,
      // which made `MEDIUM_FRACTION` — Truman's tuning knob, changed by eye on
      // a device — break a test about something else entirely. What is under
      // test is *which detent the screen framed against*, so the two candidates
      // are computed from the same helpers the screen uses and the assertion is
      // that it picked one of them. The helpers have their own unit tests.
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });
      // A known camera, so there is something for the framing to be about.
      await fireEvent.press(screen.getByLabelText('zoom in close'));

      await fireEvent.press(screen.getByLabelText('Arrivals at LAGOON DR'));

      await waitFor(() => {
        expect(mockCameraMoves).toHaveLength(1);
      });
      expect(mockCameraMoves[0]).toMatchObject(framedAgainst(MEDIUM_DETENT));
      expect(mockCameraMoves[0]).not.toMatchObject(framedAgainst(PEEK_DETENT));
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

  /**
   * The map's own search: a bar that is always there, and a fullscreen search
   * over the map rather than beside it.
   *
   * Real timers throughout, like the rest of this suite — `useSearch` debounces
   * by 175 ms and `waitFor` covers that comfortably. Turning fake timers on for
   * these alone is the trap in `CLAUDE.md` that wedges the *next* suite.
   */
  describe('search', () => {
    const openSearch = () => fireEvent.press(screen.getByLabelText(SEARCH_PLACEHOLDER));

    /** Not one of the nearby stops: the point is that searching reaches stops
     *  the map is not currently showing. */
    const FOUND: Stop = {
      stop_id: '4242',
      stop_code: '4242',
      stop_name: 'ALA MOANA CENTER',
      lat: 21.2911,
      lon: -157.8434,
    };

    const findStop = async (query: string) => {
      await openSearch();
      await fireEvent.press(screen.getByLabelText('Search by stops'));
      await fireEvent.changeText(screen.getByLabelText('Find a stop by number or name'), query);
      await waitFor(() => screen.getByLabelText('ALA MOANA CENTER, stop 4242'));
      await fireEvent.press(screen.getByLabelText('ALA MOANA CENTER, stop 4242'));
    };

    it('opens the search from the bar', async () => {
      await show();
      // Nothing to type into until the bar is pressed — the bar is a button
      // wearing a field's clothes, because a real field over a map fights the
      // sheet's gestures through the keyboard.
      expect(screen.queryByLabelText('Find an address')).toBeNull();

      await openSearch();

      // And it opens on Address, which is the only filter the Stops tab lacks.
      screen.getByLabelText('Find an address');
      screen.getByLabelText('Search by address');
      screen.getByLabelText('Search by stops');
      screen.getByLabelText('Search by routes');
    });

    it('a stop result anchors the map and selects it', async () => {
      mockQueries.searchByName.mockResolvedValue([FOUND]);
      await show();
      await waitFor(() => {
        expect(mockNearby).toHaveBeenCalledTimes(1);
      });

      await findStop('ala moana');

      // The anchor moved to the stop, so the pins and the list are about it.
      await waitFor(() => {
        expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.2911, lon: -157.8434 });
      });
      // The card is open on it, without a second tap.
      await waitFor(() => {
        screen.getByLabelText('Back to nearby stops');
      });
      // And the camera went there. Framed, not panned: this is the map being
      // opened on somewhere, like ⌖, so the window is rebuilt from the query
      // radius rather than keeping whatever spans were on screen.
      expect(mockCameraMoves).toHaveLength(1);
      expect(mockCameraMoves[0]).toMatchObject({ longitude: -157.8434 });
    });

    it('a stop result does not leave the map', async () => {
      // The whole reason the map has a search of its own. The Stops tab already
      // pushes `/stop/[code]`; if this did too there would be nothing here the
      // other host could not do.
      mockQueries.searchByName.mockResolvedValue([FOUND]);
      await show();

      await findStop('ala moana');

      await waitFor(() => {
        screen.getByLabelText('Back to nearby stops');
      });
      expect(mockPush).not.toHaveBeenCalled();
      // The search closed behind it, and the map is what is on screen.
      expect(screen.queryByLabelText('Find a stop by number or name')).toBeNull();
      screen.getByLabelText('map surface');
    });

    it('closing the search leaves the camera where it was', async () => {
      await show();
      await waitFor(() => {
        expect(mockNearby).toHaveBeenCalledTimes(1);
      });

      await openSearch();
      await fireEvent.press(screen.getByLabelText('Close search'));

      expect(screen.queryByLabelText('Find an address')).toBeNull();
      screen.getByLabelText(SEARCH_PLACEHOLDER);
      // Opening and abandoning a search is not a thing that happened to the map.
      expect(mockCameraMoves).toEqual([]);
      expect(mockNearby).toHaveBeenCalledTimes(1);
    });

    it('opens the route screen by route_id, from a row showing neither', async () => {
      // `route_id: '25'` is route 32. The row shows the number on the bus and
      // the tap navigates by the id, and those must not be the same string.
      mockQueries.searchRoutes.mockResolvedValue([
        { route_id: '25', short_name: '32', long_name: 'Mapunapuna-Airport' },
      ]);
      await show();

      await openSearch();
      await fireEvent.press(screen.getByLabelText('Search by routes'));
      await fireEvent.changeText(screen.getByLabelText('Find a route by number or name'), '32');
      await waitFor(() => screen.getByLabelText('Route 32'));

      await fireEvent.press(screen.getByLabelText('Route 32'));

      expect(mockPush).toHaveBeenCalledWith('/route/25');
      // Closed behind the push, so it is not underneath the route screen on the
      // way back.
      expect(screen.queryByLabelText('Find a route by number or name')).toBeNull();
    });

    /**
     * Address mode, which is the only thing this host has that the Stops tab
     * cannot do at all — and the only filter that waits for a submit.
     *
     * The steering towards the island lives in `data/geocode/oahu.ts` and its
     * two-attempt behaviour is tested there; `features/map/address.ts` owns the
     * labelling. What is asserted here is what the *map* does about it, which
     * is nothing at all until a rider says Go.
     */
    describe('by address', () => {
      /** UH Manoa. */
      const CAMPUS = { latitude: 21.2969, longitude: -157.8171 };
      /** State College, Pennsylvania — what `"university"` really returned on
       *  a device, as one confident result. */
      const PENNSYLVANIA = { latitude: 40.7934, longitude: -77.86 };

      const CAMPUS_PLACE: Place = {
        streetNumber: '2500',
        street: 'Campus Rd',
        name: null,
        city: 'Honolulu',
      };

      const submitAddress = async (text: string) => {
        await openSearch();
        const field = screen.getByLabelText('Find an address');
        await fireEvent.changeText(field, text);
        await fireEvent(field, 'submitEditing');
      };

      it('confirms before moving the map', async () => {
        mockGeocode.mockResolvedValue([CAMPUS]);
        mockReverseGeocode.mockResolvedValue([CAMPUS_PLACE]);
        await show();
        await waitFor(() => {
          expect(mockNearby).toHaveBeenCalledTimes(1);
        });

        await submitAddress('2500 campus rd');

        await waitFor(() => {
          screen.getByText('Did you mean 2500 Campus Rd, Honolulu?');
        });
        // Asked, and nothing done yet. A bounding box makes a five-thousand
        // kilometre miss unlikely, not impossible, and the cost of being wrong
        // is a rider's whole view of the map.
        expect(mockCameraMoves).toEqual([]);
        expect(mockNearby).toHaveBeenCalledTimes(1);
      });

      it('anchors the map once confirmed', async () => {
        mockGeocode.mockResolvedValue([CAMPUS]);
        mockReverseGeocode.mockResolvedValue([CAMPUS_PLACE]);
        await show();
        await submitAddress('2500 campus rd');
        await waitFor(() => {
          screen.getByText('Did you mean 2500 Campus Rd, Honolulu?');
        });

        await fireEvent.press(screen.getByLabelText('Go to 2500 Campus Rd, Honolulu'));

        await waitFor(() => {
          expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.2969, lon: -157.8171 });
        });
        // Framed rather than panned: an address is the map being opened
        // somewhere else, not a hop across a street the rider is looking at.
        expect(mockCameraMoves).toHaveLength(1);
        expect(mockCameraMoves[0]).toMatchObject({ longitude: -157.8171 });
        // And the rider is back on the map, with no stop selected — an address
        // is a place, not a stop.
        expect(screen.queryByLabelText('Find an address')).toBeNull();
        expect(screen.queryByLabelText('Back to nearby stops')).toBeNull();
      });

      it('cancelling leaves the map alone', async () => {
        mockGeocode.mockResolvedValue([CAMPUS]);
        mockReverseGeocode.mockResolvedValue([CAMPUS_PLACE]);
        await show();
        await waitFor(() => {
          expect(mockNearby).toHaveBeenCalledTimes(1);
        });
        await submitAddress('2500 campus rd');
        await waitFor(() => {
          screen.getByText('Did you mean 2500 Campus Rd, Honolulu?');
        });

        await fireEvent.press(screen.getByLabelText('Not that address'));

        expect(screen.queryByText(/Did you mean/)).toBeNull();
        expect(mockCameraMoves).toEqual([]);
        expect(mockNearby).toHaveBeenCalledTimes(1);
        // Back to the field with the text intact: "not that place" is not
        // "forget what I typed".
        expect(screen.getByLabelText('Find an address').props.value).toBe('2500 campus rd');
      });

      it('an address off the island says so', async () => {
        mockGeocode.mockResolvedValue([PENNSYLVANIA]);
        await show();

        await submitAddress('university');

        await waitFor(() => {
          screen.getByText('That address is real, but it is not on Oahu.');
        });
        // Not a shrug. The rider typed something that exists, and being told
        // "no such address" would send them looking for a typo.
        expect(screen.queryByText('No address matched that.')).toBeNull();
        expect(mockCameraMoves).toEqual([]);
      });

      it('a failed lookup is not "no such address"', async () => {
        mockGeocode.mockRejectedValue(new Error('offline'));
        await show();

        await submitAddress('2500 campus rd');

        await waitFor(() => {
          screen.getByText('Could not look up that address.');
        });
        expect(screen.queryByText('No address matched that.')).toBeNull();
        expect(screen.queryByText(/not on Oahu/)).toBeNull();
      });

      it('searches straight away when the nudge sends a rider here', async () => {
        // The nudge is not a chip. A chip is a rider changing their mind; the
        // nudge is a rider answering "No stops match — search as an address"
        // with yes, and landing them on a filled field that has done nothing
        // makes them ask twice. Truman, 2026-08-09.
        mockGeocode.mockResolvedValue([CAMPUS]);
        mockReverseGeocode.mockResolvedValue([CAMPUS_PLACE]);
        await show();

        await openSearch();
        await fireEvent.press(screen.getByLabelText('Search by stops'));
        await fireEvent.changeText(
          screen.getByLabelText('Find a stop by number or name'),
          '2500 campus rd',
        );
        await waitFor(() => {
          screen.getByLabelText('No stops match — search as an address');
        });

        await fireEvent.press(screen.getByLabelText('No stops match — search as an address'));

        // No second submit: the confirmation arrives off the nudge's own tap.
        await waitFor(() => {
          screen.getByText('Did you mean 2500 Campus Rd, Honolulu?');
        });
      });

      it('does not geocode merely because the Address chip was tapped', async () => {
        // The other side of it. Tapping a chip is a mode change, and firing a
        // network lookup off the back of one is the app deciding it knew what
        // the rider meant.
        mockGeocode.mockResolvedValue([CAMPUS]);
        await show();

        await openSearch();
        await fireEvent.press(screen.getByLabelText('Search by stops'));
        await fireEvent.changeText(
          screen.getByLabelText('Find a stop by number or name'),
          '2500 campus rd',
        );
        await fireEvent.press(screen.getByLabelText('Search by address'));

        expect(mockGeocode).not.toHaveBeenCalled();
        expect(screen.queryByText(/Did you mean/)).toBeNull();
      });

      it('confirms with the typed text when the reverse lookup fails', async () => {
        // The geocode landed on the island; only its name is missing. Refusing
        // to move here would fail a search that had actually succeeded.
        mockGeocode.mockResolvedValue([CAMPUS]);
        mockReverseGeocode.mockRejectedValue(new Error('offline'));
        await show();

        await submitAddress('2500 campus rd');

        await waitFor(() => {
          screen.getByText('Did you mean 2500 campus rd?');
        });
        await fireEvent.press(screen.getByLabelText('Go to 2500 campus rd'));

        await waitFor(() => {
          expect(mockNearby).toHaveBeenLastCalledWith({ lat: 21.2969, lon: -157.8171 });
        });
      });
    });

    it('leaves the compass room below the bar and ⌖', async () => {
      // The bar is drawn across the map's top-right corner, which is where
      // MapKit puts the compass, and on a device it hid it — reported
      // 2026-08-09 with a screenshot of the compass peeking out from behind the
      // bar. `mapPadding` becomes `layoutMargins` on Apple Maps, which is what
      // moves the compass, so the top margin has to clear the bar *and* the ⌖
      // button under it, or the compass lands on the button instead.
      //
      // **A proxy.** Jest cannot see MapKit place anything; what is asserted is
      // that the screen asks for enough room. Confirm the compass itself on a
      // device.
      //
      // Asserted as the *invariant*, not as the number: `COMPASS_DROP` is a
      // knob for tuning on a device, and a test pinned to its current value
      // would break the moment it is turned. What must hold at any setting is
      // that the compass clears the button — and clearing ⌖ clears the bar
      // above it too, since ⌖ already does.
      await show();

      const recentre = StyleSheet.flatten(
        screen.getByLabelText('Centre on my location').props.style,
      );
      const reported = screen.getByText(/^mapPadding top:/).props.children;
      // `[^-\d]`, not `\D`: stripping the minus sign turns a compass shoved up
      // behind the search bar into a large positive number that sails past the
      // assertion below. Caught by setting `COMPASS_DROP` negative on purpose.
      const top = Number(String(reported).replace(/[^-\d]/g, ''));

      expect(top).toBeGreaterThanOrEqual(recentre.top + recentre.height);
    });

    it('carries the required attribution over the search results', async () => {
      // Unambiguous at the resting peek: the sheet omits the legend there,
      // showing no Data, so the only thing that can put it on screen is the
      // search — which presents stop and route names and therefore owes it.
      await show();
      expect(screen.queryByText(ATTRIBUTION)).toBeNull();

      await openSearch();

      screen.getByText(ATTRIBUTION);
    });
  });

  /**
   * The long-press state machine, driven hard on purpose.
   *
   * These exist because of the crash in docs/backlog.md, which Truman narrowed
   * to the tap-hold *Search here* gesture. They were written to *reproduce* it
   * and they do not: the JavaScript survives every order and repetition below.
   * That is the finding they record. Keeping them means the ruling-out stays
   * true rather than being a claim someone made once — and the paths they cover
   * (a stale `pending` captured by the offer, a marker replaced without being
   * dismissed) are ones nothing else exercises.
   *
   * The offer used to be a `Callout` raised by an imperative `showCallout()`
   * on the marker's ref, and this block used to carry a warning that the suite
   * structurally could not reach that call. It is gone: `PendingMarker` draws
   * the pill in its own view and there is no ref, no effect and no native
   * command left on this path. **That deletes one of the backlog's two crash
   * candidates without testing it, which is not the same as fixing the crash.**
   * The other candidate is untouched and these tests still cannot settle it:
   * taking up the offer unmounts the marker from inside its own press handler,
   * which is exactly what `searchHere` still does.
   */
  describe('the long-press anchor gesture, under abuse', () => {
    const longPress = () => fireEvent.press(screen.getByLabelText('long press the map'));
    const callout = () => fireEvent.press(screen.getByLabelText('pin pending-anchor'));
    const tapMap = () => fireEvent.press(screen.getByLabelText('map surface'));
    const panAway = () => fireEvent.press(screen.getByLabelText('pan the camera away'));

    it('survives twenty long presses each taken up in turn', async () => {
      mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);
      await show();
      await waitFor(() => screen.getByLabelText('pin 5'));

      for (let i = 0; i < 20; i++) {
        await longPress();
        await callout();
      }

      // Each one is a real anchor move, so each one pans. The count is the point:
      // nothing is being swallowed or doubled.
      expect(mockCameraMoves).toHaveLength(20);
    });

    it('replaces an undismissed marker rather than stacking a second one', async () => {
      await show();
      await longPress();
      await longPress();
      await longPress();

      // One marker, one offer — three presses do not leave two offers to tap.
      expect(screen.getAllByLabelText('pin pending-anchor')).toHaveLength(1);
      await callout();
      expect(mockCameraMoves).toHaveLength(1);
    });

    it('takes up an offer that the camera has since moved away from', async () => {
      // The offer closes over the coordinate the press landed on, and a pan in
      // between must not change which point gets searched.
      await show();
      await longPress();
      await panAway();
      await callout();

      expect(mockCameraMoves).toHaveLength(1);
    });

    it('keeps a pending offer alive across a selection, and clears the card when it is taken', async () => {
      mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120)]);
      await show();
      await waitFor(() => screen.getByLabelText('pin 5'));

      await longPress();
      await fireEvent.press(screen.getByLabelText('pin 5'));

      // Selecting a stop does not dismiss the marker — only a map tap and
      // taking the offer do — so the offer is still there to take.
      await waitFor(() => screen.getByLabelText('Back to nearby stops'));
      screen.getByLabelText('pin pending-anchor');

      await callout();

      // And taking it drops the card on purpose: the stop set behind that card
      // is about to be replaced, and a card for a stop no longer in the list
      // would go on polling for it.
      await waitFor(() => {
        expect(screen.queryByLabelText('Back to nearby stops')).toBeNull();
      });
      expect(mockCameraMoves).toHaveLength(1);
    });

    it('survives ten offers dismissed without being taken', async () => {
      await show();
      for (let i = 0; i < 10; i++) {
        await longPress();
        await tapMap();
      }

      expect(screen.queryByLabelText('pin pending-anchor')).toBeNull();
      expect(mockCameraMoves).toHaveLength(0);

      await longPress();
      await callout();
      expect(mockCameraMoves).toHaveLength(1);
    });

    it('survives the gesture interleaved with everything else on the screen', async () => {
      mockNearby.mockResolvedValue([stop('5', 'LAGOON DR', 120), stop('6', 'KAPALULU PL', 340)]);
      await show();
      await waitFor(() => screen.getByLabelText('pin 5'));

      for (let i = 0; i < 8; i++) {
        await longPress();
        await panAway();
        await callout();
        await fireEvent.press(screen.getByLabelText('pin 5'));
        await tapMap();
        await fireEvent.press(screen.getByLabelText('Centre on my location'));
      }

      // Still usable at the end of all that, which is the whole assertion.
      await longPress();
      screen.getByLabelText('pin pending-anchor');
    });
  });
});
