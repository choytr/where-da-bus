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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStopQueries } from '../../data/gtfs/db';
import type { Stop } from '../../data/gtfs/types';
import type { TheBusClient } from '../../data/thebus';
import { ArrivalRow } from './ArrivalRow';
import { BoardHeader } from './BoardHeader';
import { Attribution } from '../../lib/Attribution';
import { NOTICES, describe, useArrivalBoard } from './board';
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
  const { searchByCode } = useStopQueries();
  const { sections, board, failure, fetchedAt, loading, refreshing, refresh, now, tick } =
    useArrivalBoard(stopCode, client);

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
          <BoardHeader
            stopName={stop?.stop_name ?? (stopResolved ? NOTICES.unknownStop : ' ')}
            stopCode={stopCode}
            fetchedAt={fetchedAt}
            failure={failure}
            now={tick}
          />
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

      {/*
        Outside the list. It shows whether or not anyone scrolls, and whether or
        not there are arrivals — "no buses coming" is itself the provider's
        answer, so the legend is owed either way.
      */}
      <Attribution />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
