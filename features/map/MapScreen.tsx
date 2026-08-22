import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { type LongPressEvent, type MarkerPressEvent } from 'react-native-maps';
import type BottomSheet from '@gorhom/bottom-sheet';
import { schedule } from '../../lib/schedule';
import { useAnchoredStops } from './useAnchoredStops';
import { StopMarker } from './StopMarker';
import { labelledMapIds, scaleOf } from './labels';
import { isOnLine, nextStopAlong } from './nextStop';
import { PendingMarker } from './PendingMarker';
import { RouteLine } from './RouteLine';
import { RouteArrows } from './RouteArrows';
import { BusMarker } from './BusMarker';
import { useVehicles, type BusOnMap } from './useVehicles';
import {
  centeredOn,
  hasDriftedFrom,
  panScreensBetween,
  regionAround,
  visibleCenter,
  type Region,
} from './region';
import {
  StopSheet,
  busLayerFor,
  detentsFor,
  tabBarOverlapOf,
  FULL_DETENT,
  MEDIUM_DETENT,
  PEEK_DETENT,
  visibleAbove,
} from './StopSheet';
import { SearchBar, SEARCH_BAR_ALLOWANCE } from './SearchBar';
import { RoutePill, ROUTE_PILL_ALLOWANCE } from './RoutePill';
import { PILL } from './pill';
import { SearchOverlay } from './SearchOverlay';
import { directionIndexFor } from './direction';
import { enterRouteMode, flipDirection, leaveRouteMode, useRouteMode } from './routeMode';
import { clearMapRequest, useMapRequest, type MapRequest } from './showOnMap';
import { useStopQueries, NEARBY_RADIUS_METERS, type RouteDirection } from '../../data/gtfs/db';
import {
  addFavorite,
  loadFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import type { Arrival, TheBusClient } from '../../data/thebus';
import { useTheme } from '../../lib/theme';
import type { RouteSummary, Stop, StopWithDistance } from '../../data/gtfs/types';
import { metersBetween, type Coords } from '../../lib/distance';

/**
 * The map tab: stops around one anchor, as pins and as a list, which are two
 * views of the same set rather than two sets.
 *
 * Tapping a pin — or a row — selects a stop, and the sheet swaps its list for
 * that stop's arrival board. A plain tap on the map dismisses; it does not
 * move the anchor. Moving the anchor is two explicit gestures, both of which
 * announce themselves: a long press with a *Search here* callout, and *Search
 * this area* once the camera has been carried away from the pins.
 *
 * That is a reversal. Tap-to-search was the shipped design and it fires
 * constantly by accident on a device, and every accident discarded the stop set
 * and the selection together. The capability it was chosen for — checking
 * service near somewhere you have not gone yet — survives in the long press.
 *
 * There is still no *query* on pan or zoom; see `useAnchoredStops` for why that
 * is a decision rather than an omission. `onRegionChangeComplete` here only
 * decides whether to offer.
 */

const RECENTER_LABEL = 'Center on my location';
const SETTINGS_LABEL = 'Turn on location in Settings';

/**
 * One line per way of having *asked* and not got a location, and neither of
 * them a dead end.
 *
 * Denial is the one that matters. iOS shows its dialog once per install, so
 * after a refusal `requestForegroundPermissionsAsync` returns `denied` without
 * asking anything, and a button that silently did nothing forever is how ⌖
 * used to behave. It now opens Settings, and this says so.
 *
 * **There is deliberately no line for `idle` any more.** There used to be —
 * *"Showing downtown Honolulu. Tap ⌖ to use your location."* — and on a device
 * it was a flash on every single launch, reported 2026-08-09 with a screen
 * recording to read it by. It could be nothing else: `onMapReady` calls
 * `requestLocation()` from `idle`, so `idle` lasts exactly from the map's first
 * frame to the request going out. Every state a rider can actually sit in is
 * `denied` or `error`, and both of those say what to do about it. The window
 * the prompt lived in was never one anyone could read, let alone act on.
 */
const LOCATION_DENIED = 'Location is off for this app. Tap ⌖ to turn it on in Settings.';
const LOCATION_ERROR = 'Could not get your location. Tap ⌖ to try again.';
export const SEARCH_AREA_LABEL = 'Search this area';

/**
 * How far the camera has to be carried from the anchor before *Search this
 * area* appears, as a fraction of the screen's width.
 *
 * A guess, to be tuned on a device: too small and the control blinks in and
 * out while a rider reads the map, too large and it never shows up when they
 * have deliberately gone looking somewhere else. Named so that tuning it is a
 * one-line change.
 */
const DRIFT_FRACTION = 0.25;

/**
 * How far the camera has to be *pushed around*, in screens, before *Search this
 * area* appears — however close to the anchor it ends up.
 *
 * Larger than `DRIFT_FRACTION`, because this counts every wobble rather than
 * one displacement: a rider reading the map moves it a little constantly, and
 * the control should arrive as a considered offer rather than the moment a
 * thumb slips. A guess, to be tuned on a device, and the counter resets every
 * time the anchor moves.
 */
const PAN_SCREENS_FOR_OFFER = 1.5;

/**
 * How far below the safe area the map's chrome starts — the search bar, and
 * everything the search bar pushes down.
 *
 * It was `+ 64`, which put the controls ~123 pt down a Dynamic Island phone and
 * read as floating in the middle of the map — observed 2026-08-08. The 64 was
 * reserving room for the location banner, which mounts only while there is no
 * fix to show. Reserving it unconditionally paid for an absent view on every
 * launch.
 *
 * Everything below the bar is stacked the same way: each thing that is actually
 * on screen pushes what follows it down, so the common case is tight and the
 * rare case still does not collide.
 */
const CONTROL_INSET = 12;
/** ⌖'s diameter, and the pill's height beside it. */
const CONTROL_SIZE = 44;

/** How far in from the screen's right edge ⌖ sits. The compass lines up with it. */
const CONTROL_EDGE_INSET = 12;

/**
 * The gap between what we hand `mapPadding` and where MapKit actually draws the
 * compass.
 *
 * **Measured, not derived, and it is the only number here that could not be.**
 * `mapPadding` becomes the map view's `layoutMargins`, and MapKit then places
 * the compass some distance inside them — its own size and its own inset, none
 * of it documented and none of it readable from here. Reasoning about it is the
 * mistake this project has now made six times.
 *
 * So it was measured instead: Truman placed the compass by eye on a device on
 * 2026-08-09, landing on a top margin of `controlsTop + 2` and a right margin
 * of `7`. Against where he wanted it — directly under ⌖, one `CONTROL_INSET`
 * below it, right edges aligned — those two settings say MapKit is insetting
 * the compass 54 pt down and 5 pt in from the margins it is given.
 *
 * **If the compass moves after an SDK bump, re-measure these two rather than
 * recomputing anything below.** Everything else on this screen is a real
 * position; only this pair is a correction for someone else's layout.
 */
export const COMPASS_LAYOUT_OFFSET = { top: 54, right: 5 } as const;
/** Cleared only when the banner is actually up. Its height plus its gap. */
const BANNER_ALLOWANCE = 52;

/** Long enough to read as travel rather than a cut, short enough not to wait. */
const CAMERA_MS = 350;

/**
 * How much ground to show around a bus a rider tapped an arrival for.
 *
 * **Street zoom, and that is a measured claim rather than a taste.** `labels.ts`
 * splits `'route'` from `'street'` at a `longitudeDelta` of 0.022, and
 * `regionAround` turns a radius r into `2 · 1.15 · r / 111320 / cos(21.3°)`
 * degrees — so anything under about 990 m lands in the street tier, where stop
 * tiles keep their labels instead of collapsing to dots. 500 m is comfortably
 * inside it: the bus, and a couple of blocks either side of it.
 *
 * `NEARBY_RADIUS_METERS` is what every other framing uses, and it does *not*
 * work here — 1500 m puts the camera the wrong side of that threshold, so
 * "center on the bus" would arrive at route scale with every label gone.
 *
 * A comfort knob, so it is named: Truman turns it.
 */
const BUS_FRAME_METERS = 500;

/**
 * How long one wholesale marker swap owns the map. See `swapBusyUntil`.
 *
 * `CAMERA_MS` rather than a number of its own, and that is the whole argument:
 * the window that must be protected is the one where the previous swap is still
 * being applied, and the camera move is exactly as long as that takes because
 * the same commit starts both. A constant picked independently would be a guess
 * that drifts out of agreement with the animation it is shadowing.
 */
const SWAP_LOCKOUT_MS = CAMERA_MS;

/**
 * How long the map refuses to zoom after a pin is tapped.
 *
 * Tapping two pins in quick succession zoomed the map, because iOS counted the
 * pair as a double tap. There is no way to ask for anything narrower:
 * `react-native-maps` attaches its own tap recognisers but its double-tap one
 * only fires `onDoublePress` and never zooms — the zoom is `MKMapView`'s own
 * recogniser, which the library does not expose, and `zoomTapEnabled` is
 * documented as Google Maps only on iOS. Both read from source.
 *
 * So the blunt instrument: turn zooming off for slightly longer than the
 * system's double-tap window, then turn it back on. It is a plain prop on the
 * map — not a change to any child — which is what makes it safe against the
 * mounting bug in `StopMarker`.
 *
 * **The cost is real**: a deliberate pinch begun within this window of tapping
 * a pin does nothing. Truman chose this over living with the zoom, knowing
 * that, and over a native fix that would leave the Expo Go loop.
 */
const ZOOM_LOCKOUT_MS = 320;

export type MapScreenProps = {
  /**
   * Read from `useTheBus()` by the route and handed down, rather than read
   * here. Keeping the screen a plain function of its props is what lets its
   * test drive it with a stub client and no provider.
   */
  client: TheBusClient;
  /**
   * Read from `useBottomTabBarHeight()` by the route and handed down, for the
   * same reason `client` is: it is a React context that **throws** outside a
   * navigator, so reading it here would break this screen's own tests. It
   * already includes the bottom safe-area inset, which is what retires the
   * 49 + 34 guess about what UIKit does on a Dynamic Island phone.
   */
  tabBarHeight: number;
};

export function MapScreen({ client, tabBarHeight }: MapScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  /**
   * The height of this screen's own root view — the map's height, and the
   * sheet's container.
   *
   * **Measured, not derived from the window.** React Navigation's tab scene may
   * or may not be inset above the tab bar, and assuming wrong breaks the
   * sheet at both ends at once — see `detentsFor`. One `onLayout` answers it
   * exactly on every device and every navigator version, which no amount of
   * reading the library can. `windowHeight` until the first layout, being the
   * closest thing to an answer available before one.
   */
  const [measured, setMeasured] = useState<number | null>(null);
  const onScreenLayout = useCallback((event: LayoutChangeEvent) => {
    setMeasured(event.nativeEvent.layout.height);
  }, []);
  const mapHeight = measured ?? windowHeight;

  const tabBarOverlap = tabBarOverlapOf(mapHeight, windowHeight, tabBarHeight);
  const detents = useMemo(
    () => detentsFor(mapHeight, tabBarOverlap, insets.top),
    [mapHeight, tabBarOverlap, insets.top],
  );
  const {
    anchor,
    region,
    source,
    stops,
    status,
    setAnchor,
    recenter,
    requestLocation,
    locationStatus,
  } = useAnchoredStops();
  const { routesForStops, routeById, routeByShortName, routeStops, shapeById, stopsByIds } =
    useStopQueries();

  const map = useRef<MapView | null>(null);
  const sheet = useRef<BottomSheet | null>(null);
  const [selectedStop, setSelectedStop] = useState<StopWithDistance | null>(null);
  /** The detent the sheet last settled on. `index={0}` is where it starts. */
  const [detent, setDetent] = useState<number>(PEEK_DETENT);
  /** Where a long press landed, waiting for its callout to be taken up. */
  const [pending, setPending] = useState<Coords | null>(null);
  /** Where the camera settled last. `null` until it has moved at all. */
  const [camera, setCamera] = useState<Region | null>(null);

  /**
   * Which way the map itself is turned, in degrees clockwise from north.
   *
   * **Custom marker views do not rotate with the map.** MapKit turns the map
   * under them and leaves the annotation views screen-aligned, so an arrowhead
   * rotated to a *geographic* bearing is right only while the map is facing
   * north — which is what Truman saw on 2026-08-10: *"rotated correctly only
   * when the user is facing north."* Subtracting the heading turns a compass
   * bearing into a screen angle.
   *
   * `Region` carries no heading, so it comes from `getCamera()` — one native
   * round trip per settle, the same cadence the labeller already runs at.
   */
  const [heading, setHeading] = useState(0);
  /**
   * The anchor the drift offer belongs to, or null. Storing *which* anchor
   * rather than a bare flag is what makes the offer sticky without making it
   * stuck: it stands until the anchor moves, and moving the anchor is the only
   * thing that can answer it.
   */
  const [offeredFor, setOfferedFor] = useState<Coords | null>(null);
  /**
   * How much the camera has been pushed around since the anchor last moved, in
   * screens. **Travelled, not displaced** — see `panScreensBetween`.
   */
  const panned = useRef(0);
  const lastCamera = useRef<Region | null>(null);

  /**
   * Any anchor move spends the wandering that earned the offer — ⌖, a long
   * press, a searched address, a stop picked out of the search, or *Search this
   * area* itself. Keyed on `anchor`, which is a fresh object every time it
   * moves, so no path can forget to do it.
   */
  useEffect(() => {
    panned.current = 0;
    lastCamera.current = null;
  }, [anchor]);
  /** A fix is in flight, so ⌖ says so rather than looking inert. */
  const [locating, setLocating] = useState(false);
  /** Whether the fullscreen search is over the map. */
  const [searching, setSearching] = useState(false);
  /** False for `ZOOM_LOCKOUT_MS` after a pin tap. See that constant. */
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const releaseZoom = useRef<(() => void) | null>(null);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(new Map());
  /**
   * The route the map is drawing, from a module-level store rather than from
   * this component's state — see `routeMode.ts`. Leaving the tab and coming
   * back must not drop it, and holding it here would make that a bet on whether
   * React Navigation keeps a tab scene mounted.
   */
  const routeMode = useRouteMode();
  const [routeDetail, setRouteDetail] = useState<{
    routeId: string;
    route: RouteSummary | null;
    directions: RouteDirection[];
  } | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  /**
   * Drift is judged once per *settled* camera, and the answer sticks.
   *
   * Judging it on every render instead would re-judge it the moment the anchor
   * moves, against a camera from before the move — a pairing that was never on
   * screen — and would latch an offer the map is about to make untrue. Doing it
   * here means the only inputs are a camera that actually settled and the
   * anchor it settled against.
   *
   * Sticky because a rider who pans out and drifts back a few metres was still
   * told there was something over there, and an offer that blinks out under a
   * thumb reaching for it is worse than one that lingers.
   */
  const onCameraSettled = useCallback(
    (region: Region) => {
      setCamera(region);
      // Asked for rather than read off `region`, which describes an
      // axis-aligned box and says nothing about rotation.
      void map.current
        ?.getCamera()
        .then((view) => {
          if (typeof view?.heading === 'number') setHeading(view.heading);
        })
        // The heading only turns the arrowheads. Failing to read it must leave
        // them pointing at the last known angle, not take the map down.
        .catch(() => {});

      /**
       * **Two ways to earn the offer, and the second is the one Truman asked
       * for.** Displacement alone means a rider nudging the map around one
       * neighbourhood — the exact gesture for looking at somewhere properly —
       * never gets it, however long they spend. Distance *travelled* does, so a
       * wiggle in place eventually offers to re-search where they are looking.
       *
       * Displacement is kept as well, because it is the faster of the two for
       * the case it was written for: one deliberate sweep across town should
       * not have to be paid for twice.
       */
      const previous = lastCamera.current;
      if (previous !== null) panned.current += panScreensBetween(previous, region);
      lastCamera.current = region;

      // Against the *visible* center, not the window's — the window's center is
      // under the sheet on purpose, see `regionAround`.
      if (
        hasDriftedFrom(anchor, region, DRIFT_FRACTION, visibleAbove(detents, detent, mapHeight)) ||
        panned.current > PAN_SCREENS_FOR_OFFER
      ) {
        setOfferedFor(anchor);
      }
    },
    [anchor, detent, detents, mapHeight],
  );

  /**
   * Offered rather than taken: the stops on screen are still the ones the
   * anchor found, and they stay that way until a rider says otherwise. Any
   * anchor move — this button, a long press, ⌖ — retires the offer, because
   * `anchor` is a fresh object each time it moves.
   */
  /**
   * Never offered in route mode: *Search this area* replaces the anchor's stop
   * set, and in route mode that set is not what the pins are showing, so taking
   * it up would appear to do nothing at all.
   */
  const offering = offeredFor === anchor && routeMode === null;

  /**
   * The map's chrome, stacked downward from the safe area: the search bar
   * first, then the location banner if there is one, then ⌖ and *Search this
   * area* side by side.
   *
   * The bar is the newest thing at the top and everything else moves down by
   * exactly its allowance — which reopened Increment 6's deferral of persistent
   * chrome at the map's edges. Truman reopened it knowingly on 2026-08-09.
   */
  const bannerShowing = locationStatus === 'denied' || locationStatus === 'error';
  const barTop = insets.top + CONTROL_INSET;
  /**
   * Directly under the bar, because it names what the map is currently showing
   * and the bar is what a rider used to change that. Everything below it — the
   * location banner, ⌖, the compass — moves down only while it is on screen.
   *
   * Present for as long as route mode is, not for as long as the route's row
   * has loaded: the two are a query apart, and letting the name's arrival move
   * ⌖ and the compass down would be a visible shudder every time a route is
   * opened.
   */
  const pillTop = barTop + SEARCH_BAR_ALLOWANCE;
  const bannerTop = pillTop + (routeMode === null ? 0 : ROUTE_PILL_ALLOWANCE);
  const controlsTop = bannerTop + (bannerShowing ? BANNER_ALLOWANCE : 0);

  /**
   * **Not** the centring mechanism — `regionAround` does that, and says why.
   * On Apple Maps this prop becomes the view's `layoutMargins`, which is what
   * positions the compass and Apple's own legal label. Setting it moves those
   * two, and nothing else.
   *
   * **The top is what keeps the compass reachable.** The search bar is drawn
   * over the map's top-right corner, which is where MapKit puts the compass,
   * and on a device it hid it — reported 2026-08-09 with a screenshot showing
   * the compass peeking out from behind the bar. So the top margin clears the
   * bar *and* ⌖ below it, which drops the compass into open map underneath the
   * pair rather than into a collision with the button.
   *
   * That the compass follows `layoutMargins` at all is this repo's own recorded
   * reading, not something measured here — **confirm it on a device** rather
   * than trusting this comment.
   */
  /**
   * The bottom is fixed at the peek line, and it does not move.
   *
   * This has now been all three things. Derived from the settled detent, it sat
   * still through a drag and jumped when the sheet landed. Driven from the
   * sheet's animated position, it *tracked* — and Truman's word for the result
   * was "very jittery", which is what a native view prop being reassigned from
   * a JavaScript state update sixty times a second looks like. It was never
   * going to be smooth: `mapPadding` is an ordinary prop, not an animatable
   * one, so every frame is a round trip.
   *
   * So it is a constant. Apple's legal label sits just above the collapsed
   * sheet — visible in the resting state, covered while a rider has actively
   * raised the sheet over it, and never in motion.
   *
   * Truman asked whether it could simply live in the bottom-left corner and be
   * hidden by the sheet at every detent. Almost: MapKit's usage terms ask that
   * the label not be obscured, and pinning it one detent up keeps it visible
   * in the state the map is nearly always in, for no cost.
   */
  /**
   * Directly under ⌖, separated by the same gap ⌖ has under the search bar.
   *
   * Stated as that relationship rather than as a number, so it holds when the
   * bar's height changes, when the banner appears and pushes ⌖ down, and when
   * the safe area differs on another phone. `controlsTop` already carries all
   * three. The two edges of the stack read off the same `CONTROL_INSET`, which
   * is what makes the spacing visibly even rather than accidentally so.
   */
  const compassTop = controlsTop + CONTROL_SIZE + CONTROL_INSET;

  const mapPadding = useMemo(
    () => ({
      // Where the compass should *be*, less what MapKit adds on its own.
      top: compassTop - COMPASS_LAYOUT_OFFSET.top,
      left: 0,
      right: CONTROL_EDGE_INSET - COMPASS_LAYOUT_OFFSET.right,
      bottom: detents[PEEK_DETENT],
    }),
    [compassTop, detents],
  );

  /**
   * The camera moves in exactly four situations: a ⌖ recenter, the first time
   * the anchor turns out to be the rider's own location, a *Search here* taken
   * up from a long press, and a stop picked out of the search. Nowhere else —
   * not on a pin tap, not on a poll, and not on *Search this area*.
   *
   * Three of the four *frame*, rebuilding the window from the query radius,
   * because each is the map being opened on somewhere. *Search here* only
   * *pans* — see `panTo`.
   *
   * This used to be an effect on the memoised `region`, which made *every*
   * anchor change a camera move. That is no longer expressible: the anchor now
   * moves in cases where the camera must not, so the rule is stated here
   * instead of emerging from a dependency array. Each of the four is one
   * explicit call, which is what keeps a fifth from appearing by accident.
   *
   * `against` is the detent to leave room for, and it defaults to the one the
   * sheet is settled on — the same parameter, for the same reason, as `panTo`'s.
   */
  const frameOn = useCallback(
    (center: Coords, against: number = detent, radiusMeters: number = NEARBY_RADIUS_METERS) => {
      map.current?.animateToRegion(
        regionAround(
          center,
          radiusMeters,
          visibleAbove(detents, against, mapHeight),
        ),
        CAMERA_MS,
      );
    },
    [detent, detents, mapHeight],
  );

  /**
   * Travel without zooming: the window keeps the spans it already has and only
   * its center moves. `frameOn` rebuilds the window from the query radius,
   * which is right for opening the map on somewhere and wrong for going to a
   * point on a street a rider has already zoomed into.
   *
   * `against` is the detent to leave room for, and it defaults to the one the
   * sheet is settled on. Selection overrides it, because selection *raises*
   * the sheet — see `select`.
   */
  const panTo = useCallback(
    (center: Coords, against: number = detent) => {
      // `camera` is null only before the map has ever reported a region, in
      // which case what is on screen is `initialRegion` — so its spans are the
      // ones to preserve.
      const base = camera ?? region;
      map.current?.animateToRegion(
        centeredOn(base, center, visibleAbove(detents, against, mapHeight)),
        CAMERA_MS,
      );
    },
    [camera, region, detent, detents, mapHeight],
  );

  /** Set once the camera has been put on the rider, so it is not done twice. */
  const framedOnRider = useRef(false);

  useEffect(() => {
    if (framedOnRider.current || source !== 'location') return;
    framedOnRider.current = true;
    frameOn(anchor);
  }, [source, anchor, frameOn]);

  useEffect(() => {
    let cancelled = false;
    loadFavorites()
      .then((ids) => {
        if (!cancelled) setFavoriteIds(ids);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The route's stops and identity, loaded when route mode changes.
   *
   * Keyed on the route id alone, not on the direction: flipping direction is a
   * choice about what to *draw* from data already in hand, and re-querying for
   * it would blank the sheet for a frame every time a rider tapped the control.
   *
   * `routeDetail` carries the id it was loaded for, so a render between the
   * store changing and this effect resolving draws nothing rather than drawing
   * the previous route's stops under the new route's name.
   */
  useEffect(() => {
    if (routeMode === null) {
      setRouteDetail(null);
      return;
    }
    const { routeId } = routeMode;
    let cancelled = false;
    void Promise.all([routeById(routeId), routeStops(routeId)])
      .then(([route, directions]) => {
        if (!cancelled) setRouteDetail({ routeId, route, directions });
      })
      .catch(() => {
        if (!cancelled) setRouteDetail({ routeId, route: null, directions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [routeMode, routeById, routeStops]);

  /** Null unless the loaded detail is for the route currently being shown. */
  const loadedRoute = routeDetail?.routeId === routeMode?.routeId ? routeDetail : null;

  /**
   * The direction being drawn, clamped: `routeMode` stores an index because it
   * cannot know how many directions a route has, and 34 of Oahu's routes run
   * only one way.
   */
  const direction = useMemo(() => {
    const directions = loadedRoute?.directions ?? [];
    if (directions.length === 0) return null;
    return directions[Math.min(routeMode?.directionIndex ?? 0, directions.length - 1)] ?? null;
  }, [loadedRoute, routeMode]);

  /**
   * The route's stops carrying their distance from the anchor.
   *
   * The distance is not shown in the route list — rows show the sequence — but
   * the pins and the label culler both take `StopWithDistance`, and selecting
   * one opens the card, which shows how far away it is. Measuring from the
   * anchor is the same thing every other distance on this screen means.
   */
  const routeStopsInOrder = useMemo(
    () =>
      (direction?.stops ?? []).map((stop) => ({
        ...stop,
        meters: metersBetween(anchor, stop),
      })),
    [direction, anchor],
  );

  /**
   * One marker per *stop*, where the list above is one row per *call*.
   *
   * **Eight of Oahu's route/directions serve the same stop twice** — 60 and 83
   * at stop 2190, 40 at 4416/4417, 521, 421 — verified against the asset on
   * 2026-08-09. The list should show both, because the bus really does come
   * back; the map must not, because the second marker is drawn at the same
   * coordinate as the first and adds nothing but a duplicate.
   *
   * And a duplicate is not merely wasteful here. Both markers took
   * `key={stop.stop_id}`, so React rendered two children with the same key —
   * Truman saw the warning by name on 2026-08-09 — and both were handed to
   * MapKit under the same `identifier`. Degraded reconciliation across the one
   * seam this project knows corrupts is not a thing to leave lying around, and
   * `RouteScreen` had already dealt with its half of it.
   */
  const routePins = useMemo(() => {
    const seen = new Set<string>();
    return routeStopsInOrder.filter((stop) => {
      if (seen.has(stop.stop_id)) return false;
      seen.add(stop.stop_id);
      return true;
    });
  }, [routeStopsInOrder]);

  /**
   * Which way the drawn direction is signed, and which ways the route is signed
   * at all.
   *
   * Null until the route's directions have loaded, which reads as "no direction
   * filter" and so draws every bus on the route — the same thing the map did
   * before Increment 9, for the second or two before the query returns, rather
   * than an empty map that fills in.
   */
  const directionFilter = useMemo(() => {
    if (direction === null) return null;
    return {
      showing: direction.headsigns,
      known: (loadedRoute?.directions ?? []).flatMap((each) => each.headsigns),
    };
  }, [direction, loadedRoute]);

  /**
   * The buses on this route, right now.
   *
   * Keyed on the route's `short_name` rather than its id, because that is what
   * the fleet response carries. Null when no route is showing, and then nothing
   * is requested at all.
   */
  const { buses, failure: busFailure, fetchedAt: busesFetchedAt, lateCount } = useVehicles(
    client,
    loadedRoute?.route?.short_name ?? null,
    directionFilter,
  );

  /**
   * What the route band says about the live layer.
   *
   * **`failure` used to be dropped here**, which left a rejected key, an
   * unreachable API and a route with genuinely no buses running all rendering
   * as the same empty map — the ambiguity `CLAUDE.md` names as the thing that
   * makes a transit app untrustworthy.
   *
   * The four-way decision and the reason its order matters live in
   * `busLayerFor`, which is a pure function so that order can be tested without
   * a poll, an age-out, and fake timers in a real-timer suite.
   */
  const busLayer = useMemo(
    () => busLayerFor(buses.length, lateCount, busFailure, busesFetchedAt),
    [buses.length, lateCount, busFailure, busesFetchedAt],
  );

  /**
   * The arrival a rider tapped in the card, or null.
   *
   * Two things hang off it, and they are independent on purpose. The **bus**
   * lights up when a drawn bus shares its trip id — a join that may simply not
   * land, since only about one arrival in ten has a bus reporting against it.
   * The **line** switches to the variant the arrival names, which every arrival
   * carries, so a rider who taps a short-turn sees the road that bus is
   * actually on even when its position is unknown.
   */
  const [selectedArrival, setSelectedArrival] = useState<Arrival | null>(null);

  /** A new stop is a new board; the arrival selected on the last one is gone. */
  useEffect(() => {
    setSelectedArrival(null);
  }, [selectedStop?.stop_id, routeMode?.routeId, routeMode?.directionIndex]);

  /**
   * The bus a rider tapped, by fleet number, or null.
   *
   * **A number rather than the `BusOnMap`.** Every poll replaces the objects,
   * so holding one would keep a sixty-second-old position selected while the
   * bus it names had moved — and the popup's whole content is how fresh that
   * position is. The fleet number is the only stable identity a bus has, which
   * is also why `BusMarker` is keyed on it.
   */
  const [selectedBusNumber, setSelectedBusNumber] = useState<string | null>(null);

  /**
   * Leaving route mode, flipping direction, or changing route drops the
   * selection. The bus layer is emptied and rebuilt in each of those, so an
   * open popup would be a popup for a bus no longer drawn.
   */
  useEffect(() => {
    setSelectedBusNumber(null);
  }, [routeMode?.routeId, routeMode?.directionIndex]);

  /**
   * The drawn bus behind the selected arrival, joined on trip id, or null.
   *
   * Hoisted out of the render so the labeller and the markers cannot disagree
   * about which bus is highlighted — one keeps its fleet number at any zoom and
   * the other draws larger, and a rider seeing one without the other would read
   * it as the tap having half worked.
   *
   * Null far more often than not: only about one arrival in ten has a bus
   * reporting against it. That is why the *line* switches on the arrival's own
   * shape instead, which every arrival carries.
   */
  const highlightedBus = useMemo(() => {
    if (selectedArrival === null) return null;
    return buses.find((bus) => bus.vehicle.tripId === selectedArrival.tripId) ?? null;
  }, [buses, selectedArrival]);

  /**
   * A bus that has aged off the map, or moved onto the other direction's line,
   * takes its popup with it. Resolved against the current list every poll
   * rather than remembered, so the selection cannot outlive what it names.
   */
  const selectedBus = useMemo(
    () => buses.find((bus) => bus.vehicle.number === selectedBusNumber) ?? null,
    [buses, selectedBusNumber],
  );

  /**
   * Tapping a live arrival takes the rider **to the bus**: centered, at street
   * zoom, with its popup open.
   *
   * **Two selections, and the tap only ever set one.** `selectedArrival` draws
   * the bus larger and keeps its fleet number at any zoom; `selectedBusNumber`
   * is what opens the popup with the lateness and the next stop. A rider who
   * taps a row expecting *that bus* gets both here, which is what Truman asked
   * for in the round-4 pass: "tapping the arrival row with a live bus should
   * center and trigger its icon on the map."
   *
   * **An effect rather than a line inside `selectArrival`**, because the bus is
   * routinely not there yet. Arriving from `/stop/[code]` sets the route,
   * selects the stop and preselects the trip, while the fleet request that will
   * produce the bus has only just gone out — so a join attempted at selection
   * time misses, and the rider gets a card with no bus and no explanation. This
   * fires whenever the join *lands*, however late.
   *
   * The ref is what keeps it a one-shot per arrival. `frameOn` and `detent`
   * both change identity as the camera settles, so without it the map would
   * drag itself back onto the bus every time the rider panned away.
   */
  const centeredForArrival = useRef<string | null>(null);

  useEffect(() => {
    if (selectedArrival === null) {
      centeredForArrival.current = null;
      return;
    }
    if (highlightedBus === null) return;
    if (centeredForArrival.current === selectedArrival.id) return;
    centeredForArrival.current = selectedArrival.id;

    setSelectedBusNumber(highlightedBus.vehicle.number);
    // A sheet at full height hides the bus it just centered on. Down to medium,
    // never up: a rider at peek asked for the map, and the bus is on it.
    if (detent > MEDIUM_DETENT) sheet.current?.snapToIndex(MEDIUM_DETENT);
    frameOn(
      highlightedBus.vehicle.position,
      Math.min(detent, MEDIUM_DETENT),
      BUS_FRAME_METERS,
    );
  }, [selectedArrival, highlightedBus, detent, frameOn]);

  /**
   * The trip of a row that promised a live bus the map has not got.
   *
   * **The residual case, once the direction bug is fixed.** The row's offer is
   * gated on a fleet snapshot up to `FLEET_TTL_MS` old, while the map draws
   * from one at most `VEHICLE_POLL_MS` old — so a bus can stop reporting in
   * between, and the row that said *Live · Bus 261* leads to a map with no
   * dot. Truman's standing requirement is that these two never disagree
   * silently; when they unavoidably do, the row says so rather than leaving the
   * app looking broken.
   *
   * **`busesFetchedAt` is the guard that stops it being a lie.** Until the
   * first fleet answer lands, every arrival has no bus — that is loading, not
   * a bus gone dark, and the pair `CLAUDE.md` says must never render alike.
   */
  const arrivalWithoutBus =
    selectedArrival !== null &&
    selectedArrival.estimate === 'live' &&
    selectedArrival.vehicle !== null &&
    highlightedBus === null &&
    busesFetchedAt !== null
      ? selectedArrival.tripId
      : null;

  /**
   * The line the map draws, decoded from the direction's representative shape.
   *
   * Empty rather than null: `RouteLine` is always mounted and only its
   * coordinates change, because mounting a child inside `MapView` is the seam
   * with a SIGABRT behind it. A direction the feed gave no shape draws nothing —
   * it does **not** fall back to joining the stops up, which is 1.3 km wrong at
   * p90.
   */
  const [linePoints, setLinePoints] = useState<readonly Coords[]>([]);

  useEffect(() => {
    // A selected arrival names the exact variant its bus is running, which is
    // not necessarily the representative the route view draws — a short-turn or
    // an express is a different line. Present on every arrival, unlike a
    // position.
    const shapeId = selectedArrival?.shape ?? direction?.shapeId ?? null;
    if (shapeId === null) {
      setLinePoints([]);
      return;
    }
    let cancelled = false;
    void shapeById(shapeId)
      .then((points) => {
        if (!cancelled) setLinePoints(points ?? []);
      })
      .catch(() => {
        if (!cancelled) setLinePoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedArrival, direction, shapeById]);

  /**
   * What the map draws pins for: the route's stops in route mode, the anchor's
   * otherwise. **One set, never both** — two overlapping stop sets on one map is
   * how a rider stops being able to tell what they are looking at.
   */
  const pins = routeMode === null ? stops : routePins;

  useEffect(() => {
    const ids = pins.map((stop) => stop.stop_id);
    if (ids.length === 0) return;

    let cancelled = false;
    routesForStops(ids)
      .then((routes) => {
        if (!cancelled) setRoutesByStop(routes);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [pins, routesForStops]);

  /**
   * Pin tap and row tap take exactly this path, so the two cannot drift into
   * behaving differently.
   *
   * It **sets**; it never clears. A pin tap means "this one", so a mis-aimed
   * tap on the pin already selected must not close the card being read —
   * dismissal is the back control, which says what it does.
   *
   * And it raises the sheet only from below medium. Snapping unconditionally
   * takes back height the rider asked for: on a device, selecting a row while
   * reading the list at full height dropped the sheet to half and moved the
   * row out from under the thumb that had just touched it.
   *
   * **`pan` is the one thing the two callers disagree about.** A row names a
   * stop the rider cannot see — the map behind the sheet is showing whatever it
   * was showing — so the map goes to it. A pin *is* the thing on the map, and
   * travelling to something already under the thumb reads as a lurch for no
   * reason. Truman's call, made against the argument that a pin tapped low on
   * screen ends up behind the risen sheet.
   *
   * One function either way, so the two paths cannot drift apart in *what*
   * they select.
   */
  const select = useCallback(
    (stop: StopWithDistance, { pan }: { pan: boolean }) => {
      setSelectedStop(stop);
      // **Both ways to medium, and coming down is the newer half.** Raising
      // from peek was always here. Coming down from full is Truman's call from
      // the round-4 device pass: selecting a stop while the sheet covers the
      // screen used to leave it covering the screen, so the thing just selected
      // was behind it. The argument that once stopped this — that dropping the
      // sheet moves the row out from under the thumb that just touched it —
      // does not apply to a *stop*: selecting one replaces the whole list with
      // that stop's card, so there is no row left under the thumb either way.
      if (detent !== MEDIUM_DETENT) sheet.current?.snapToIndex(MEDIUM_DETENT);
      // Against the detent the sheet is *heading to*, not the one it is
      // leaving. Selection raises the sheet, so framing against the peek would
      // put the stop under where the sheet is about to be.
      if (pan) panTo(stop, MEDIUM_DETENT);
    },
    [detent, panTo],
  );

  /** The sheet's rows. The map travels; see `select`. */
  const selectFromList = useCallback(
    (stop: StopWithDistance) => select(stop, { pan: true }),
    [select],
  );

  /** Back out of the card to the nearby list. The sheet keeps its height. */
  const clearSelection = useCallback(() => {
    setSelectedStop(null);
  }, []);

  /**
   * A tap on empty map dismisses, and dismisses only. It used to move the
   * anchor, which meant a thumb landing an inch wide of a pin threw away both
   * the stop set and the card being read.
   */
  const onMapPress = useCallback(() => {
    setSelectedStop(null);
    setPending(null);
    // A tap on the map dismisses everything it can dismiss. Before this the
    // only way to close a bus popup was to find and re-tap that exact dot,
    // which is a small target and not where anyone reaches to dismiss.
    setSelectedBusNumber(null);
  }, []);

  /**
   * A long press does not search. It drops a marker and offers to, so a stray
   * one costs a dismissal rather than the whole view — and so the gesture is
   * cancellable after it has fired, which a long press that searched could not
   * be.
   *
   * **It does nothing at all in route mode**, for the same reason *Search this
   * area* is suppressed there — see `offering`. Taking the offer up replaces the
   * anchor's stop set, and in route mode the pins are the route's stops, so the
   * map would look identical afterwards and the gesture would read as broken.
   * Truman asked for this on 2026-08-09; the pair had only ever been half done.
   */
  const onMapLongPress = useCallback(
    (event: LongPressEvent) => {
      if (routeMode !== null) return;
      const { latitude, longitude } = event.nativeEvent.coordinate;
      setPending({ lat: latitude, lon: longitude });
    },
    [routeMode],
  );

  const searchFrom = useCallback(
    (coords: Coords) => {
      setPending(null);
      // The set behind the card is about to be replaced, and a card for a stop
      // no longer in the list would keep polling for it.
      setSelectedStop(null);
      setAnchor(coords);
    },
    [setAnchor],
  );

  /**
   * A long press is the one anchor gesture that *does* move the camera.
   *
   * The rule everywhere else is that the camera stays where a rider put it —
   * see `frameOn`. This is the exception, and the reason it is one: a long
   * press names a point, and the point named is very often near the edge of the
   * screen or under the sheet, so leaving the camera alone would answer the
   * question by putting the answer somewhere you cannot see it. *Search this
   * area* is deliberately **not** given the same treatment: it names the area
   * already on screen, so there is nothing to travel to.
   *
   * It **pans**; it does not reframe. The rider picked both the point and the
   * zoom, and only one of those was a question.
   */
  const searchHere = useCallback(
    (coords: Coords) => {
      searchFrom(coords);
      panTo(coords);
    },
    [searchFrom, panTo],
  );

  const searchThisArea = useCallback(() => {
    if (camera === null) return;
    searchFrom(visibleCenter(camera, visibleAbove(detents, detent, mapHeight)));
  }, [camera, detent, detents, mapHeight, searchFrom]);

  /**
   * Restarted on every pin tap rather than left to run out, so tapping through
   * four stops in a row keeps the map still throughout rather than letting the
   * zoom back in between the third and the fourth.
   */
  const holdZoomOff = useCallback(() => {
    releaseZoom.current?.();
    setZoomEnabled(false);
    releaseZoom.current = schedule(() => setZoomEnabled(true), ZOOM_LOCKOUT_MS);
  }, []);

  useEffect(() => () => releaseZoom.current?.(), []);

  /**
   * The latest `select`, held in a ref so `onPinPress` can be handed to every
   * marker without changing identity.
   *
   * **`select` changes identity constantly, and that used to reach the markers.**
   * It depends on `panTo`, which depends on `camera` — a fresh object out of
   * `onRegionChangeComplete` on every pan and every zoom. So `onPinPress` was a
   * new function each time the camera settled, and since `StopMarker` is
   * memoised with a shallow compare, *every marker on the map re-rendered*: 61
   * of them on Route 10, on every settle, each one a props update across the
   * `react-native-maps` seam.
   *
   * `StopMarker`'s own header asks for exactly this not to happen — "a fresh
   * arrow per stop per render would defeat `memo` entirely, and re-rendering
   * markers is the cost this component is shaped to avoid". Passing the stop
   * rather than closing over it achieved that for the *stop*, and then the
   * handler's own identity gave it straight back.
   *
   * Updated on every render rather than in an effect, so a press can never read
   * a `select` from before the last commit — which is what the note below was
   * guarding against.
   */
  const selectRef = useRef(select);
  selectRef.current = select;

  const onPinPress = useCallback(
    (stop: StopWithDistance, event: MarkerPressEvent) => {
      // Without this the press also reaches `MapView`'s `onPress`, and the tap
      // that selected a stop dismisses it again in the same gesture.
      event.stopPropagation();
      holdZoomOff();
      // Through the ref: `select` reads the settled detent, so a captured copy
      // would be one that thinks the sheet is still at peek — and would lower it.
      selectRef.current(stop, { pan: false });
    },
    [holdZoomOff],
  );

  /**
   * Where the selected bus is heading next — the extra line in its popup, and
   * what a second tap takes.
   *
   * **A fact about the bus, not about the camera.** It used to be the stop the
   * dot was *covering*, which changed as the rider zoomed; this is derived from
   * the route's own line, so it is the same answer at every scale. Only for the
   * selected bus: it walks the whole shape, which is not work to do for every
   * dot on every poll.
   *
   * Null when the bus is nowhere near the drawn line — the other direction's
   * bus, or one the feed has misplaced — because projecting it would produce a
   * confident answer about a road it is not on.
   */
  const nextStopForSelectedBus = useMemo(() => {
    if (selectedBus === null || linePoints.length < 2) return null;
    const at = selectedBus.vehicle.position;
    if (!isOnLine(linePoints, at)) return null;
    return nextStopAlong(linePoints, routeStopsInOrder, at);
  }, [selectedBus, linePoints, routeStopsInOrder]);

  /**
   * A tap on a bus, which is now the bus's own.
   *
   * **It used to be given away entirely.** Buses draw above the stops and
   * MapKit gives the tap to the annotation on top, so a stop pin under a dot
   * needed two presses — one absorbed by the bus, one that got through — and
   * `651bb07` fixed that by having the bus find the stop underneath and select
   * it instead. That made pins reachable and made buses untappable.
   *
   * Increment 9 gives the bus the tap and keeps the guarantee: the popup names
   * the covered stop, and `BusMarker` takes it on the next press. Nothing
   * becomes unreachable and nobody has to hit a pin they cannot see.
   *
   * Pressing the selected bus again with nothing underneath closes the popup,
   * which is the only way to dismiss it without touching the map.
   *
   * Through a ref for the same reason `onPinPress` is: a handler that changed
   * identity when the camera settled would re-render every bus on the map on
   * every pan.
   */
  const busPressRef = useRef<(bus: BusOnMap, event: MarkerPressEvent) => void>(() => {});
  busPressRef.current = (bus, event) => {
    // Without this the press also reaches `MapView`'s `onPress`, which would
    // dismiss the popup in the same gesture that opened it.
    event.stopPropagation();
    holdZoomOff();
    setSelectedBusNumber((current) =>
      current === bus.vehicle.number ? null : bus.vehicle.number,
    );
  };
  const onBusPress = useCallback((bus: BusOnMap, event: MarkerPressEvent) => {
    busPressRef.current(bus, event);
  }, []);

  /**
   * The popup's next-stop line, taken. Selecting the stop closes the popup.
   *
   * The pressed stop is not read off the argument: `nextStopForSelectedBus` is
   * the only stop `BusMarker` can offer, and it comes out of
   * `routeStopsInOrder`, which carries the distance `select` wants. Taking it
   * from the ref keeps that rather than looking the row up again.
   */
  const nextStopPressRef = useRef<() => void>(() => {});
  nextStopPressRef.current = () => {
    const stop = nextStopForSelectedBus;
    if (stop === null) return;
    const withDistance = routeStopsInOrder.find((row) => row.stop_id === stop.stop_id);
    if (withDistance === undefined) return;
    setSelectedBusNumber(null);
    holdZoomOff();
    selectRef.current(withDistance, { pan: false });
  };
  const onPressNextStop = useCallback(() => {
    nextStopPressRef.current();
  }, []);

  /**
   * Picking a route **on the map** draws it here rather than pushing
   * `/route/[id]` — the whole point of the increment. `RouteScreen` is untouched
   * and is still what the Stops tab opens.
   *
   * The open card is dropped: the stop set behind it is about to be replaced by
   * the route's own, and a card for a stop no longer among the pins would keep
   * polling for it. The same reasoning as `searchFrom`.
   */
  /**
   * When the marker swap now in flight will have landed, and the reason any of
   * this exists.
   *
   * **Every control here replaces the map's markers wholesale.** The two
   * directions of route 2 share *2 stops out of 68*, so a flip takes 66
   * annotations off and puts 66 on in one commit; the X is larger again,
   * dropping the whole route and bringing the nearby stops back. Issue a second
   * one of those while the first is still being applied and the map is handed
   * insertions against a subview array that has already moved underneath it —
   * the out-of-range `-[__NSArrayM insertObject:atIndex:]` in `docs/backlog.md`.
   *
   * Truman reproduced it two ways on 2026-08-09: spamming the flip control, and
   * a flip followed quickly by the X. **One window, shared**, because the pair
   * is what crashes — guarding only the control that happens to be tapped twice
   * would have fixed the first and left the second.
   *
   * This cannot be fixed at the native seam: Expo Go rules out patching
   * `react-native-maps`. Nor by making the swap small enough not to matter —
   * holding both directions' stops at once means 134 markers and both sides of
   * every street, which is a worse map. Serialising the swaps is the only join
   * this app owns.
   */
  const swapBusyUntil = useRef(0);
  const cancelDeferredLeave = useRef<(() => void) | null>(null);

  /** A close held over the window must not fire into an unmounted screen. */
  useEffect(() => () => cancelDeferredLeave.current?.(), []);

  /**
   * Entering is a wholesale swap too, and deliberately does **not** arm the
   * window. Nothing has crashed from it: reaching this needs a search to be
   * opened, a result found and tapped, so the gap before any other control can
   * be reached is human-scale rather than the sub-second one that breaks the
   * map. Arming it would buy nothing and would silently swallow a flip tapped
   * immediately after a route opens.
   */
  const openRoute = useCallback((route: RouteSummary) => {
    setSelectedStop(null);
    setPending(null);
    enterRouteMode(route.route_id);
  }, []);

  /**
   * The X, and the only thing that leaves route mode. Panning does not, and
   * changing tab does not — both were put to Truman explicitly.
   *
   * **Deferred rather than dropped**, which is the difference between this and
   * `flipRoute`. A rider who taps X has asked to be out of route mode, and a
   * close that silently does nothing is a broken app; a flip that does nothing
   * is a flip they get to ask for again. So a close inside the window is held
   * until the window ends and then honoured, at most one deep.
   */
  const leaveRoute = useCallback(() => {
    const swap = () => {
      swapBusyUntil.current = Date.now() + SWAP_LOCKOUT_MS;
      setSelectedStop(null);
      leaveRouteMode();
    };

    const wait = swapBusyUntil.current - Date.now();
    if (wait <= 0) {
      swap();
      return;
    }
    cancelDeferredLeave.current?.();
    cancelDeferredLeave.current = schedule(() => {
      cancelDeferredLeave.current = null;
      swap();
    }, wait);
  }, []);

  /**
   * A flip, unless a swap is still landing.
   *
   * **Dropped rather than queued.** A tap that arrives mid-swap is a rider
   * drumming the button, and honouring it would land them back where they
   * started; the flip they can see is the one they asked for.
   */
  const flipRoute = useCallback(() => {
    const now = Date.now();
    if (now < swapBusyUntil.current) return;
    swapBusyUntil.current = now + SWAP_LOCKOUT_MS;
    flipDirection();
  }, []);

  /**
   * A stop picked out of the search, which is the only thing this search does
   * that the Stops tab cannot — and therefore the only reason it exists.
   *
   * The rider **stays on the map**: the search closes, the anchor moves to the
   * stop, the camera frames it and the card opens on it. The Stops tab's
   * equivalent pushes `/stop/[code]` and leaves the map behind.
   *
   * Three things follow from anchoring *on* the stop. It is zero metres from
   * the new anchor, which is what the nearby query is about to say too, so the
   * card is handed that rather than a distance from wherever the rider was.
   * `setAnchor` rather than `searchFrom`, because that clears the selection and
   * the selection is the point here. And the camera *frames* rather than pans —
   * this is the map being opened on somewhere, like ⌖ and the first fix, not a
   * short hop across a street a rider has already zoomed into.
   */
  const selectFromSearch = useCallback(
    (stop: Stop) => {
      const at: Coords = { lat: stop.lat, lon: stop.lon };
      setSearching(false);
      // A long press left waiting for an answer is about somewhere else now.
      setPending(null);
      setAnchor(at);
      select({ ...stop, meters: 0 }, { pan: false });
      // Against the detent the sheet is heading to, not the one it is leaving —
      // see `select`.
      frameOn(at, MEDIUM_DETENT);
    },
    [setAnchor, select, frameOn],
  );

  /**
   * A confirmed address, which moves the anchor and nothing else.
   *
   * `searchFrom` rather than a bare `setAnchor`, because this is the same kind
   * of move as *Search here*: the stop set behind any open card is about to be
   * replaced, and a card for a stop no longer in the list would keep polling
   * for it. No stop is selected — an address is a place, not a stop.
   *
   * It **frames** where *Search here* pans. A long press names a point on a map
   * a rider is already looking at, at a zoom they chose; a typed address is the
   * map being opened somewhere else entirely, and keeping a street-level zoom
   * from across town would arrive showing one block and no stops.
   */
  const searchAddress = useCallback(
    (coords: Coords) => {
      setSearching(false);
      searchFrom(coords);
      frameOn(coords);
    },
    [searchFrom, frameOn],
  );

  /**
   * A route picked out of the search draws it here. The search closes first, so
   * what a rider sees underneath is the route appearing on the map they were
   * already looking at rather than a screen being pushed over it.
   */
  const openRouteFromSearch = useCallback(
    (route: RouteSummary) => {
      setSearching(false);
      openRoute(route);
    },
    [openRoute],
  );

  /**
   * *Show me that on the map*, arriving from a long press somewhere else.
   *
   * Four rows across the app can ask for this — a stop, a route, an arrival's
   * route, an arrival's bus — and every one of them lands here. The request is
   * **cleared as soon as it is read**, before any of the work it asks for has
   * finished, because acting on one twice is worse than not acting: a rider who
   * comes back to the Map tab an hour later must not be thrown to a stop they
   * looked up once.
   *
   * `selectFromSearch` is reused for the stop, deliberately. Arriving from a
   * long press and arriving from the search field are the same event as far as
   * the map is concerned — the map being *opened somewhere* — so both anchor,
   * frame the camera and open the card, rather than one of them growing a
   * subtly different version of it.
   */
  const [preselect, setPreselect] = useState<{ stopId: string; tripId: string } | null>(null);
  const request = useMapRequest();
  const applyRequest = useRef<(request: MapRequest) => void>(() => {});
  applyRequest.current = (asked) => {
    if (asked.kind === 'route') {
      // `showOnMap` already entered route mode, so the map was drawing it
      // before this screen even rendered. Nothing left to do.
      return;
    }

    if (asked.kind === 'stop') {
      void stopsByIds([asked.stopId]).then(([stop]) => {
        if (stop !== undefined) selectFromSearchRef.current(stop);
      });
      return;
    }

    void (async () => {
      // `short_name` is all an arrival has, and `routeMode` keys on `route_id`.
      // A route the asset does not carry leaves the map where it was rather
      // than half-entering route mode.
      const route = await routeByShortName(asked.routeName);
      if (route !== null) {
        // **Which way, resolved before entering rather than after.** Entering
        // at 0 and correcting would fire every effect keyed on
        // `directionIndex` twice — dropping the selection this request is in
        // the middle of making — and flash the wrong direction's line on the
        // way past. One extra local query buys the map opening right the first
        // time. `undefined` leaves the direction alone; see `directionIndexFor`.
        const directions = await routeStops(route.route_id);
        enterRouteMode(route.route_id, directionIndexFor(directions, asked.headsign));
      }
      if (asked.stopId === null) return;
      // **Only with a route to draw.** `onSelectArrival` is wired to route
      // mode, so a trip recorded without one could never be consumed — it
      // would sit waiting to fire at some later selection of the same stop.
      if (asked.tripId !== null && route !== null) {
        setPreselect({ stopId: asked.stopId, tripId: asked.tripId });
      }
      const [stop] = await stopsByIds([asked.stopId]);
      if (stop !== undefined) selectFromSearchRef.current(stop);
    })();
  };

  /**
   * Through a ref, like every other handler on this screen: `selectFromSearch`
   * changes identity whenever the camera or the detent does, and an effect
   * depending on it would re-run — re-applying a request that has already been
   * cleared, or worse, one that has not.
   */
  const selectFromSearchRef = useRef(selectFromSearch);
  selectFromSearchRef.current = selectFromSearch;

  useEffect(() => {
    if (request === null) return;
    clearMapRequest();
    applyRequest.current(request);
  }, [request]);

  /**
   * The trip to preselect, but only while the card showing is the one it was
   * asked for.
   *
   * **Derived rather than cleared in an effect**, which is not a style
   * preference: the request selects the stop, so an effect keyed on the
   * selection would fire *after* the trip was recorded and wipe it in the same
   * commit. A different stop is a different board, and this simply stops
   * matching.
   */
  const preselectTripId =
    preselect !== null && preselect.stopId === selectedStop?.stop_id ? preselect.tripId : null;

  /**
   * An arrival being selected — by the popup's own request or by the rider
   * tapping a row — **spends the request**.
   *
   * Without this the derived `preselectTripId` stays non-null for as long as
   * the card is open, and `StopCard`'s effect re-runs on every sixty-second
   * poll (`useArrivals` sets a fresh `board` object each time), quietly
   * reverting whatever the rider selected in between. It also leaves a stale
   * trip standing to fire again the next time that stop is opened.
   */
  const selectArrival = useCallback((arrival: Arrival) => {
    setSelectedArrival(arrival);
    setPreselect(null);
  }, []);

  const toggleFavorite = useCallback(
    async (stopId: string) => {
      try {
        const next = favoriteIds.includes(stopId)
          ? await removeFavorite(stopId)
          : await addFavorite(stopId);
        setFavoriteIds(next);
      } catch {
        // Favorites are not what this screen is for; a failure to persist one
        // is not worth taking the map down over.
      }
    },
    [favoriteIds],
  );

  /**
   * ⌖, and the recovery from every way of not having a location.
   *
   * After a refusal iOS will not show its dialog again, so asking a second
   * time returns `denied` without a prompt and the button does nothing at all.
   * Opening Settings is the only route back, and taking it is what stops a
   * single accidental "Don't Allow" from being permanent. An `error` is
   * different — nothing was refused, so the fix is to ask again.
   */
  const onRecenter = useCallback(async () => {
    if (locationStatus === 'denied') {
      void Linking.openSettings();
      return;
    }

    setSelectedStop(null);
    setPending(null);
    // Claimed before the fix arrives so the first-fix effect does not animate
    // to the same place a moment later.
    framedOnRider.current = true;

    setLocating(true);
    try {
      const coords = await recenter();
      if (coords !== null) frameOn(coords);
    } finally {
      setLocating(false);
    }
  }, [locationStatus, recenter, frameOn]);

  /**
   * The prompt is tied to *opening the map*, which is a deliberate act, rather
   * than to a component mounting — and it fires over a drawn map instead of a
   * grey rectangle. Only from `idle`: once it has been answered, in either
   * direction, asking again is either pointless or a second dialog.
   */
  const onMapReady = useCallback(() => {
    if (locationStatus !== 'idle') return;
    void requestLocation();
  }, [locationStatus, requestLocation]);

  /**
   * Which names go on the map, recomputed only when the camera settles.
   *
   * `camera` is set from `onRegionChangeComplete`, so this does not run during
   * a pan — which matters more than it looks. A marker whose view changes has
   * to be re-snapshotted by iOS, and re-snapshotting twenty of them per frame
   * is how a map with custom markers becomes unusable.
   */
  const labelled = useMemo(
    () =>
      labelledMapIds(
        pins,
        // Reduced to what the labeller needs, so `labels.ts` does not have to
        // know what a `Vehicle` is.
        buses.map((bus) => ({
          number: bus.vehicle.number,
          lat: bus.vehicle.position.lat,
          lon: bus.vehicle.position.lon,
        })),
        camera ?? region,
        {
          width: windowWidth,
          // The whole window: the map is full-screen and the camera's region
          // spans all of it. `visibleHeight` is a separate question.
          height: mapHeight,
          visibleHeight: Math.round(mapHeight * visibleAbove(detents, detent, mapHeight)),
        },
        {
          selectedStopId: selectedStop?.stop_id ?? null,
          // The bus behind a tapped arrival keeps its number at any zoom. The
          // join may simply not land — only about one arrival in ten has a bus
          // reporting against it — in which case nothing is forced.
          highlightedBusNumber: highlightedBus?.vehicle.number ?? null,
          // The tapped bus keeps its popup at any zoom, including route scale,
          // where everything else goes quiet. A tap that does nothing at one
          // zoom is worse than no popup at all.
          selectedBusNumber: selectedBus?.vehicle.number ?? null,
        },
      ),
    [
      pins,
      buses,
      highlightedBus,
      selectedBus,
      camera,
      region,
      windowWidth,
      mapHeight,
      detent,
      detents,
      selectedStop,
    ],
  );

  /**
   * Route scale or street scale, off the same settled camera the labeller
   * reads — so the pins and the names tier together rather than one lagging the
   * other by a frame.
   */
  const scale = useMemo(() => scaleOf(camera ?? region), [camera, region]);

  const banner = locationStatus === 'denied' ? LOCATION_DENIED : LOCATION_ERROR;

  return (
    // No SafeAreaView around the map. A map is one of the few things that
    // should run under the status bar and behind the tab bar; insetting it
    // would leave grey bars top and bottom. What sits *on* it takes the insets.
    <View style={styles.fill} onLayout={onScreenLayout}>
      {/*
        At full height the map is a sliver above the sheet, and every touch that
        lands on it is a miss — a pin tapped by accident, or an anchor gesture
        aimed at the sheet's handle. Blocking the whole view is cruder than
        hit-testing the visible strip and is exactly right: there is nothing up
        there anyone means to touch.
      */}
      <View
        style={styles.fill}
        pointerEvents={detent === FULL_DETENT ? 'none' : 'auto'}
      >
        <MapView
          ref={map}
          style={styles.fill}
          initialRegion={region}
          onPress={onMapPress}
          onLongPress={onMapLongPress}
          onRegionChangeComplete={onCameraSettled}
          onMapReady={onMapReady}
          mapPadding={mapPadding}
          zoomEnabled={zoomEnabled}
          showsUserLocation={locationStatus === 'granted'}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          {/*
            First, and always mounted. Overlays draw under annotations on
            MapKit either way, but the ordering says what is intended — and the
            "always" is load-bearing rather than stylistic; see `RouteLine`.
          */}
          <RouteLine points={linePoints} />

          {/*
            A **fixed** pool of eight, mounted for the life of the map and
            redistributed along whatever of the line is on screen. Before the
            pins, so an arrowhead never sits over one; never a marker per
            segment, which would be a wholesale swap on every direction flip.
            See `RouteArrows`.
          */}
          <RouteArrows points={linePoints} heading={heading} />

          {pins.map((stop) => (
            <StopMarker
              key={stop.stop_id}
              stop={stop}
              selected={selectedStop?.stop_id === stop.stop_id}
              placement={labelled.stops.get(stop.stop_id) ?? null}
              scale={scale}
              onPress={onPinPress}
            />
          ))}

          {/*
            After the pins, for two reasons that happen to want the same thing.

            **Buses draw on top**, and since 2026-08-10 that is `zIndex`'s job
            rather than this ordering's — see `layers.ts`. Render order alone
            was never enough: MapKit's own documentation says annotations
            sharing a z-index are ordered arbitrarily, and on 2026-08-09 a
            route-10 dot was photographed sitting *behind* the JUDD ST + IHOLENA
            ST pin. The ordering here is kept anyway, because of the second
            reason, and because agreeing with the z-index costs nothing.

            **And it is the last variable-length array in the list.** Leaving
            route mode empties `buses` and rebuilds `pins` in one commit. While
            `buses` sat between `RouteLine` and `pins`, every index below it
            shifted as it drained, which is the shape of the out-of-range
            `-[__NSArrayM insertObject:atIndex:]` in `docs/backlog.md`. Last
            means draining it moves no sibling's index.
          */}
          {/*
            **The direction is in the key, and it is not decoration.** It makes
            a flip unmount every bus and mount it again instead of preserving
            it, which is the opposite of what a key is normally for.

            Measured on a device, 2026-08-09, keyed on the fleet number alone:
            one flip dropped the bus dots *below* the stop pins, and a second
            took them off the map entirely while the band still read "9 buses".
            Progressive, repeatable, and nothing to do with the SIGABRT — it
            survived the swap gate that fixed the crash, and the crash never
            came back once the gate was in.

            The buses are the children React *preserves* across a flip: the two
            directions of a route share almost no stops, so `pins` is replaced
            wholesale underneath them, and the annotation that is carried over
            comes out the far side stale. Remounting it re-inserts it cleanly.
            Expo Go rules out fixing that where it actually lives.

            The cost is a re-snapshot of the bus layer per flip — a dozen
            markers, at most once per `SWAP_LOCKOUT_MS`.
          */}
          {buses.map((bus) => (
            <BusMarker
              key={`${routeMode?.directionIndex ?? 'none'}-${bus.vehicle.number}`}
              bus={bus}
              highlighted={bus === highlightedBus}
              selected={bus === selectedBus}
              placement={labelled.buses.get(bus.vehicle.number) ?? null}
              // Null for every bus but the selected one; see the memo.
              nextStop={bus === selectedBus ? nextStopForSelectedBus : null}
              onPress={onBusPress}
              onPressNextStop={onPressNextStop}
            />
          ))}

          {pending === null ? null : <PendingMarker at={pending} onTake={searchHere} />}
        </MapView>
      </View>

      {/*
        A sibling of `MapView`, never a child — the rule the map section of
        `docs/backlog.md` exists for.
      */}
      <SearchBar top={barTop} onPress={() => setSearching(true)} />

      {/*
        What the map is showing, said on the map. The sheet's band says it too
        and is out of sight the moment a rider raises the sheet or simply looks
        at the map — which is exactly when the question is being asked.
      */}
      {routeMode === null ? null : (
        <RoutePill
          routeName={loadedRoute?.route?.short_name ?? null}
          top={pillTop}
          onClose={leaveRoute}
        />
      )}

      {bannerShowing ? (
        <View
          style={[styles.prompt, { top: bannerTop, backgroundColor: palette.background }]}
        >
          <Text style={[styles.promptText, { color: palette.text }]}>{banner}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        // The label follows what the button will actually do. A ⌖ that opens
        // Settings and announces itself as "center on my location" is a lie to
        // exactly the riders who most need to be told.
        accessibilityLabel={locationStatus === 'denied' ? SETTINGS_LABEL : RECENTER_LABEL}
        accessibilityState={{ busy: locating }}
        onPress={onRecenter}
        style={[
          styles.recenter,
          { top: controlsTop, backgroundColor: palette.background, borderColor: palette.border },
        ]}
      >
        {locating ? (
          <ActivityIndicator />
        ) : (
          <Text style={[styles.recenterGlyph, { color: palette.text }]}>⌖</Text>
        )}
      </Pressable>

      {/*
        The discoverable half of the pair. A long press can never teach itself;
        this appears on its own once the camera has been carried away from the
        pins, stays up while the rider looks around, and retires the moment the
        anchor moves — by this button or any other route.
      */}
      {offering ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SEARCH_AREA_LABEL}
          onPress={searchThisArea}
          style={[
            styles.searchArea,
            { top: controlsTop, backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.searchAreaText, { color: palette.text }]}>{SEARCH_AREA_LABEL}</Text>
        </Pressable>
      ) : null}

      <StopSheet
        ref={sheet}
        stops={stops}
        status={status}
        routesByStop={routesByStop}
        favoriteIds={favoriteIds}
        selectedStop={selectedStop}
        onSelect={selectFromList}
        onBack={clearSelection}
        onToggleFavorite={toggleFavorite}
        onOpenRoute={openRoute}
        onDetentChange={setDetent}
        client={client}
        detents={detents}
        tabBarOverlap={tabBarOverlap}
        onSelectArrival={routeMode === null ? undefined : selectArrival}
        selectedTripId={selectedArrival?.tripId ?? null}
        preselectTripId={preselectTripId}
        busMissingTripId={arrivalWithoutBus}
        routeView={
          routeMode === null
            ? null
            : {
                route: loadedRoute?.route ?? null,
                direction,
                // The full sequence, not the deduped pins: a route that calls
                // at a stop twice has two rows and one marker.
                stops: routeStopsInOrder,
                directionCount: loadedRoute?.directions.length ?? 0,
                busLayer,
                onFlip: flipRoute,
                onLeave: leaveRoute,
              }
        }
      />

      {/*
        Last, so it covers the sheet as well as the map. A fullscreen search
        with the sheet's rows legible under it would be two lists at once.
      */}
      {searching ? (
        <SearchOverlay
          onClose={() => setSearching(false)}
          onSelectStop={selectFromSearch}
          onSelectRoute={openRouteFromSearch}
          onSelectAddress={searchAddress}
          tabBarOverlap={tabBarOverlap}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  prompt: {
    position: 'absolute',
    left: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    opacity: 0.95,
  },
  promptText: { fontSize: 13, lineHeight: 18 },
  recenter: {
    position: 'absolute',
    // The same constants the compass lines itself up against, so the two
    // cannot drift apart by editing one of them.
    right: CONTROL_EDGE_INSET,
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterGlyph: { fontSize: 22, lineHeight: 26 },
  // Sized from `PILL`, not by eye — this and the route pill are meant to look
  // like the same object and were a couple of points apart.
  searchArea: {
    position: 'absolute',
    alignSelf: 'center',
    height: PILL.height,
    justifyContent: 'center',
    paddingHorizontal: PILL.paddingHorizontal,
    borderRadius: PILL.radius,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchAreaText: { fontSize: PILL.fontSize, fontWeight: '600' },
});
