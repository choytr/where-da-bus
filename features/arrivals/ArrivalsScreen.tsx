import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStopQueries } from '../../data/gtfs/db';
import { useLocation } from '../stops/useLocation';
import { formatDistance } from '../stops/StopRow';
import { metersBetween } from '../../lib/distance';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import type { TheBusClient } from '../../data/thebus';
import { ArrivalRow } from './ArrivalRow';
import { BoardHeader } from './BoardHeader';
import { Attribution, LEGEND_GAP } from '../../lib/Attribution';
import { NOTICES, describe, useArrivalBoard } from './board';
import { useReportingTrips } from './reportingBuses';
import { useTheme } from '../../lib/theme';

/**
 * The arrival board for one stop, as its own screen.
 *
 * The board itself — §4's three states, the direction grouping, the two clocks
 * — is `useArrivalBoard`; this file is the host that gives it a `SectionList`,
 * a pull-to-refresh and the whole screen to fail in. The map sheet's card is
 * the other host, and it fails differently: it keeps its header on screen so
 * the back control stays reachable, where this one is free to replace
 * everything with a retry button.
 */

// Re-exported because this screen's tests, and only they, name these constants.
export { NOTICES } from './board';

export type ArrivalsScreenProps = {
  stopCode: string;
  /** Supplied by the route, which reads it from `useTheBus()`. */
  client: TheBusClient;
};

export function ArrivalsScreen({ stopCode, client }: ArrivalsScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { searchByCode, routesForStops } = useStopQueries();
  const { requestIfAllowed } = useLocation();
  // So a row cannot offer a bus the map will not draw. See `reportingBuses.ts`.
  const reportingTrips = useReportingTrips(client, stopCode);
  const { sections, board, failure, fetchedAt, loading, refreshing, refresh, now, tick } =
    useArrivalBoard(stopCode, client);

  const [stop, setStop] = useState<Stop | null>(null);
  const [stopResolved, setStopResolved] = useState(false);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [meters, setMeters] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    setStopResolved(false);
    void searchByCode(stopCode).then((found) => {
      if (!current) return;
      setStop(found);
      setStopResolved(true);
    });
    return () => {
      current = false;
    };
  }, [searchByCode, stopCode]);

  /**
   * The card's meta block, on the screen that had none.
   *
   * Route chips **always** — which routes call here is a fact about the stop
   * and needs no location — and a distance only when one is free to know.
   * `requestIfAllowed` never shows the permission dialog, so a board opened
   * from a deep link is not a screen that asks anyone where they are; it simply
   * says less. `meters === null ? null` is the same shape `StopCard` already
   * uses for the same reason.
   */
  useEffect(() => {
    if (stop === null) return;
    let current = true;

    void routesForStops([stop.stop_id]).then((byStop) => {
      if (current) setRoutes(byStop.get(stop.stop_id) ?? []);
    });

    void requestIfAllowed().then((fix) => {
      if (current && fix !== null) setMeters(metersBetween(fix, stop));
    });

    return () => {
      current = false;
    };
  }, [stop, routesForStops, requestIfAllowed]);

  // Nothing has arrived yet and nothing has failed: the only state in which a
  // spinner is allowed to be the whole screen.
  if (loading && board === null) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator />
        <Text style={[styles.centerText, { color: palette.muted }]}>{NOTICES.loading}</Text>
      </View>
    );
  }

  if (board === null && failure !== null) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={[styles.errorTitle, { color: palette.text }]}>{describe(failure)}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={refresh}
          hitSlop={8}
          style={[styles.retry, { borderColor: palette.border }]}
        >
          <Text style={[styles.retryText, { color: palette.text }]}>{NOTICES.retry}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.background }]}>
      <SectionList
        testID="arrivals-list"
        // `fill` is load-bearing, not cosmetic: without it this list sizes to
        // its content instead of to the screen, its frame ends up equal to its
        // content, and the board stops scrolling. See `StopCard`.
        style={[styles.fill, { backgroundColor: palette.background }]}
        contentContainerStyle={{ paddingBottom: LEGEND_GAP }}
        sections={sections}
        keyExtractor={(arrival) => arrival.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          // Spins only for a pull, never for the 60s poll, and never in place
          // of the list — the times stay readable the whole way through.
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.muted} />
        }
        ListHeaderComponent={
          <View>
            <BoardHeader
              stopName={stop?.stop_name ?? (stopResolved ? NOTICES.unknownStop : ' ')}
              stopCode={stopCode}
              fetchedAt={fetchedAt}
              failure={failure}
              now={tick}
            />

            {/* What a rider uses to tell two stops a block apart apart, and to
                jump to a route this stop is on. The map's card has carried this
                since Increment 3; the screen behind `/stop/[code]` did not. */}
            <View style={styles.meta}>
              {meters === null ? null : (
                <Text style={[styles.metaText, { color: palette.muted }]}>
                  {formatDistance(meters)}
                </Text>
              )}
              <View style={styles.chips}>
                {routes.map((route) => (
                  <Pressable
                    key={route.route_id}
                    accessibilityRole="button"
                    accessibilityLabel={`Route ${route.short_name}`}
                    onPress={() => router.push(`/route/${encodeURIComponent(route.route_id)}`)}
                    hitSlop={6}
                    style={[styles.chip, { backgroundColor: palette.chip }]}
                  >
                    <Text style={[styles.chipText, { color: palette.text }]}>
                      {route.short_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.data.length === 0 ? null : (
            <Text style={[styles.sectionHeader, { color: palette.muted, backgroundColor: palette.section }]}>
              {section.title}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ArrivalRow
            arrival={item}
            now={now}
            stopId={stop?.stop_id ?? null}
            reportingTrips={reportingTrips}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: palette.text }]}>{NOTICES.empty}</Text>
            <Text style={[styles.emptyHint, { color: palette.muted }]}>{NOTICES.emptyHint}</Text>
          </View>
        }
      />

      {/*
        Outside the list. It shows whether or not anyone scrolls, and whether or
        not there are arrivals — "no buses coming" is itself the provider's
        answer, so the legend is owed either way.

        The bottom inset is not decoration. This screen is pushed over the tabs,
        so nothing below it insets anything, and on a device the legend sat in
        the curve of the display with the text touching it — reported
        2026-08-09. `SafeAreaView` is not used here because the list above must
        keep running to the edge.
      */}
      <View style={{ paddingBottom: insets.bottom }}>
        <Attribution />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  meta: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  metaText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { fontSize: 14 },
  errorTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', maxWidth: 320 },
  retry: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  retryText: { fontSize: 15, fontWeight: '600' },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
  },
  empty: { paddingHorizontal: 16, paddingTop: 24, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 14, lineHeight: 20 },
});
