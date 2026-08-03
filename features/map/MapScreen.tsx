import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, MarkerPressEvent, type MapPressEvent } from 'react-native-maps';
import type BottomSheet from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useAnchoredStops } from './useAnchoredStops';
import { StopSheet, MEDIUM_DETENT } from './StopSheet';
import { useStopQueries } from '../../data/gtfs/db';
import {
  addFavorite,
  loadFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import { useTheme } from '../../lib/theme';
import type { RouteSummary, Stop, StopWithDistance } from '../../data/gtfs/types';

/**
 * The map tab: stops around one anchor, as pins and as a list, which are two
 * views of the same set rather than two sets.
 *
 * Tapping the map moves the anchor. Tapping a pin — or a row — selects a stop
 * and shows its next arrivals inline. There is no pan or zoom handler; see
 * `useAnchoredStops` for why that is a decision rather than an omission.
 */

const RECENTRE_LABEL = 'Centre on my location';
const LOCATION_PROMPT = 'Showing downtown Honolulu. Tap ⌖ to use your location.';

export function MapScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { region, source, stops, status, setAnchor, recentre, locationStatus } =
    useAnchoredStops();
  const { routesForStops } = useStopQueries();

  const map = useRef<MapView | null>(null);
  const sheet = useRef<BottomSheet | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(new Map());
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  /**
   * `initialRegion` is read once at mount and ignored afterwards, so moving the
   * camera later has to be imperative. `region` is memoised on the anchor
   * inside `useAnchoredStops`, so this fires exactly when the anchor moves.
   *
   * **Only when the anchor moves.** Not on a refresh, not on a poll, not on a
   * re-render. A camera that re-centres on its own yanks the view out from
   * under someone who is looking at a street two blocks over — see the
   * TheBusLive comparison, where the same lesson is written down as a flag.
   * Here it falls out of the dependency rather than needing one.
   */
  useEffect(() => {
    map.current?.animateToRegion(region, 350);
  }, [region]);

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
   */
  const select = useCallback((stop: Stop) => {
    setSelectedId((current) => (current === stop.stop_id ? null : stop.stop_id));
    sheet.current?.snapToIndex(MEDIUM_DETENT);
  }, []);

  /**
   * A tap on empty map moves the anchor, and clears the selection with it — the
   * stop that was expanded is about to be replaced by a different set, so
   * leaving it selected would keep an arrivals poll running for a stop no
   * longer in the list.
   */
  const onMapPress = useCallback(
    (event: MapPressEvent) => {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      setSelectedId(null);
      setAnchor({ lat: latitude, lon: longitude });
    },
    [setAnchor],
  );

  const onPinPress = useCallback(
    (event: MarkerPressEvent, stop: StopWithDistance) => {
      event.stopPropagation();
      select(stop);
    },
    []
  );

  const openStop = useCallback((stop: Stop) => {
    router.push(`/stop/${encodeURIComponent(stop.stop_code || stop.stop_id)}`);
  }, []);

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

  const onRecentre = useCallback(() => {
    setSelectedId(null);
    recentre();
  }, [recentre]);

  return (
    // No SafeAreaView around the map. A map is one of the few things that
    // should run under the status bar and behind the tab bar; insetting it
    // would leave grey bars top and bottom. What sits *on* it takes the insets.
    <View style={styles.fill}>
      <MapView
        ref={map}
        style={styles.fill}
        initialRegion={region}
        onPress={onMapPress}
        showsUserLocation={locationStatus === 'granted'}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {stops.map((stop) => (
          <Marker
            key={stop.stop_id}
            identifier={stop.stop_id}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            title={stop.stop_name}
            pinColor={selectedId === stop.stop_id ? palette.live : undefined}
            onPress={(event) => onPinPress(event, stop)}
          />
        ))}
      </MapView>

      {source === 'fallback' && locationStatus !== 'loading' ? (
        <View style={[styles.prompt, { top: insets.top + 12, backgroundColor: palette.background }]}>
          <Text style={[styles.promptText, { color: palette.text }]}>{LOCATION_PROMPT}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={RECENTRE_LABEL}
        onPress={onRecentre}
        style={[
          styles.recentre,
          { top: insets.top + 64, backgroundColor: palette.background, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.recentreGlyph, { color: palette.text }]}>⌖</Text>
      </Pressable>

      <StopSheet
        ref={sheet}
        stops={stops}
        status={status}
        routesByStop={routesByStop}
        favoriteIds={favoriteIds}
        selectedId={selectedId}
        onSelect={select}
        onToggleFavorite={toggleFavorite}
        onOpenStop={openStop}
        onOpenRoute={openRoute}
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
});
