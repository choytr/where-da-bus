import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { type LongPressEvent, type MarkerPressEvent } from 'react-native-maps';
import type BottomSheet from '@gorhom/bottom-sheet';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useAnchoredStops } from './useAnchoredStops';
import { StopMarker } from './StopMarker';
import { PendingMarker } from './PendingMarker';
import {
  centredOn,
  hasDriftedFrom,
  regionAround,
  visibleCentre,
  type Region,
} from './region';
import { StopSheet, FULL_DETENT, MEDIUM_DETENT, PEEK_DETENT, visibleAbove } from './StopSheet';
import { useStopQueries, NEARBY_RADIUS_METERS } from '../../data/gtfs/db';
import {
  addFavorite,
  loadFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import type { TheBusClient } from '../../data/thebus';
import { useTheme } from '../../lib/theme';
import type { RouteSummary, StopWithDistance } from '../../data/gtfs/types';
import type { Coords } from '../../lib/distance';

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

const RECENTRE_LABEL = 'Centre on my location';
const SETTINGS_LABEL = 'Turn on location in Settings';

/**
 * One line per way of having no location, and none of them a dead end.
 *
 * Denial is the one that matters. iOS shows its dialog once per install, so
 * after a refusal `requestForegroundPermissionsAsync` returns `denied` without
 * asking anything, and a button that silently did nothing forever is how ⌖
 * used to behave. It now opens Settings, and this says so.
 */
const LOCATION_PROMPT = 'Showing downtown Honolulu. Tap ⌖ to use your location.';
const LOCATION_DENIED = 'Location is off for this app. Tap ⌖ to turn it on in Settings.';
const LOCATION_ERROR = 'Could not get your location. Tap ⌖ to try again.';
const SEARCH_AREA_LABEL = 'Search this area';

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
 * How far below the safe area the two map controls sit.
 *
 * It was `+ 64`, which put them ~123 pt down a Dynamic Island phone and read as
 * floating in the middle of the map — observed 2026-08-08. The 64 was reserving
 * room for the location banner, which mounts only while there is no fix to
 * show. Reserving it unconditionally paid for an absent view on every launch.
 *
 * The banner now pushes the controls down itself, so the common case is tight
 * to the safe area and the rare case still does not collide.
 */
const CONTROL_INSET = 12;
/** Cleared only when the banner is actually up. Its height plus its gap. */
const BANNER_ALLOWANCE = 52;

/** Long enough to read as travel rather than a cut, short enough not to wait. */
const CAMERA_MS = 350;

export type MapScreenProps = {
  /**
   * Read from `useTheBus()` by the route and handed down, rather than read
   * here. Keeping the screen a plain function of its props is what lets its
   * test drive it with a stub client and no provider.
   */
  client: TheBusClient;
};

export function MapScreen({ client }: MapScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const {
    anchor,
    region,
    source,
    stops,
    status,
    setAnchor,
    recentre,
    requestLocation,
    locationStatus,
  } = useAnchoredStops();
  const { routesForStops } = useStopQueries();

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
   * The anchor the drift offer belongs to, or null. Storing *which* anchor
   * rather than a bare flag is what makes the offer sticky without making it
   * stuck: it stands until the anchor moves, and moving the anchor is the only
   * thing that can answer it.
   */
  const [offeredFor, setOfferedFor] = useState<Coords | null>(null);
  /** A fix is in flight, so ⌖ says so rather than looking inert. */
  const [locating, setLocating] = useState(false);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(new Map());
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
      // Against the *visible* centre, not the window's — the window's centre is
      // under the sheet on purpose, see `regionAround`.
      if (hasDriftedFrom(anchor, region, DRIFT_FRACTION, visibleAbove(detent))) {
        setOfferedFor(anchor);
      }
    },
    [anchor, detent],
  );

  /**
   * Offered rather than taken: the stops on screen are still the ones the
   * anchor found, and they stay that way until a rider says otherwise. Any
   * anchor move — this button, a long press, ⌖ — retires the offer, because
   * `anchor` is a fresh object each time it moves.
   */
  const offering = offeredFor === anchor;

  /**
   * **Not** the centring mechanism — `regionAround` does that, and says why.
   * On Apple Maps this prop becomes the view's `layoutMargins`, which is what
   * positions the compass and Apple's own legal label. Setting it keeps that
   * label out from under the sheet, and nothing else.
   */
  /**
   * The sheet's top edge, tracked while it moves rather than after it lands.
   *
   * Written by the sheet every frame; mirrored into React state so `mapPadding`
   * — an ordinary prop on a native view, not an animatable one — can follow it.
   * Rounded to whole points so a drag sets state a few dozen times rather than
   * on every sub-pixel change.
   */
  const sheetTop = useSharedValue(0);
  const [sheetTopPoints, setSheetTopPoints] = useState<number | null>(null);

  useAnimatedReaction(
    () => Math.round(sheetTop.value),
    (top, previous) => {
      if (top !== previous) runOnJS(setSheetTopPoints)(top);
    },
  );

  const mapPadding = useMemo(
    () => ({
      top: 0,
      left: 0,
      right: 0,
      // Falls back to the settled detent until the sheet has reported a
      // position at all, which is the first frame and every test that doubles
      // the sheet away.
      bottom:
        sheetTopPoints === null
          ? Math.round(windowHeight * (1 - visibleAbove(detent)))
          : Math.max(0, Math.round(windowHeight - sheetTopPoints)),
    }),
    [windowHeight, detent, sheetTopPoints],
  );

  /**
   * The camera moves in exactly three situations: a ⌖ recentre, the first time
   * the anchor turns out to be the rider's own location, and a *Search here*
   * taken up from a long press. Nowhere else — not on selection, not on a poll,
   * and not on *Search this area*.
   *
   * The first two *frame*, rebuilding the window from the query radius, because
   * both are the map being opened on somewhere. The third only *pans* — see
   * `panTo`.
   *
   * This used to be an effect on the memoised `region`, which made *every*
   * anchor change a camera move. That is no longer expressible: the anchor now
   * moves in cases where the camera must not, so the rule is stated here
   * instead of emerging from a dependency array. Each of the three is one
   * explicit call, which is what keeps a fourth from appearing by accident.
   */
  const frameOn = useCallback(
    (center: Coords) => {
      map.current?.animateToRegion(
        regionAround(center, NEARBY_RADIUS_METERS, visibleAbove(detent)),
        CAMERA_MS,
      );
    },
    [detent],
  );

  /**
   * Travel without zooming: the window keeps the spans it already has and only
   * its centre moves. `frameOn` rebuilds the window from the query radius,
   * which is right for opening the map on somewhere and wrong for going to a
   * point on a street a rider has already zoomed into.
   */
  const panTo = useCallback(
    (center: Coords) => {
      // `camera` is null only before the map has ever reported a region, in
      // which case what is on screen is `initialRegion` — so its spans are the
      // ones to preserve.
      const base = camera ?? region;
      map.current?.animateToRegion(centredOn(base, center, visibleAbove(detent)), CAMERA_MS);
    },
    [camera, region, detent],
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

  useEffect(() => {
    const ids = stops.map((stop) => stop.stop_id);
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
  }, [stops, routesForStops]);

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
   */
  const select = useCallback(
    (stop: StopWithDistance) => {
      setSelectedStop(stop);
      if (detent < MEDIUM_DETENT) sheet.current?.snapToIndex(MEDIUM_DETENT);
    },
    [detent],
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
  }, []);

  /**
   * A long press does not search. It drops a marker and offers to, so a stray
   * one costs a dismissal rather than the whole view — and so the gesture is
   * cancellable after it has fired, which a long press that searched could not
   * be.
   */
  const onMapLongPress = useCallback((event: LongPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setPending({ lat: latitude, lon: longitude });
  }, []);

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
    searchFrom(visibleCentre(camera, visibleAbove(detent)));
  }, [camera, detent, searchFrom]);

  const onPinPress = useCallback(
    (stop: StopWithDistance, event: MarkerPressEvent) => {
      // Without this the press also reaches `MapView`'s `onPress`, and the tap
      // that selected a stop dismisses it again in the same gesture.
      event.stopPropagation();
      select(stop);
    },
    // `select` reads the settled detent, so a stale copy here would be a copy
    // that thinks the sheet is still at peek — and would lower it.
    [select],
  );

  const openRoute = useCallback((route: RouteSummary) => {
    router.push(`/route/${encodeURIComponent(route.route_id)}`);
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
  const onRecentre = useCallback(async () => {
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
      const coords = await recentre();
      if (coords !== null) frameOn(coords);
    } finally {
      setLocating(false);
    }
  }, [locationStatus, recentre, frameOn]);

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

  const banner =
    locationStatus === 'denied'
      ? LOCATION_DENIED
      : locationStatus === 'error'
        ? LOCATION_ERROR
        : LOCATION_PROMPT;

  /** Whether the banner is on screen, which is what the controls clear. */
  const bannerShowing = source === 'fallback' && locationStatus !== 'loading';
  const controlsTop = insets.top + CONTROL_INSET + (bannerShowing ? BANNER_ALLOWANCE : 0);

  return (
    // No SafeAreaView around the map. A map is one of the few things that
    // should run under the status bar and behind the tab bar; insetting it
    // would leave grey bars top and bottom. What sits *on* it takes the insets.
    <View style={styles.fill}>
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
          showsUserLocation={locationStatus === 'granted'}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          {stops.map((stop) => (
            <StopMarker
              key={stop.stop_id}
              stop={stop}
              selected={selectedStop?.stop_id === stop.stop_id}
              onPress={onPinPress}
            />
          ))}

          {pending === null ? null : <PendingMarker at={pending} onTake={searchHere} />}
        </MapView>
      </View>

      {bannerShowing ? (
        <View
          style={[styles.prompt, { top: insets.top + CONTROL_INSET, backgroundColor: palette.background }]}
        >
          <Text style={[styles.promptText, { color: palette.text }]}>{banner}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        // The label follows what the button will actually do. A ⌖ that opens
        // Settings and announces itself as "centre on my location" is a lie to
        // exactly the riders who most need to be told.
        accessibilityLabel={locationStatus === 'denied' ? SETTINGS_LABEL : RECENTRE_LABEL}
        accessibilityState={{ busy: locating }}
        onPress={onRecentre}
        style={[
          styles.recentre,
          { top: controlsTop, backgroundColor: palette.background, borderColor: palette.border },
        ]}
      >
        {locating ? (
          <ActivityIndicator />
        ) : (
          <Text style={[styles.recentreGlyph, { color: palette.text }]}>⌖</Text>
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
        onSelect={select}
        onBack={clearSelection}
        onToggleFavorite={toggleFavorite}
        onOpenRoute={openRoute}
        onDetentChange={setDetent}
        animatedPosition={sheetTop}
        client={client}
      />
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
  recentre: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentreGlyph: { fontSize: 22, lineHeight: 26 },
  searchArea: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchAreaText: { fontSize: 14, fontWeight: '600' },
});
