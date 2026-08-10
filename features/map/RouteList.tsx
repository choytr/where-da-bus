import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTheme } from '../../lib/theme';
import { showRowMenu } from '../../lib/rowMenu';
import { LEGEND_GAP } from '../../lib/Attribution';
import type { Stop, StopWithDistance } from '../../data/gtfs/types';

/**
 * The route's stops, in the order it serves them — the sheet's third mode,
 * beside the nearby list and the stop card.
 *
 * Rows show the sequence number rather than a distance, matching
 * `features/routes/RouteScreen.tsx`. A route's stop list is a *sequence*: the
 * eighth stop being 400 m away says nothing a rider wants at that moment, while
 * its position in the run is the whole reason they are looking.
 */

export const NOTICES = {
  noStops: 'No stops are recorded for this direction.',
} as const;

export type RouteListProps = {
  stops: readonly StopWithDistance[];
  /** Highlighted, so a rider can see where the card they just closed came from. */
  selectedStopId: string | null;
  onSelect: (stop: StopWithDistance) => void;
  /** The favorited stop ids, as the sheet already holds them. */
  favorites: readonly string[];
  onToggleFavorite: (stopId: string) => void;
};

export function RouteList({
  stops,
  selectedStopId,
  onSelect,
  favorites,
  onToggleFavorite,
}: RouteListProps) {
  const { palette } = useTheme();

  const renderItem = useCallback(
    ({ item, index }: { item: StopWithDistance; index: number }) => (
      <RouteStopRow
        stop={item}
        seq={index + 1}
        selected={item.stop_id === selectedStopId}
        favorite={favorites.includes(item.stop_id)}
        onPress={onSelect}
        onToggleFavorite={onToggleFavorite}
      />
    ),
    [selectedStopId, onSelect, favorites, onToggleFavorite],
  );

  return (
    <BottomSheetFlatList
      testID="route-stops"
      // Load-bearing, and only half the story: a scroll view that is a flex
      // child sizes to its *content* without it — but `flex: 1` bounds a child
      // against its parent only if the parent is bounded too, which is what
      // `StopSheet`'s `maxContentHeight` is about.
      style={styles.fill}
      data={stops}
      // Not `stop.stop_id` alone: eight route/directions serve the same stop
      // twice, and this list shows one row per call rather than one per stop.
      // `RouteScreen` keys its own copy of this list the same way.
      keyExtractor={(stop, index) => `${stop.stop_id}-${index}`}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: palette.muted }]}>{NOTICES.noStops}</Text>
        </View>
      }
    />
  );
}

function RouteStopRow({
  stop,
  seq,
  selected,
  favorite,
  onPress,
  onToggleFavorite,
}: {
  stop: StopWithDistance;
  seq: number;
  selected: boolean;
  favorite: boolean;
  onPress: (stop: StopWithDistance) => void;
  onToggleFavorite: (stopId: string) => void;
}) {
  const { palette } = useTheme();

  /**
   * **No *show stop on map* here** — the rider is already looking at the map,
   * and the pin for this stop is on it. What the sheet's route list cannot do
   * with a tap is open the arrivals *screen*, since a tap opens the card, and
   * it cannot favorite at all.
   */
  const openMenu = () =>
    void showRowMenu([
      { label: 'Open arrivals', run: () => onPress(stop) },
      {
        label: favorite ? 'Remove from favorites' : 'Add to favorites',
        run: () => onToggleFavorite(stop.stop_id),
      },
    ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Stop ${seq}, ${stop.stop_name}`}
      accessibilityState={{ selected }}
      onPress={() => onPress(stop)}
      onLongPress={openMenu}
      style={[
        styles.row,
        { borderBottomColor: palette.border },
        selected && { backgroundColor: palette.section },
      ]}
    >
      <Text style={[styles.seq, { color: palette.muted }]}>{seq}</Text>
      <View style={styles.main}>
        <Text style={[styles.name, { color: palette.text }]}>{stop.stop_name}</Text>
        <Text style={[styles.code, { color: palette.muted }]}>
          Stop {codeOf(stop)}
        </Text>
      </View>
    </Pressable>
  );
}

/** The number on the physical sign, falling back to the id where the feed has none. */
function codeOf(stop: Stop): string {
  return stop.stop_code || stop.stop_id;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: LEGEND_GAP },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  seq: { width: 26, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  main: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  code: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  empty: { paddingHorizontal: 16, paddingTop: 8 },
  emptyText: { fontSize: 14, lineHeight: 20 },
});
