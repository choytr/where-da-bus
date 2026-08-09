import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { MapScreen } from '../MapScreen';
import { MEDIUM_DETENT } from '../StopSheet';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';
import { NOTICES } from '../../arrivals/board';
import type { RouteSummary, StopWithDistance } from '../../../data/gtfs/types';
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
      // would put the stop under where the sheet is about to be. Distinguished
      // by the southward shift `centredOn` applies: a quarter of the window at
      // medium, a sixth of it at the peek.
      await show();
      await waitFor(() => {
        screen.getByLabelText('pin 5');
      });
      // A known camera, so the arithmetic below has something to be about.
      await fireEvent.press(screen.getByLabelText('zoom in close'));

      await fireEvent.press(screen.getByLabelText('Arrivals at LAGOON DR'));

      await waitFor(() => {
        expect(mockCameraMoves).toHaveLength(1);
      });
      expect(mockCameraMoves[0]).toMatchObject({
        // Stop 5 sits at 21.305. Against the medium detent that is pushed
        // 0.0009° south; against the peek it would only be 0.0003°.
        latitude: expect.closeTo(21.3041, 4),
        longitude: -157.85,
        // Travelled, not reframed: the rider's zoom is untouched.
        latitudeDelta: 0.004,
      });
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
