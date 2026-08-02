import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStopQueries } from '../../data/gtfs/db';
import type { Stop } from '../../data/gtfs/types';
import type { Arrival, ArrivalsFailure, TheBusClient } from '../../data/thebus';
import { ATTRIBUTION } from '../../lib/legal';
import { ArrivalRow } from './ArrivalRow';
import { ageLabel, serverClockOffset } from './format';
import { useArrivals } from './useArrivals';
import { useNow } from './useNow';

/**
 * The arrival board for one stop.
 *
 * Every message it can end on is a constant, and they are worded so that no
 * two read alike. §4 is explicit that "no buses coming" and "couldn't reach
 * the API" must never look the same, because a rider who cannot tell them
 * apart at a stop at night has no reason to trust the app at all.
 */
export const NOTICES = {
  loading: 'Loading arrivals…',
  empty: 'No buses are due at this stop right now.',
  emptyHint: 'Service may have finished for the night, or this stop may not be in use.',
  unreachable: 'Could not reach the bus service.',
  malformed: 'The bus service sent a reply this app could not read.',
  stale: 'Showing the last times received.',
  retry: 'Try again',
  unknownStop: 'That stop is not in the bundled stop data.',
} as const;

/** How often the countdowns and the age re-render. Independent of the 60s poll. */
const TICK_MS = 10_000;

function describe(failure: ArrivalsFailure): string {
  switch (failure.kind) {
    case 'api':
      // The vendor's own wording. It is terse but accurate, and inventing a
      // friendlier sentence would hide which of several things went wrong.
      return failure.message;
    case 'malformed':
      return NOTICES.malformed;
    case 'unreachable':
      return NOTICES.unreachable;
  }
}

type Section = { title: string; data: Arrival[] };

/**
 * Grouped by direction, chronological within each group — the shape the
 * discontinued DaBus app used, and the one a rider standing on one side of
 * the street needs. 79% of stops sampled serve a single direction, so this is
 * usually one heading over the whole list rather than a real split.
 */
function sectionsByDirection(arrivals: readonly Arrival[]): Section[] {
  const order: string[] = [];
  const grouped = new Map<string, Arrival[]>();

  for (const arrival of arrivals) {
    const existing = grouped.get(arrival.direction);
    if (existing === undefined) {
      order.push(arrival.direction);
      grouped.set(arrival.direction, [arrival]);
    } else {
      existing.push(arrival);
    }
  }

  return order.map((direction) => ({
    title: `Buses traveling ${direction.toLowerCase()}`,
    data: grouped.get(direction) ?? [],
  }));
}

export type ArrivalsScreenProps = {
  stopCode: string;
  /** Injected by tests; the app uses the shared client. */
  client?: TheBusClient;
};

export function ArrivalsScreen({ stopCode, client }: ArrivalsScreenProps) {
  const palette = useColorScheme() === 'dark' ? dark : light;
  const insets = useSafeAreaInsets();
  const { searchByCode } = useStopQueries();
  const { board, failure, fetchedAt, loading, refreshing, refresh } = useArrivals(stopCode, client);
  const tick = useNow(TICK_MS);

  const [stop, setStop] = useState<Stop | null>(null);
  const [stopResolved, setStopResolved] = useState(false);

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
   * Countdowns tick against the device clock so they keep counting between
   * polls, shifted onto the server's clock so a device running fast does not
   * render every arrival as "Arriving".
   */
  const now = useMemo(() => {
    if (board === null || fetchedAt === null) return tick;
    return new Date(tick.getTime() + serverClockOffset(board.serverTime, fetchedAt));
  }, [board, fetchedAt, tick]);

  const sections = useMemo(
    () => (board === null ? [] : sectionsByDirection(board.arrivals)),
    [board],
  );

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
    <SectionList
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      sections={sections}
      keyExtractor={(arrival) => arrival.id}
      stickySectionHeadersEnabled={false}
      refreshControl={
        // Spins only for a pull, never for the 60s poll, and never in place
        // of the list — the times stay readable the whole way through.
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.muted} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {/* The provider's terms require prominent display wherever their
              route and arrival data appears, so it leads this screen too. */}
          <Text style={[styles.attribution, { color: palette.muted }]}>{ATTRIBUTION}</Text>

          <Text style={[styles.stopName, { color: palette.text }]}>
            {stop?.stop_name ?? (stopResolved ? NOTICES.unknownStop : ' ')}
          </Text>
          <Text style={[styles.stopCode, { color: palette.muted }]}>Stop {stopCode}</Text>

          {fetchedAt === null ? null : (
            <Text style={[styles.age, { color: palette.muted }]}>
              Updated {ageLabel(fetchedAt, tick)}
            </Text>
          )}

          {failure === null ? null : (
            // Stale data stays on screen and says so. This is the §4 state
            // that a spinner would otherwise have quietly destroyed.
            <View style={[styles.banner, { backgroundColor: palette.bannerBg }]}>
              <Text style={[styles.bannerText, { color: palette.bannerText }]}>
                {describe(failure)} {NOTICES.stale}
              </Text>
            </View>
          )}
        </View>
      }
      renderSectionHeader={({ section }) =>
        section.data.length === 0 ? null : (
          <Text style={[styles.sectionHeader, { color: palette.muted, backgroundColor: palette.section }]}>
            {section.title}
          </Text>
        )
      }
      renderItem={({ item }) => <ArrivalRow arrival={item} now={now} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: palette.text }]}>{NOTICES.empty}</Text>
          <Text style={[styles.emptyHint, { color: palette.muted }]}>{NOTICES.emptyHint}</Text>
        </View>
      }
    />
  );
}

const light = {
  background: '#ffffff',
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
  section: '#f5f6f7',
  bannerBg: '#fdf0e3',
  bannerText: '#8a4b08',
};

const dark = {
  background: '#101314',
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
  section: '#171c1e',
  bannerBg: '#3a2a14',
  bannerText: '#f0c48a',
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { fontSize: 14 },
  errorTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', maxWidth: 320 },
  retry: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  retryText: { fontSize: 15, fontWeight: '600' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  attribution: { fontSize: 11, lineHeight: 15, marginBottom: 10 },
  stopName: { fontSize: 20, fontWeight: '700' },
  stopCode: { fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  age: { fontSize: 12, marginTop: 6, fontVariant: ['tabular-nums'] },
  banner: { marginTop: 10, padding: 10, borderRadius: 8 },
  bannerText: { fontSize: 13, lineHeight: 18 },
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
