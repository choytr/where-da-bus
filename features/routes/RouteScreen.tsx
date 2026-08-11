import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStopQueries, type RouteDirection } from '../../data/gtfs/db';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import { Attribution, LEGEND_GAP } from '../../lib/Attribution';
import { showRowMenu } from '../../lib/rowMenu';
import { showOnMap } from '../map/showOnMap';
import { useTheme } from '../../lib/theme';

/**
 * One route, and every stop it serves in order.
 *
 * Entirely offline. Which stops a route serves is exactly the kind of thing
 * the bundled GTFS asset is for — it does not change minute to minute, so
 * asking the network for it would spend a request on an answer that is
 * already on the device. Only the *times* need the API.
 */
export const NOTICES = {
  loading: 'Loading route…',
  unknownRoute: 'That route is not in the bundled route data.',
  noStops: 'No stops are recorded for this route.',
} as const;

/**
 * This screen is a list of names and a sequence; the map is where a route has a
 * *shape*. Until now the only way from one to the other was the route search's
 * long-press menu, which is a strange place to have to go back to when you are
 * already looking at the route.
 */
export const SHOW_ON_MAP_LABEL = 'Show route on map';

type Section = { title: string; data: Stop[] };

/**
 * Directions are labelled by where they end up, not by the feed's `0` and `1`.
 *
 * GTFS never says which of those is which, and "Direction 0" tells a rider
 * nothing. The last stop in the sequence is the destination, which is the same
 * thing the headsign on the front of the bus would say.
 */
function sectionsFor(directions: RouteDirection[]): Section[] {
  return directions
    .filter((direction) => direction.stops.length > 0)
    .map((direction) => ({
      title: `Toward ${direction.stops[direction.stops.length - 1]?.stop_name}`,
      data: direction.stops,
    }));
}

export function RouteScreen({ routeId }: { routeId: string }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { routeById, routeStops } = useStopQueries();

  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [directions, setDirections] = useState<RouteDirection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void Promise.all([routeById(routeId), routeStops(routeId)]).then(([found, runs]) => {
      if (!current) return;
      setRoute(found);
      setDirections(runs);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [routeById, routeStops, routeId]);

  const sections = useMemo(() => sectionsFor(directions), [directions]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator />
        <Text style={[styles.centerText, { color: palette.muted }]}>{NOTICES.loading}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.background }]}>
      <SectionList
        testID="route-stops"
        // Load-bearing; see `StopCard`. A long route is exactly the list that
        // needs to scroll and exactly the one that would not.
        style={[styles.fill, { backgroundColor: palette.background }]}
        contentContainerStyle={{ paddingBottom: LEGEND_GAP }}
        sections={sections}
        keyExtractor={(stop, index) => `${stop.stop_id}-${index}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.routeName, { color: palette.text }]}>
              {route === null ? NOTICES.unknownRoute : `Route ${route.short_name}`}
            </Text>
            {route === null ? null : (
              <Text style={[styles.routeLong, { color: palette.muted }]}>{route.long_name}</Text>
            )}
            {route === null ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={SHOW_ON_MAP_LABEL}
                onPress={() => showOnMap({ kind: 'route', routeId: route.route_id })}
                style={[styles.showOnMap, { borderColor: palette.border }]}
              >
                {/* The line's own colour, matching the map's route pill, so the
                    two read as the same idea in two places. */}
                <View style={[styles.dash, { backgroundColor: palette.route }]} />
                <Text style={[styles.showOnMapText, { color: palette.text }]}>
                  {SHOW_ON_MAP_LABEL}
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.sectionHeader,
              { color: palette.muted, backgroundColor: palette.section },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Arrivals at ${item.stop_name}`}
            onPress={() =>
              router.push(`/stop/${encodeURIComponent(item.stop_code || item.stop_id)}`)
            }
            // The same menu every other stop row in the app carries. A tap here
            // opens arrivals, so the map is what the long press is for.
            onLongPress={() =>
              void showRowMenu([
                {
                  label: 'Show stop on map',
                  run: () => showOnMap({ kind: 'stop', stopId: item.stop_id }),
                },
              ])
            }
            style={[styles.row, { borderBottomColor: palette.border }]}
          >
            <Text style={[styles.seq, { color: palette.muted }]}>{index + 1}</Text>
            <View style={styles.rowMain}>
              <Text style={[styles.stopName, { color: palette.text }]}>{item.stop_name}</Text>
              <Text style={[styles.stopCode, { color: palette.muted }]}>
                Stop {item.stop_code || item.stop_id}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          route === null ? null : (
            <Text style={[styles.empty, { color: palette.muted }]}>{NOTICES.noStops}</Text>
          )
        }
      />

      {/* Outside the list, so it shows without a scroll. See lib/Attribution.tsx.
          The bottom inset clears the curve of the display; see `ArrivalsScreen`. */}
      <View style={{ paddingBottom: insets.bottom }}>
        <Attribution />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { fontSize: 14 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  routeName: { fontSize: 20, fontWeight: '700' },
  routeLong: { fontSize: 14, marginTop: 2 },
  showOnMap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  showOnMapText: { fontSize: 14, fontWeight: '600' },
  dash: { width: 14, height: 3, borderRadius: 2 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  seq: { width: 26, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  rowMain: { flex: 1 },
  stopName: { fontSize: 15, fontWeight: '600' },
  stopCode: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  empty: { paddingHorizontal: 16, paddingTop: 24, fontSize: 14 },
});
