import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { MapScreen, COMPASS_LAYOUT_OFFSET, SEARCH_AREA_LABEL } from '../MapScreen';
import { MEDIUM_DETENT, PEEK_DETENT, detentsFor, tabBarOverlapOf, visibleAbove } from '../StopSheet';
import { centeredOn } from '../region';
import { SEARCH_PLACEHOLDER } from '../SearchBar';
import { PILL } from '../pill';
import { ARROW_COUNT } from '../RouteArrows';
import { leaveRouteMode } from '../routeMode';
import { clearMapRequest, showOnMap } from '../showOnMap';
import type { Place } from '../address';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';
import { NOTICES } from '../../arrivals/board';
import type { RouteSummary, Stop, StopWithDistance } from '../../../data/gtfs/types';
import type { RouteDirection } from '../../../data/gtfs/db';
import type { Arrival, ArrivalsResult, FleetResult, Vehicle } from '../../../data/thebus/types';
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

/** The map's own rotation, as `getCamera` would report it. */
let mockHeading = 0;

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  const press = { stopPropagation: () => {} };

  const MockMapView = React.forwardRef((props: any, ref: any) => {
    const { children, onPress, onLongPress, onRegionChangeComplete } = props;
    React.useImperativeHandle(ref, () => ({
      animateToRegion: (region: unknown) => mockCameraMoves.push(region),
      // Where the map's rotation comes from: `Region` carries no heading, so
      // the screen asks for a camera. Custom marker views are screen-aligned,
      // so the arrows subtract this.
      getCamera: async () => ({ center: { latitude: 21.3, longitude: -157.8 }, heading: mockHeading, pitch: 0 }),
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
        {/*
          A rotate-only gesture. The region it settles at is identical every
          time and wide enough to hold the whole fixture route, so the *only*
          thing that changes between two presses is the heading — which is what
          makes "the arrows turned back" separable from "the arrows moved".
        */}
        <Pressable
          accessibilityLabel="rotate the map"
          onPress={() => {
            mockHeading = mockHeading === 0 ? 90 : 0;
            onRegionChangeComplete?.({
              latitude: 21.305,
              longitude: -157.85,
              latitudeDelta: 0.09,
              longitudeDelta: 0.09,
            });
          }}
        />
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
  const MockMarker = ({ title, onPress, identifier, coordinate, children }: any) => (
    <Pressable
      accessibilityLabel={`pin ${identifier}`}
      // Where the marker actually is. A test that wants to assert a marker did
      // *not* move has nothing else to read.
      accessibilityHint={JSON.stringify(coordinate)}
      onPress={() => onPress?.(press)}
    >
      {title === undefined ? null : <Text>{`native callout: ${title}`}</Text>}
      {children}
    </Pressable>
  );

  /**
   * Reports its coordinate count as text, because the assertion that matters is
   * that this is **always mounted** and only its coordinates change. A double
   * that rendered nothing for an empty line could not tell the two apart.
   */
  const MockPolyline = ({ coordinates, testID }: any) => (
    <Text testID={testID}>{`polyline points: ${coordinates?.length ?? 0}`}</Text>
  );

  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Polyline: MockPolyline,
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
  routeById: jest.fn(async (routeId: string): Promise<RouteSummary | null> => ({
    route_id: routeId,
    short_name: '1',
    long_name: 'Kalihi - Waikiki',
  })),
  /**
   * The one translation between what the live API speaks and what the map
   * keys on: an `Arrival` carries `route: "32"` and `routeMode` wants a
   * `route_id`, and the two disagree in the real feed.
   */
  routeByShortName: jest.fn(async (shortName: string): Promise<RouteSummary | null> => ({
    route_id: `id-for-${shortName}`,
    short_name: shortName,
    long_name: 'Mapunapuna-Airport',
  })),
  shapeById: jest.fn(async (): Promise<Coords[] | null> => [
    { lat: 21.33, lon: -157.87 },
    { lat: 21.31, lon: -157.85 },
    { lat: 21.28, lon: -157.83 },
  ]),
  routeStops: jest.fn(async (): Promise<RouteDirection[]> => [
    {
      directionId: '0',
      shapeId: 's-out',
      headsigns: ['WAIKIKI'],
      stops: [
        { stop_id: 'r1', stop_code: '901', stop_name: 'KALIHI TRANSIT CENTER', lat: 21.33, lon: -157.87 },
        { stop_id: 'r2', stop_code: '902', stop_name: 'WAIKIKI', lat: 21.28, lon: -157.83 },
      ],
    },
    {
      directionId: '1',
      shapeId: 's-back',
      headsigns: ['KALIHI TRANSIT CENTER'],
      stops: [
        { stop_id: 'r2', stop_code: '902', stop_name: 'WAIKIKI', lat: 21.28, lon: -157.83 },
        { stop_id: 'r1', stop_code: '901', stop_name: 'KALIHI TRANSIT CENTER', lat: 21.33, lon: -157.87 },
      ],
    },
  ]),
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
/** `showOnMap` navigates rather than pushes: the Map tab is one screen. */
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => mockPush(href),
    navigate: (href: string) => mockNavigate(href),
  },
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
  requestIfAllowed: mockRequest,
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
/**
 * The fleet the map draws buses from. Held in a `let` so a test can replace it
 * before rendering, the way `mockArrivalsResult` works.
 */
let mockFleetResult: FleetResult = {
  ok: true,
  fleet: { serverTime: new Date('2026-08-02T21:43:00Z'), vehicles: [] },
};

const client: TheBusClient = {
  arrivals: jest.fn(async (stopCode: string, options?: { signal?: AbortSignal }) => {
    mockArrivalCalls.push({ stopCode, signal: options?.signal });
    return mockArrivalsResult;
  }),
  vehicles: jest.fn(async () => mockFleetResult),
};

/** A bus that reported `agoMs` before the fleet's own timestamp. */
function bus(number: string, route: string | null, agoMs = 20_000): Vehicle {
  const serverTime = new Date('2026-08-02T21:43:00Z');
  return {
    number,
    tripId: `trip-${number}`,
    route,
    position: { lat: 21.31, lon: -157.85 },
    headsign: 'WAIKIKI',
    adherence: 0,
    lastMessage: new Date(serverTime.getTime() - agoMs),
  };
}

function fleetOf(...vehicles: Vehicle[]): FleetResult {
  return { ok: true, fleet: { serverTime: new Date('2026-08-02T21:43:00Z'), vehicles } };
}

/**
 * An arrival naming a trip and a shape. `shape` is present on every real
 * arrival; `position` is present on about one in ten, which is why the bus
 * highlight and the variant line are independent of each other.
 */
function arrival(tripId: string, shape: string | null, route = '32'): Arrival {
  return {
    id: `a-${tripId}`,
    tripId,
    route,
    headsign: 'WAIKIKI',
    direction: 'Westbound',
    arrivesAt: new Date('2026-08-02T22:10:00Z'),
    estimate: 'scheduled',
    vehicle: null,
    position: null,
    shape,
    canceled: false,
  };
}

function boardOf(...arrivals: Arrival[]): ArrivalsResult {
  return {
    ok: true,
    board: { stopCode: '901', serverTime: new Date('2026-08-02T22:00:00Z'), arrivals },
  };
}

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

/** Centered under the close-zoom camera, so its name is on screen to be read. */
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
 * Where the camera lands if stop 5 is centered in the map left visible above
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
  return centeredOn(
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
    // Route mode is module state — deliberately, so that changing tab cannot
    // drop it — which means it also survives a test. One test entering it and
    // the next rendering the route's pins instead of the anchor's is the price,
    // and this is the whole of it.
    leaveRouteMode();
    clearMapRequest();
    mockHeading = 0;
    mockNavigate.mockClear();
    jest.clearAllMocks();
    mockArrivalCalls.length = 0;
    mockSnapCalls.length = 0;
    mockCameraMoves.length = 0;
    mockRequest.mockResolvedValue(null);
    mockFleetResult = fleetOf();
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
    // only '7' lands near the center of the close-zoom camera. Anything much
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
    // Re-anchored to the screen center, so the offer is answered and retires.
    expect(screen.queryByLabelText('Search this area')).toBeNull();
  });

  /**
   * **Earned by wandering, not only by leaving.** Judging the offer on
   * displacement alone meant a rider nudging the map around one neighbourhood
   * never got it, however long they spent — *"so a user can wiggle in the same
   * area and hit 'search this area' to fine-tune their search."*
   */
  it('offers to search this area after enough panning about, even back where it started', async () => {
    await show();
    expect(screen.queryByLabelText(SEARCH_AREA_LABEL)).toBeNull();

    // Out and back, twice. Each leg is a screen and a bit; the round trip ends
    // where it began, so displacement never earns this.
    for (let i = 0; i < 2; i += 1) {
      await fireEvent.press(screen.getByLabelText('pan the camera away'));
      await fireEvent.press(screen.getByLabelText('pan the camera back'));
    }

    screen.getByLabelText(SEARCH_AREA_LABEL);
  });

  /**
   * The two floating pills are meant to look like the same object and were a
   * couple of points apart — the route pill 32 tall, this one about 35.
   *
   * They cannot be compared side by side, because they are never on screen
   * together: *Search this area* is suppressed in route mode, which is the only
   * time the route pill exists. So each is checked against the shared `PILL`
   * instead, here and in `RoutePill.test.tsx`, which is the thing that actually
   * has to hold.
   */
  it('sizes Search this area from the shared pill metric', async () => {
    await show();
    await fireEvent.press(screen.getByLabelText('pan the camera away'));

    const area = StyleSheet.flatten(screen.getByLabelText(SEARCH_AREA_LABEL).props.style);

    expect(area.height).toBe(PILL.height);
    expect(area.borderRadius).toBe(PILL.radius);
    expect(area.paddingHorizontal).toBe(PILL.paddingHorizontal);
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
    await fireEvent.press(screen.getByLabelText('Center on my location'));

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

  it('asks for location when recenter is tapped, and goes there', async () => {
    mockRequest.mockResolvedValue({ lat: 21.28, lon: -157.83 });
    await show();

    await fireEvent.press(screen.getByLabelText('Center on my location'));

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

  it('centers the map when Search here is pressed, not when the long press lands', async () => {
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

    it('centers the map on a stop chosen from the list', async () => {
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

    it('centers against the medium detent, not the one the sheet is leaving', async () => {
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

    /**
     * The increment's whole point: picking a route on the map draws it *here*.
     * This used to assert a push to `/route/25`, and that assertion is now the
     * bug — `RouteScreen` is still what the Stops tab opens, and the map keeps
     * the rider on the map.
     */
    it('draws the route on the map instead of leaving it', async () => {
      // `route_id: '25'` is route 32. The row shows the number on the bus and
      // the lookup uses the id, and those must not be the same string.
      mockQueries.searchRoutes.mockResolvedValue([
        { route_id: '25', short_name: '32', long_name: 'Mapunapuna-Airport' },
      ]);
      await show();

      await openSearch();
      await fireEvent.press(screen.getByLabelText('Search by routes'));
      await fireEvent.changeText(screen.getByLabelText('Find a route by number or name'), '32');
      await waitFor(() => screen.getByLabelText('Route 32'));

      await fireEvent.press(screen.getByLabelText('Route 32'));

      await waitFor(() => screen.getByTestId('route-band'));
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockQueries.routeStops).toHaveBeenCalledWith('25');
      // Closed behind it, so the route is revealed on the map rather than
      // appearing under a search that is still up.
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

    it('puts the compass under ⌖, spaced as ⌖ is under the bar', async () => {
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
      // The assertion is Truman's own sentence — "directly under the location
      // button and spaced with the same spacing between the location button and
      // the address bar" — as arithmetic on the three positions, rather than a
      // literal that any tuning would break. The only measured number involved
      // is `COMPASS_LAYOUT_OFFSET`, which corrects for MapKit's own inset and
      // is the one thing here that could not be derived.
      await show();

      const bar = StyleSheet.flatten(screen.getByLabelText(SEARCH_PLACEHOLDER).props.style);
      const recenter = StyleSheet.flatten(
        screen.getByLabelText('Center on my location').props.style,
      );
      const reported = screen.getByText(/^mapPadding top:/).props.children;
      // `[^-\d]`, not `\D`: stripping the minus sign turns a compass shoved up
      // behind the search bar into a large positive number that sails past
      // every assertion below. Caught by setting the drop negative on purpose.
      const top = Number(String(reported).replace(/[^-\d]/g, ''));
      const compassTop = top + COMPASS_LAYOUT_OFFSET.top;

      const barToButton = recenter.top - (bar.top + bar.height);
      const buttonToCompass = compassTop - (recenter.top + recenter.height);

      expect(buttonToCompass).toBe(barToButton);
      // And below it, not merely evenly spaced from it — a negative gap would
      // satisfy the equality above on both sides.
      expect(buttonToCompass).toBeGreaterThan(0);
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
        await fireEvent.press(screen.getByLabelText('Center on my location'));
      }

      // Still usable at the end of all that, which is the whole assertion.
      await longPress();
      screen.getByLabelText('pin pending-anchor');
    });
  });
  describe('MapScreen route mode', () => {
    /**
     * Getting into route mode the way a rider does — through the search — rather
     * than by poking the store, so these exercise the wiring as well as the state.
     */
    async function showRoute() {
      const route = { route_id: '25', short_name: '32', long_name: 'Mapunapuna-Airport' };
      mockQueries.searchRoutes.mockResolvedValue([route]);
      mockQueries.routeById.mockResolvedValue(route);
      await show();
      await fireEvent.press(screen.getByLabelText(SEARCH_PLACEHOLDER));
      await fireEvent.press(screen.getByLabelText('Search by routes'));
      await fireEvent.changeText(screen.getByLabelText('Find a route by number or name'), '32');
      await waitFor(() => screen.getByLabelText('Route 32'));
      await fireEvent.press(screen.getByLabelText('Route 32'));
      await waitFor(() => screen.getByTestId('route-band'));
    }

    /**
     * Two things carry the route's name now — the sheet's band and the map's
     * own pill — so both of these read the band specifically.
     */
    function band() {
      return within(screen.getByTestId('route-band'));
    }

    /**
     * The band's X. The pill carries the same control under the same label,
     * because it is the same action; a test has to say which one it pressed.
     */
    function bandClose() {
      return band().getByLabelText('Stop showing this route');
    }

    it('names the route and where the direction ends up', async () => {
      await showRoute();

      expect(band().getByText('Route 32')).toBeTruthy();
      expect(band().getByText('Toward WAIKIKI')).toBeTruthy();
    });

    it('lists the route’s stops in the order it serves them', async () => {
      await showRoute();

      expect(screen.getByLabelText('Stop 1, KALIHI TRANSIT CENTER')).toBeTruthy();
      expect(screen.getByLabelText('Stop 2, WAIKIKI')).toBeTruthy();
    });

    /**
     * One set of pins, never two. Two overlapping stop sets on one map is how a
     * rider stops being able to tell what they are looking at.
     */
    /**
     * The map's own answer to "what am I looking at". The sheet's band says it
     * too, and is out of sight the moment a rider raises the sheet over it.
     */
    it('names the route on the map while route mode is on', async () => {
      await showRoute();

      // The sheet's band names it too; this is the one drawn on the map.
      expect(within(screen.getByTestId('route-pill')).getByText('Route 32')).toBeTruthy();
    });

    it('shows no pill before a route is picked', async () => {
      await show();

      expect(screen.queryByTestId('route-pill')).toBeNull();
    });

    it('leaves route mode from the pill\u2019s X as well as the band\u2019s', async () => {
      await showRoute();

      // Two controls carry this label \u2014 the pill's and the band's \u2014 and either
      // has to work.
      const [pillClose] = screen.getAllByLabelText('Stop showing this route');
      await fireEvent.press(pillClose!);

      await waitFor(() => expect(screen.queryByTestId('route-pill')).toBeNull());
    });
    it('draws the route’s stops as the pins, and not the nearby ones', async () => {
      mockNearby.mockResolvedValue([stop('7', 'SOMEWHERE ELSE', 40)]);
      await showRoute();

      // The double labels a marker by its `identifier`, which is the stop id.
      expect(screen.getByLabelText('pin r1')).toBeTruthy();
      expect(screen.getByLabelText('pin r2')).toBeTruthy();
      expect(screen.queryByLabelText('pin 7')).toBeNull();
    });

    it('flips to the other direction', async () => {
      await showRoute();

      await fireEvent.press(screen.getByLabelText('Show the other direction'));

      await waitFor(() => screen.getByText('Toward KALIHI TRANSIT CENTER'));
      expect(screen.getByLabelText('Stop 1, WAIKIKI')).toBeTruthy();
    });

    /**
     * The guard in `flipRoute`, which exists because spamming this control
     * crashed the app on a device on 2026-08-09 — two marker swaps in flight at
     * once, 66 annotations leaving and 66 arriving in each.
     *
     * **No timer mocking, and none wanted.** Two awaited presses land a few
     * milliseconds apart, which is far inside `FLIP_LOCKOUT_MS` and is exactly
     * what a rider drumming the button does. Faking the clock here would test
     * the mock rather than the window.
     */
    it('ignores a second flip while the first is still landing', async () => {
      await showRoute();

      const control = screen.getByLabelText('Show the other direction');
      await fireEvent.press(control);
      await fireEvent.press(control);

      await waitFor(() => screen.getByText('Toward KALIHI TRANSIT CENTER'));
      // Honouring the second tap would land the rider back where they started.
      expect(screen.queryByText('Toward WAIKIKI')).toBeNull();
    });

    it('flips again once the lockout has passed', async () => {
      await showRoute();

      const control = screen.getByLabelText('Show the other direction');
      await fireEvent.press(control);
      await waitFor(() => screen.getByText('Toward KALIHI TRANSIT CENTER'));

      // The clock rather than the timers: the guard compares `Date.now()`, so
      // this is the one thing that has to move for the window to reopen.
      const realNow = Date.now();
      const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 10_000);
      try {
        await fireEvent.press(control);
        await waitFor(() => screen.getByText('Toward WAIKIKI'));
      } finally {
        clock.mockRestore();
      }
    });

    /**
     * Truman's second reproduction on 2026-08-09: a flip followed quickly by
     * the X. The close lands inside the flip's window, and unlike a flip it is
     * **held and then honoured** rather than dropped — a close that silently
     * does nothing is a broken app.
     *
     * Real timers, because `waitFor` outlasts `SWAP_LOCKOUT_MS` on its own and
     * the deferral is the behaviour under test rather than the clock.
     */
    it('still leaves when the X lands while a flip is in flight', async () => {
      mockNearby.mockResolvedValue([stop('7', 'SOMEWHERE ELSE', 40)]);
      await showRoute();

      await fireEvent.press(screen.getByLabelText('Show the other direction'));
      await fireEvent.press(bandClose());

      await waitFor(() => screen.getByTestId('nearby-band'));
      expect(screen.queryByTestId('route-band')).toBeNull();
    });

    it('leaves route mode from the X, and puts the nearby stops back', async () => {
      mockNearby.mockResolvedValue([stop('7', 'SOMEWHERE ELSE', 40)]);
      await showRoute();

      await fireEvent.press(bandClose());

      await waitFor(() => screen.getByTestId('nearby-band'));
      expect(screen.queryByTestId('route-band')).toBeNull();
      expect(screen.getByLabelText('pin 7')).toBeTruthy();
      expect(screen.queryByLabelText('pin r1')).toBeNull();
    });

    /** Truman settled this explicitly: only the X leaves. */
    it('stays in route mode when the map is panned', async () => {
      await showRoute();

      await fireEvent.press(screen.getByLabelText('pan the camera away'));

      expect(screen.getByTestId('route-band')).toBeTruthy();
    });

    it('stays in route mode when the map is tapped', async () => {
      await showRoute();

      await fireEvent.press(screen.getByLabelText('map surface'));

      expect(screen.getByTestId('route-band')).toBeTruthy();
    });

    /**
     * *Search this area* replaces the anchor's stop set, which in route mode is
     * not what the pins are showing — so taking it up would appear to do nothing.
     */
    it('does not offer to search this area while a route is showing', async () => {
      await showRoute();

      await fireEvent.press(screen.getByLabelText('pan the camera away'));

      expect(screen.queryByLabelText('Search this area')).toBeNull();
    });

    /**
     * The other half of the same pair, and it was missed until Truman asked for
     * it on 2026-08-09. A long press offers *Search here*, which replaces the
     * anchor's stop set — in route mode the pins are the route's stops, so
     * taking the offer up leaves the map looking identical and the gesture
     * reads as broken.
     */
    it('drops no pending marker for a long press while a route is showing', async () => {
      await showRoute();

      await fireEvent.press(screen.getByLabelText('long press the map'));

      expect(screen.queryByLabelText('pin pending-anchor')).toBeNull();
    });

    it('takes a long press again once the route is dismissed', async () => {
      await showRoute();
      await fireEvent.press(bandClose());

      await fireEvent.press(screen.getByLabelText('long press the map'));

      await waitFor(() => screen.getByLabelText('pin pending-anchor'));
    });

    it('offers to search this area again once the route is dismissed', async () => {
      await showRoute();
      await fireEvent.press(bandClose());

      await fireEvent.press(screen.getByLabelText('pan the camera away'));

      await waitFor(() => screen.getByLabelText('Search this area'));
    });

    /**
     * Eight of Oahu's route/directions call at the same stop twice — 60 and 83
     * at stop 2190, 40 at 4416/4417, plus 521 and 421 — verified against the
     * built asset on 2026-08-09. Both markers took `key={stop.stop_id}`, so
     * React rendered two children with the same key and MapKit was handed two
     * annotations with the same `identifier`. Truman saw the warning by name.
     *
     * The row and the pin disagree on purpose: the bus really does come back,
     * so the list says so, and the map has nowhere to put a second marker at a
     * coordinate it has already marked.
     */
    describe('a route that calls at the same stop twice', () => {
      const loop: RouteDirection[] = [
        {
          directionId: '0',
          shapeId: 's-out',
          headsigns: ['WAIKIKI'],
          stops: [
            { stop_id: 'r1', stop_code: '901', stop_name: 'KALIHI TRANSIT CENTER', lat: 21.33, lon: -157.87 },
            { stop_id: 'r2', stop_code: '902', stop_name: 'WAIKIKI', lat: 21.28, lon: -157.83 },
            // The same stop again, on the way back round.
            { stop_id: 'r1', stop_code: '901', stop_name: 'KALIHI TRANSIT CENTER', lat: 21.33, lon: -157.87 },
          ],
        },
      ];

      it('draws one pin for it, not two with the same key', async () => {
        mockQueries.routeStops.mockResolvedValueOnce(loop);
        await showRoute();

        expect(screen.getAllByLabelText('pin r1')).toHaveLength(1);
      });

      it('still lists it twice, because the bus really does come back', async () => {
        mockQueries.routeStops.mockResolvedValueOnce(loop);
        await showRoute();

        expect(screen.getAllByLabelText(/KALIHI TRANSIT CENTER/)).toHaveLength(2);
      });
    });

    it('opens a route stop’s card, with a back control naming the route', async () => {
      await showRoute();

      await fireEvent.press(screen.getByLabelText('Stop 1, KALIHI TRANSIT CENTER'));

      await waitFor(() => screen.getByTestId('stop-card-band'));
      expect(screen.getByText('‹ Route 32')).toBeTruthy();
    });

    it('goes back from a stop’s card to the route’s stop list', async () => {
      await showRoute();
      await fireEvent.press(screen.getByLabelText('Stop 1, KALIHI TRANSIT CENTER'));
      await waitFor(() => screen.getByTestId('stop-card-band'));

      await fireEvent.press(screen.getByText('‹ Route 32'));

      await waitFor(() => screen.getByTestId('route-band'));
      expect(screen.getByLabelText('Stop 2, WAIKIKI')).toBeTruthy();
    });

    describe('the live buses', () => {
      it('draws a fresh bus on the route being shown', async () => {
        mockFleetResult = fleetOf(bus('252', '32'));
        await showRoute();

        // The double labels a marker by its `identifier`, which for a bus is
        // its fleet number — the same key that keeps markers stable across a
        // poll that replaces the whole set.
        await waitFor(() => screen.getByLabelText('pin bus-252'));
      });

      /**
       * The layer's four states, derived here and worded in `StopSheet`.
       *
       * `failure` used to be taken off `useVehicles` and dropped, so a rejected
       * key, an unreachable API and a route with genuinely no buses running all
       * rendered as the same empty map. `CLAUDE.md` names that conflation as
       * the thing that makes a transit app untrustworthy at a stop at night,
       * and this was the last place in the app still doing it.
       *
       * It is also the instrument for the bug Truman reported on 2026-08-09 —
       * buses absent on first render until he zoomed. A line that goes from
       * "Looking for buses…" to a count on its own settles whether the zoom
       * mattered at all.
       */
      it('says it is looking while the first fleet is in flight', async () => {
        // `client` is a module-level fixture, so the held-open reply is put
        // back before the next test sees it.
        const answering = client.vehicles;
        let answer: (result: FleetResult) => void = () => {};
        client.vehicles = () =>
          new Promise<FleetResult>((resolve) => {
            answer = resolve;
          });

        try {
          await showRoute();

          expect(screen.getByTestId('bus-layer-state')).toHaveTextContent(
            'Looking for buses…',
          );

          await act(async () => {
            answer(fleetOf(bus('252', '32')));
          });
          await waitFor(() =>
            expect(screen.getByTestId('bus-layer-state')).toHaveTextContent('1 bus'),
          );
        } finally {
          client.vehicles = answering;
        }
      });

      it('counts the buses it is drawing, and the late ones', async () => {
        mockFleetResult = fleetOf(
          { ...bus('252', '32'), adherence: -12 },
          { ...bus('253', '32'), adherence: 0 },
        );
        await showRoute();

        await waitFor(() =>
          expect(screen.getByTestId('bus-layer-state')).toHaveTextContent('2 buses · 1 late'),
        );
      });

      it('says no buses are running rather than looking forever', async () => {
        mockFleetResult = fleetOf(bus('300', '13'));
        await showRoute();

        await waitFor(() =>
          expect(screen.getByTestId('bus-layer-state')).toHaveTextContent('No buses running'),
        );
      });

      /** The pair that must never render alike: one is fixed by waiting, one is not. */
      it('says it cannot reach TheBus when the fleet fails', async () => {
        mockFleetResult = { ok: false, failure: { kind: 'unreachable' } };
        await showRoute();

        await waitFor(() =>
          expect(screen.getByTestId('bus-layer-state')).toHaveTextContent("Can't reach TheBus"),
        );
      });

      it('draws no buses before a route is picked', async () => {
        mockFleetResult = fleetOf(bus('252', '32'));
        await show();

        expect(screen.queryByLabelText('pin bus-252')).toBeNull();
        expect(client.vehicles).not.toHaveBeenCalled();
      });

      /**
       * 929 stale vehicles in the daytime sample carried plausible Oahu
       * coordinates. Unfiltered this layer is a car park, not a map.
       */
      it('leaves a bus parked since 2022 off the map', async () => {
        mockFleetResult = fleetOf(bus('801', '32', 4 * 365 * 24 * 60 * 60_000));
        await showRoute();

        await waitFor(() => expect(client.vehicles).toHaveBeenCalled());
        expect(screen.queryByLabelText('pin bus-801')).toBeNull();
      });

      it('leaves a bus on another route off the map', async () => {
        mockFleetResult = fleetOf(bus('300', '13'));
        await showRoute();

        await waitFor(() => expect(client.vehicles).toHaveBeenCalled());
        expect(screen.queryByLabelText('pin bus-300')).toBeNull();
      });

      it('stops drawing buses once the route is dismissed', async () => {
        mockFleetResult = fleetOf(bus('252', '32'));
        await showRoute();
        await waitFor(() => screen.getByLabelText('pin bus-252'));

        await fireEvent.press(bandClose());

        await waitFor(() => expect(screen.queryByLabelText('pin bus-252')).toBeNull());
      });

      /**
       * The fleet number alone. The age moved into the popup in Increment 9,
       * which is what stops an unselected bus re-snapshotting its bitmap every
       * thirty seconds to change a string nobody is reading.
       */
      it('labels a bus with its fleet number', async () => {
        mockFleetResult = fleetOf(bus('252', '32'));
        await showRoute();

        await waitFor(() => expect(screen.getByTestId('bus-label-252')).toHaveTextContent('252'));
      });

      /**
       * Reported from the Increment 8 `.ipa` as "buses draw off the route
       * line". They did not: bus 889 was a Route 2 bus signed for Waikiki,
       * drawn correctly, while the line on screen was headed for Kalihi. The
       * map was drawing both directions' buses because `useVehicles` filtered
       * on route and freshness and nothing else.
       *
       * Driven through the screen rather than the hook because what the hook
       * cannot get wrong is *which* two lists it is handed.
       */
      describe('the other direction’s buses', () => {
        const otherWay = { ...bus('889', '32'), headsign: 'KALIHI TRANSIT CENTER' };

        it('are left off the map', async () => {
          mockFleetResult = fleetOf(bus('252', '32'), otherWay);
          await showRoute();

          await waitFor(() => screen.getByLabelText('pin bus-252'));
          expect(screen.queryByLabelText('pin bus-889')).toBeNull();
        });

        it('are not counted in the route band', async () => {
          mockFleetResult = fleetOf(bus('252', '32'), otherWay);
          await showRoute();

          await waitFor(() =>
            expect(screen.getByTestId('bus-layer-state')).toHaveTextContent('1 bus'),
          );
        });

        it('take the map’s place after a flip', async () => {
          mockFleetResult = fleetOf(bus('252', '32'), otherWay);
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));

          await fireEvent.press(screen.getByLabelText('Show the other direction'));

          await waitFor(() => screen.getByLabelText('pin bus-889'));
          expect(screen.queryByLabelText('pin bus-252')).toBeNull();
        });

        /** GTFS is reference data, and it can be weeks behind the fleet feed. */
        it('do not take a bus signed something the asset never heard of with them', async () => {
          mockFleetResult = fleetOf({ ...bus('300', '32'), headsign: 'A SIGN FROM NEXT WEEK' });
          await showRoute();

          await waitFor(() => screen.getByLabelText('pin bus-300'));
        });
      });

      /**
       * **The bus wins the tap and hands the stop down.**
       *
       * `651bb07` gave the tap away entirely — the bus found the stop under it
       * and selected that, doing nothing at all when there was none — because
       * buses draw above the stops and a covered pin otherwise took two
       * presses. That guarantee has to survive selecting the bus, so the popup
       * names the covered stop and takes it on the next press.
       */
      describe('tapping a bus', () => {
        const popup = () => screen.getByTestId('bus-popup-252');

        const openPopup = async () => {
          await fireEvent.press(screen.getByLabelText('pin bus-252'));
          await waitFor(() =>
            expect(StyleSheet.flatten(popup().props.style).opacity).toBe(1),
          );
        };

        it('selects the bus rather than the stop underneath it', async () => {
          // Drawn at r1's own coordinates, so the dot covers the pin exactly.
          mockFleetResult = fleetOf({
            ...bus('252', '32'),
            position: { lat: 21.33, lon: -157.87 },
          });
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));

          await openPopup();

          // The stop's card did not open in the bus's place.
          expect(screen.queryByTestId('stop-card-band')).toBeNull();
        });

        it('offers the covered stop in the popup', async () => {
          mockFleetResult = fleetOf({
            ...bus('252', '32'),
            position: { lat: 21.33, lon: -157.87 },
          });
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));

          await openPopup();

          expect(within(popup()).getByText('KALIHI TRANSIT CENTER')).toBeTruthy();
        });

        it('takes the covered stop on the next press', async () => {
          mockFleetResult = fleetOf({
            ...bus('252', '32'),
            position: { lat: 21.33, lon: -157.87 },
          });
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));
          await openPopup();

          await fireEvent.press(screen.getByLabelText('pin bus-252'));

          await waitFor(() => screen.getByTestId('stop-card-band'));
        });

        it('offers no stop when the dot is covering nothing', async () => {
          mockFleetResult = fleetOf(bus('252', '32'));
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));

          await openPopup();

          expect(within(popup()).queryByText(/KALIHI/)).toBeNull();
        });

        it('closes the popup when the same bus is pressed again', async () => {
          mockFleetResult = fleetOf(bus('252', '32'));
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));
          await openPopup();

          await fireEvent.press(screen.getByLabelText('pin bus-252'));

          await waitFor(() =>
            expect(StyleSheet.flatten(popup().props.style).opacity).toBe(0),
          );
        });

        /** The bus layer is emptied and rebuilt by a flip; a popup for a bus no
         *  longer drawn would be a popup for nothing. */
        it('closes the popup on a direction flip', async () => {
          mockFleetResult = fleetOf(bus('252', '32'));
          await showRoute();
          await waitFor(() => screen.getByLabelText('pin bus-252'));
          await openPopup();

          await fireEvent.press(screen.getByLabelText('Show the other direction'));

          await waitFor(() => screen.getByText('Toward KALIHI TRANSIT CENTER'));
          expect(screen.queryByTestId('bus-popup-252')).toBeNull();
        });
      });
    });

    describe('tapping an arrival', () => {
      /**
       * Getting to an arrival: a route stop's pin opens the card, whose board is
       * the same one `/stop/[code]` renders.
       */
      async function openArrivals() {
        await fireEvent.press(screen.getByLabelText('Stop 1, KALIHI TRANSIT CENTER'));
        await waitFor(() => screen.getByTestId('stop-card-band'));
      }

      it('highlights the bus whose trip matches', async () => {
        mockFleetResult = fleetOf(bus('252', '32'));
        mockArrivalsResult = boardOf(arrival('trip-252', 's-out'));
        await showRoute();
        await waitFor(() => screen.getByLabelText('pin bus-252'));
        await openArrivals();

        await fireEvent.press(screen.getByLabelText(/Route 32 to WAIKIKI/));

        await waitFor(() =>
          expect(screen.getByLabelText(/Route 32 to WAIKIKI/).props.accessibilityState.selected)
            .toBe(true),
        );
      });

      /**
       * Only about one arrival in ten has a bus reporting against it — 23 of 25
       * in the real capture carry the "0" position sentinel — so the join
       * failing is the ordinary case, not an error.
       */
      it('is not an error when no bus on the map matches', async () => {
        mockFleetResult = fleetOf(bus('999', '32'));
        mockArrivalsResult = boardOf(arrival('trip-nothing', 's-out'));
        await showRoute();
        await openArrivals();

        await fireEvent.press(screen.getByLabelText(/Route 32 to WAIKIKI/));

        expect(screen.getByLabelText('pin bus-999')).toBeTruthy();
      });

      /**
       * The line follows the *arrival*, not the join, because `shape` is on
       * every arrival while a position is on one in ten. A rider tapping a
       * short-turn sees the road that bus is on either way.
       */
      it('redraws the line as the variant the arrival names', async () => {
        mockArrivalsResult = boardOf(arrival('trip-252', 's-short-turn'));
        await showRoute();
        await openArrivals();

        await fireEvent.press(screen.getByLabelText(/Route 32 to WAIKIKI/));

        await waitFor(() =>
          expect(mockQueries.shapeById).toHaveBeenCalledWith('s-short-turn'),
        );
      });

      it('keeps the representative line for an arrival that names no shape', async () => {
        mockArrivalsResult = boardOf(arrival('trip-252', null));
        await showRoute();
        await openArrivals();

        await fireEvent.press(screen.getByLabelText(/Route 32 to WAIKIKI/));

        expect(mockQueries.shapeById).not.toHaveBeenCalledWith(null);
        expect(mockQueries.shapeById).toHaveBeenCalledWith('s-out');
      });

      it('restores the representative line when the route direction changes', async () => {
        mockArrivalsResult = boardOf(arrival('trip-252', 's-short-turn'));
        await showRoute();
        await openArrivals();
        await fireEvent.press(screen.getByLabelText(/Route 32 to WAIKIKI/));
        await waitFor(() => expect(mockQueries.shapeById).toHaveBeenCalledWith('s-short-turn'));

        await fireEvent.press(screen.getByText('‹ Route 32'));
        await waitFor(() => screen.getByTestId('route-band'));
        await fireEvent.press(screen.getByLabelText('Show the other direction'));

        await waitFor(() => expect(mockQueries.shapeById).toHaveBeenCalledWith('s-back'));
      });
    });

    describe('the route line', () => {
      /**
       * The rule the map section of `docs/backlog.md` exists for. Route mode
       * changes this overlay's coordinates, never its presence — mounting a
       * child inside `MapView` is the seam with a SIGABRT behind it.
       */
      it('is mounted with no points before a route is showing', async () => {
        await show();

        expect(screen.getByTestId('route-line')).toBeTruthy();
        expect(screen.getByText('polyline points: 0')).toBeTruthy();
      });

      it('draws the representative shape of the direction being shown', async () => {
        await showRoute();

        await waitFor(() => screen.getByText('polyline points: 3'));
        expect(mockQueries.shapeById).toHaveBeenCalledWith('s-out');
      });

      /**
       * `MapPolylineProps` has no arrow support, so these are markers — and
       * markers inside `MapView` is the seam with the open SIGABRT behind it.
       * The pool being *fixed* is what keeps them out of it: eight exist before
       * a route is picked, during it, across a flip, and after the X.
       */
      it('mounts the same arrows whatever the map is showing', async () => {
        const arrows = () => screen.getAllByLabelText(/^pin arrow-/);

        await show();
        expect(arrows()).toHaveLength(ARROW_COUNT);

        await showRoute();
        expect(arrows()).toHaveLength(ARROW_COUNT);

        await fireEvent.press(screen.getByLabelText('Show the other direction'));
        await waitFor(() => screen.getByText('Toward KALIHI TRANSIT CENTER'));
        expect(arrows()).toHaveLength(ARROW_COUNT);

        await fireEvent.press(bandClose());
        await waitFor(() => expect(screen.queryByTestId('route-band')).toBeNull());
        expect(arrows()).toHaveLength(ARROW_COUNT);
      });

      /**
       * **Panning must not move an arrowhead off the piece of road it marks.**
       * The first version spread them across the visible stretch, so every pan
       * and every zoom shuffled all of them at once — *"it's very annoying."*
       */
      it('leaves the arrows where they are when the camera moves', async () => {
        await showRoute();

        const positions = () =>
          screen.getAllByLabelText(/^pin arrow-/).map((arrow) => arrow.props.accessibilityHint);
        const before = positions();
        // The fixture route has to actually place some, or this proves nothing.
        expect(new Set(before).size).toBeGreaterThan(1);

        await fireEvent.press(screen.getByLabelText('zoom in close'));
        await fireEvent.press(screen.getByLabelText('pan the camera back'));

        expect(positions()).toEqual(before);
      });

      /**
       * **Custom marker views are screen-aligned.** MapKit turns the map under
       * the annotations and leaves them upright, so an arrowhead rotated to a
       * compass bearing is right only while the map faces north — which is
       * exactly what Truman saw on 2026-08-10: *"rotated correctly only when
       * the user is facing north."* The heading has to come back out again.
       */
      it('turns the arrows back as the map itself turns', async () => {
        await showRoute();

        const angleOf = () => {
          const style = StyleSheet.flatten(screen.getByTestId('arrow-head-0').props.style);
          const rotate = style.transform?.[0]?.rotate ?? '0deg';
          return Number(String(rotate).replace('deg', ''));
        };

        // Settle once at the rotated heading, and once at the same camera
        // facing north. Same region both times, so the heading is the only
        // difference between the two readings.
        await fireEvent.press(screen.getByLabelText('rotate the map'));
        await waitFor(() => expect(angleOf()).not.toBe(0));
        const turned = angleOf();

        await fireEvent.press(screen.getByLabelText('rotate the map'));

        // The map turned 90° back to north, so the arrow turns 90° the other
        // way and keeps pointing along the same stretch of road.
        await waitFor(() => expect(angleOf()).toBeCloseTo(turned + 90, 5));
      });

      it('draws the other direction’s shape after a flip', async () => {
        await showRoute();
        await waitFor(() => screen.getByText('polyline points: 3'));

        await fireEvent.press(screen.getByLabelText('Show the other direction'));

        await waitFor(() => expect(mockQueries.shapeById).toHaveBeenCalledWith('s-back'));
      });

      it('is still mounted, with no points, once the route is dismissed', async () => {
        await showRoute();
        await waitFor(() => screen.getByText('polyline points: 3'));

        await fireEvent.press(bandClose());

        await waitFor(() => screen.getByText('polyline points: 0'));
        expect(screen.getByTestId('route-line')).toBeTruthy();
      });

      /**
       * It must not fall back to joining the stops up. Measured against the real
       * shapes: p90 1.3 km out, worst 7.3 km, straight through Kāneʻohe Bay on
       * the express runs.
       */
      it('draws nothing for a direction the feed gave no shape', async () => {
        mockQueries.routeStops.mockResolvedValue([
          {
            directionId: '0',
            shapeId: null,
            headsigns: ['WAIKIKI'],
            stops: [
              { stop_id: 'r1', stop_code: '901', stop_name: 'NO SHAPE HERE', lat: 21.33, lon: -157.87 },
            ],
          },
        ]);
        await showRoute();

        expect(screen.getByText('polyline points: 0')).toBeTruthy();
        expect(mockQueries.shapeById).not.toHaveBeenCalled();
      });

      it('draws nothing when the asset does not carry the shape it names', async () => {
        mockQueries.shapeById.mockResolvedValue(null);
        await showRoute();

        expect(screen.getByText('polyline points: 0')).toBeTruthy();
      });
    });

    /** A route the feed runs one way has nothing to flip to. */
    it('offers no flip control for a route with a single direction', async () => {
      mockQueries.routeStops.mockResolvedValue([
        {
          directionId: '0',
          shapeId: 's-out',
          headsigns: ['WAIKIKI'],
          stops: [
            { stop_id: 'r1', stop_code: '901', stop_name: 'ONE WAY ONLY', lat: 21.33, lon: -157.87 },
          ],
        },
      ]);
      await showRoute();

      expect(screen.queryByLabelText('Show the other direction')).toBeNull();
    });

  /**
   * *Show me that on the map*, asked from a long press on another screen.
   *
   * The rows' own half is `features/map/__tests__/showOnMap.test.tsx`; this is
   * the map actually answering. The request is set before the screen renders,
   * which is what really happens — `showOnMap` sets it and *then* navigates, so
   * the map reads it on its first frame rather than after a frame in its
   * default state.
   */
  describe('a request from somewhere else', () => {
    const stop = (id: string, name: string) => ({
      stop_id: id,
      stop_code: id,
      stop_name: name,
      lat: 21.33,
      lon: -157.87,
    });

    it('goes to the Map tab rather than pushing a screen', async () => {
      showOnMap({ kind: 'stop', stopId: '5' });

      expect(mockNavigate).toHaveBeenCalledWith('/');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('opens the card on a stop asked for from another screen', async () => {
      mockQueries.stopsByIds.mockResolvedValue([stop('5', 'LAGOON DR + IOLANA PL')]);
      showOnMap({ kind: 'stop', stopId: '5' });

      await show();

      await waitFor(() => screen.getByTestId('stop-card-band'));
      expect(screen.getByText('LAGOON DR + IOLANA PL')).toBeTruthy();
    });

    /**
     * Route mode is entered by `showOnMap` itself, before this screen renders,
     * so the map is drawing the route on its very first frame rather than
     * flashing the nearby stops first.
     */
    it('draws a route asked for from another screen', async () => {
      showOnMap({ kind: 'route', routeId: '31' });

      await show();

      await waitFor(() => screen.getByTestId('route-band'));
      expect(screen.getByTestId('route-pill')).toBeTruthy();
    });

    it('draws the route an arrival was for, from its number on the bus', async () => {
      showOnMap({ kind: 'arrival', routeName: '32', tripId: null, stopId: null });

      await show();

      await waitFor(() => screen.getByTestId('route-band'));
      expect(mockQueries.routeByShortName).toHaveBeenCalledWith('32');
    });

    /**
     * The state a rider would otherwise reach by opening the card themselves
     * and tapping the row: the bus drawn larger, keeping its number at any zoom.
     */
    it('selects the arrival behind a live bus asked for', async () => {
      mockQueries.stopsByIds.mockResolvedValue([stop('r1', 'KALIHI TRANSIT CENTER')]);
      mockArrivalsResult = boardOf(arrival('trip-252', 's-out'));
      mockFleetResult = fleetOf(bus('252', '32'));

      showOnMap({ kind: 'arrival', routeName: '32', tripId: 'trip-252', stopId: 'r1' });
      await show();

      await waitFor(() =>
        expect(
          screen.getByLabelText(/Route 32 to WAIKIKI/).props.accessibilityState.selected,
        ).toBe(true),
      );
    });

    /**
     * `route_short_name` is what the live API speaks and the two feeds disagree
     * about case — `sameRoute` lowercases both sides for exactly this reason.
     * A miss here is silent: route mode is never entered, so the long-press
     * entry appears to do nothing at all.
     */
    it('finds the route even when the live feed disagrees about case', async () => {
      showOnMap({ kind: 'arrival', routeName: 'a line', tripId: null, stopId: null });

      await show();

      await waitFor(() => expect(mockQueries.routeByShortName).toHaveBeenCalledWith('a line'));
      await waitFor(() => screen.getByTestId('route-band'));
    });

    /**
     * Cleared as it is read. A rider who leaves the Map tab and comes back an
     * hour later must not be thrown to a stop they looked up once.
     */
    it('acts on a request once and then forgets it', async () => {
      mockQueries.stopsByIds.mockResolvedValue([stop('5', 'LAGOON DR + IOLANA PL')]);
      showOnMap({ kind: 'stop', stopId: '5' });

      const first = await show();
      await waitFor(() => screen.getByTestId('stop-card-band'));
      await first.unmount();

      mockQueries.stopsByIds.mockClear();
      await show();

      expect(mockQueries.stopsByIds).not.toHaveBeenCalled();
    });
  });
  });
});
